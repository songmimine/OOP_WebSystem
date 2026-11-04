(function () {
  "use strict";
  var app = document.getElementById("admin-app");
  var store = window.LabLinkStore;
  var page = document.body.getAttribute("data-admin-page");
  var root = new URL("../", document.currentScript.src);
  var searchQuery = "";
  var selectedStatus = new URLSearchParams(window.location.search).get("status") || "all";

  function path(relative) { return new URL(relative, root).href; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function session() {
    try { return JSON.parse(localStorage.getItem("lablink_session") || sessionStorage.getItem("lablink_session") || "null"); }
    catch (error) { return null; }
  }
  var signedIn = session();
  if (!signedIn || signedIn.role !== "admin") {
    window.location.replace(path("index.html"));
    return;
  }
  function currentPage() { return page; }
  function shell(content) {
    var links = [
      ["dashboard", "Dashboard", "admin_dashboard/admin_dashboard.html"],
      ["inventory", "Equipment Management", "admin_dashboard/inventory_records/inventory_records.html"],
      ["requests", "Borrowing Requests", "admin_dashboard/borrow_requests/borrow_requests.html"],
      ["returns", "Return Management", "admin_dashboard/return_confirmation/return_confirmation.html"],
      ["records", "Records & History", "admin_dashboard/records_history.html"],
      ["directory", "User Directory", "admin_dashboard/user_directory.html"],
      ["settings", "Settings", "admin_dashboard/settings.html"]
    ];
    app.innerHTML =
      '<div class="admin-shell"><aside class="admin-sidebar"><a class="admin-brand" href="' + path("admin_dashboard/admin_dashboard.html") + '">' +
      '<span class="admin-brand-mark">L</span><span><strong>University LabLink</strong><small>Equipment System</small></span></a>' +
      '<nav class="admin-nav" aria-label="Admin navigation">' + links.map(function (link) {
        return '<a class="' + (currentPage() === link[0] ? "is-active" : "") + '" href="' + path(link[2]) + '">' + link[1] + "</a>";
      }).join("") + '</nav><a class="admin-signout" href="' + path("index.html") + '" data-logout>Log out</a></aside>' +
      '<div class="admin-main"><header class="admin-topbar"><strong>Lyceum of the Philippines University · Cavite</strong>' +
      '<span>Administrator workspace</span></header><main class="admin-content">' + content + '</main></div></div>' +
      '<div class="portal-modal-backdrop" id="admin-modal" hidden><section class="portal-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">' +
      '<h2 id="admin-modal-title"></h2><div id="admin-modal-body"></div><div class="portal-actions" style="margin-top:20px">' +
      '<button class="portal-button portal-button--secondary" type="button" data-modal-close>Close</button></div></section></div>' +
      '<p class="portal-toast" id="admin-toast" role="status" hidden></p>';
    app.querySelector("[data-logout]").addEventListener("click", function () {
      localStorage.removeItem("lablink_session");
      sessionStorage.removeItem("lablink_session");
    });
    app.querySelector(".admin-topbar").insertAdjacentHTML("beforeend",
      '<form class="portal-toolbar" id="admin-search-form" style="margin:0"><input type="search" aria-label="Search current page" placeholder="Search..." value="' + esc(searchQuery) + '"><button class="portal-button portal-button--small" type="submit">Search</button></form>');
    app.querySelector("#admin-search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      searchQuery = event.currentTarget.querySelector("input").value.trim().toLowerCase();
      render();
    });
    app.querySelector("[data-modal-close]").addEventListener("click", function () { app.querySelector("#admin-modal").hidden = true; });
  }
  function toast(message, error) {
    var el = app.querySelector("#admin-toast");
    el.textContent = message;
    el.classList.toggle("portal-toast--error", !!error);
    el.hidden = false;
    window.clearTimeout(el._timer);
    el._timer = window.setTimeout(function () { el.hidden = true; }, 2800);
  }
  function modal(title, body) {
    app.querySelector("#admin-modal-title").textContent = title;
    app.querySelector("#admin-modal-body").innerHTML = body;
    app.querySelector("#admin-modal").hidden = false;
  }
  function statusPill(status) {
    var label = { pending: "Pending Approval", approved: "Approved", rejected: "Rejected", active: "Borrowed", return_requested: "Return Requested", returned: "Returned" }[status] || status;
    var cls = status === "pending" || status === "return_requested" ? "portal-pill--pending" : status === "rejected" ? "portal-pill--rejected" : status === "returned" ? "portal-pill--returned" : "";
    return '<span class="portal-pill ' + cls + '">' + esc(label) + "</span>";
  }
  function requestRows(statusFilter) {
    return store.requests().filter(function (request) {
      var matchesStatus = statusFilter === "all" || request.status === statusFilter;
      var text = (request.id + " " + request.studentName + " " + request.purpose + " " + request.items.map(function (item) { return item.name; }).join(" ")).toLowerCase();
      return matchesStatus && (!searchQuery || text.indexOf(searchQuery) !== -1);
    });
  }
  function requestTable(requests, actions) {
    if (!requests.length) return '<div class="portal-empty"><h2>No requests found</h2><p>Requests created from the student demo will appear here.</p></div>';
    return '<div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Reference</th><th>Student</th><th>Equipment</th><th>Borrow / return</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
      requests.map(function (request) {
        var items = request.items.map(function (item) { return item.qty + " × " + item.name; }).join(", ");
        var buttons = actions(request);
        return '<tr><td>' + esc(request.id) + '</td><td>' + esc(request.studentName) + '<br><span class="portal-muted">' + esc(request.studentNumber) + '</span></td><td>' + esc(items) +
          '</td><td>' + esc(request.borrow) + " / " + esc(request.extensionDate || request.returnBy) + '</td><td>' + statusPill(request.status) + '</td><td><div class="portal-actions">' + buttons + "</div></td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function dashboard() {
    var requests = store.requests();
    var pending = requests.filter(function (request) { return request.status === "pending"; });
    var approved = requests.filter(function (request) { return request.status === "approved" || request.status === "active"; });
    var rejected = requests.filter(function (request) { return request.status === "rejected"; });
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin overview</p><h1>Good day, Administrator.</h1><p>Review user requests and monitor laboratory equipment activity.</p></div></div>' +
      '<section class="portal-grid"><div class="portal-stat"><strong>' + pending.length + '</strong><span>Pending requests</span></div><div class="portal-stat"><strong>' + approved.length + '</strong><span>Approved / active loans</span></div>' +
      '<div class="portal-stat"><strong>' + rejected.length + '</strong><span>Rejected requests</span></div><div class="portal-stat"><strong>' + store.inventory().length + '</strong><span>Equipment items</span></div></section>' +
      '<section class="portal-card" style="margin-top:20px"><div class="portal-heading"><div><h2>Pending requests for approval</h2><p>Review and decide on newly submitted requests.</p></div><a class="portal-button portal-button--secondary" href="' + path("admin_dashboard/borrow_requests/borrow_requests.html") + '">View all requests</a></div>' +
      requestTable(pending.slice(0, 5), function (request) { return '<button class="portal-button portal-button--small" type="button" data-review="' + esc(request.id) + '">Review</button>'; }) + "</section>";
  }
  function inventoryPage() {
    var items = store.inventory().filter(function (item) {
      return !searchQuery || (item.id + " " + item.name + " " + item.category + " " + item.location).toLowerCase().indexOf(searchQuery) !== -1;
    });
    return '<div class="portal-heading"><div><p class="portal-kicker">Inventory / Management</p><h1>Equipment Inventory Management</h1><p>Manage laboratory equipment, stock levels, categories, and locations.</p></div></div>' +
      '<section class="portal-card"><h2>Add new equipment</h2><form id="inventory-add" class="portal-form-grid" style="margin-top:16px">' +
      '<label class="portal-field"><span class="portal-label">Item name</span><input class="portal-input" name="name" required></label><label class="portal-field"><span class="portal-label">Model / details</span><input class="portal-input" name="detail" required></label>' +
      '<label class="portal-field"><span class="portal-label">Category</span><select class="portal-select" name="category"><option>Equipment & Machines</option><option>Glassware & Containers</option><option>Chemicals & Reagents</option></select></label>' +
      '<label class="portal-field"><span class="portal-label">Location</span><input class="portal-input" name="location" value="Lab 1 · Room S201" required></label>' +
      '<label class="portal-field"><span class="portal-label">Quantity in stock</span><input class="portal-input" name="stock" type="number" min="0" value="1" required></label>' +
      '<label class="portal-field"><span class="portal-label">Unit</span><input class="portal-input" name="unit" value="units" required></label><div><button class="portal-button" type="submit">Add equipment</button></div></form></section>' +
      '<section class="portal-card"><div class="portal-heading"><div><h2>Available equipment</h2><p>Update stock quantities or remove an item.</p></div></div><div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Asset ID</th><th>Item</th><th>Category</th><th>Location</th><th>Stock</th><th>Action</th></tr></thead><tbody>' +
      items.map(function (item) {
        return '<tr><td>' + esc(item.id) + '</td><td>' + esc(item.name) + '<br><span class="portal-muted">' + esc(item.detail) + '</span></td><td>' + esc(item.category) + '</td><td>' + esc(item.location) +
          '</td><td><input class="portal-input" style="width:90px" type="number" min="0" value="' + item.stock + '" data-stock="' + esc(item.id) + '"></td><td><div class="portal-actions"><button class="portal-button portal-button--small" type="button" data-save-stock="' + esc(item.id) + '">Save</button><button class="portal-button portal-button--small portal-button--danger" type="button" data-delete-item="' + esc(item.id) + '">Remove</button></div></td></tr>';
      }).join("") + '</tbody></table></div></section>';
  }
  function requestsPage() {
    var filters = ["all", "pending", "approved", "rejected", "active", "return_requested", "returned"];
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin / Borrowing Requests</p><h1>User Requests Management</h1><p>Review, approve, or reject equipment borrowing applications.</p></div></div>' +
      '<div class="portal-categories">' + filters.map(function (filter) {
        var name = filter === "all" ? "All" : filter.replace("_", " ");
        return '<button class="portal-chip ' + (selectedStatus === filter ? "is-active" : "") + '" type="button" data-filter="' + filter + '">' + name + "</button>";
      }).join("") + "</div>" + requestTable(requestRows(selectedStatus), function (request) {
        var buttons = '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-review="' + esc(request.id) + '">Review</button>';
        if (request.status === "pending") buttons += '<button class="portal-button portal-button--small portal-button--success" type="button" data-approve="' + esc(request.id) + '">Approve</button><button class="portal-button portal-button--small portal-button--danger" type="button" data-reject="' + esc(request.id) + '">Reject</button>';
        return buttons;
      });
  }
  function returnsPage() {
    var requests = store.requests().filter(function (request) {
      return request.status === "active" || request.status === "return_requested" || request.extensionStatus === "pending";
    });
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin / Returns</p><h1>Return Management</h1><p>Inspect returned equipment and confirm its condition before closing a loan.</p></div></div>' +
      requestTable(requests, function (request) {
        var actions = "";
        if (request.extensionStatus === "pending") actions += '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-approve-extension="' + esc(request.id) + '">Approve extension</button>';
        if (request.status === "return_requested") actions += '<button class="portal-button portal-button--small portal-button--success" type="button" data-confirm-return="' + esc(request.id) + '">Approve return</button><button class="portal-button portal-button--small portal-button--danger" type="button" data-damage="' + esc(request.id) + '">Flag damaged</button>';
        if (request.status === "active" && !actions) actions = '<span class="portal-muted">Awaiting user return request</span>';
        return actions;
      });
  }
  function recordsPage() {
    var records = store.records().filter(function (record) {
      return !searchQuery || (record.id + " " + record.studentName + " " + record.action).toLowerCase().indexOf(searchQuery) !== -1;
    });
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin / Records</p><h1>Records &amp; History</h1><p>Review completed returns and equipment condition records.</p></div></div>' +
      (records.length ? '<section class="portal-card"><div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Date</th><th>Reference</th><th>Student</th><th>Equipment</th><th>Action</th><th>Status</th></tr></thead><tbody>' +
        records.map(function (record) { return '<tr><td>' + esc(record.date) + '</td><td>' + esc(record.id) + '</td><td>' + esc(record.studentName) + '</td><td>' + esc(record.items.map(function (item) { return item.qty + " × " + item.name; }).join(", ")) + '</td><td>' + esc(record.action) + '</td><td>' + esc(record.status) + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : '<div class="portal-empty"><h2>No completed records yet</h2><p>Confirmed returns will be recorded here.</p></div>');
  }
  function directoryPage() {
    var users = [];
    try { users = JSON.parse(localStorage.getItem("lablink_directory") || "[]"); } catch (error) { users = []; }
    if (!users.length) users = [
      { name: "Katrina Mendoza", department: "Computer Science", role: "Student", status: "Verified" },
      { name: "Dr. Aris Thome", department: "Engineering", role: "Faculty", status: "Verified" },
      { name: "Elena Cruz", department: "Medical Sciences", role: "Lab administrator", status: "Verified" }
    ];
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin / Directory</p><h1>User and Directory</h1><p>Manage students, faculty, and laboratory administrators in this demo.</p></div></div>' +
      '<section class="portal-card"><form id="directory-add" class="portal-form-grid"><label class="portal-field"><span class="portal-label">Name</span><input class="portal-input" name="name" required></label><label class="portal-field"><span class="portal-label">Department</span><input class="portal-input" name="department" required></label><label class="portal-field"><span class="portal-label">Role</span><select class="portal-select" name="role"><option>Student</option><option>Faculty</option><option>Lab administrator</option></select></label><div><button class="portal-button" type="submit">Add user</button></div></form></section>' +
      '<section class="portal-card"><div class="portal-table-wrap"><table class="portal-table"><thead><tr><th>Name</th><th>Department</th><th>Role</th><th>Status</th></tr></thead><tbody>' +
      users.filter(function (user) { return !searchQuery || (user.name + " " + user.department + " " + user.role).toLowerCase().indexOf(searchQuery) !== -1; }).map(function (user) {
        return "<tr><td>" + esc(user.name) + "</td><td>" + esc(user.department) + "</td><td>" + esc(user.role) + "</td><td>" + esc(user.status || "Verified") + "</td></tr>";
      }).join("") + "</tbody></table></div></section>";
  }
  function settingsPage() {
    var settings = {};
    try { settings = JSON.parse(localStorage.getItem("lablink_settings") || "{}"); } catch (error) { settings = {}; }
    return '<div class="portal-heading"><div><p class="portal-kicker">Admin / Settings</p><h1>Laboratory Information &amp; Settings</h1><p>Manage system-wide policies, contact information, and public portal details.</p></div></div>' +
      '<form class="portal-card" id="settings-form"><div class="portal-form-grid"><label class="portal-field"><span class="portal-label">Lead lab administrator office</span><input class="portal-input" name="office" value="' + esc(settings.office || "Room A201") + '"></label>' +
      '<label class="portal-field"><span class="portal-label">General contact number</span><input class="portal-input" name="phone" value="' + esc(settings.phone || "+63 (046) 437-1250") + '"></label>' +
      '<label class="portal-field"><span class="portal-label">Email address</span><input class="portal-input" name="email" type="email" value="' + esc(settings.email || "admin.labs@lpu.edu.ph") + '"></label>' +
      '<label class="portal-field"><span class="portal-label">Operating hours</span><input class="portal-input" name="hours" value="' + esc(settings.hours || "Mon-Fri 7:00 AM - 6:00 PM | Sat 8:00 AM - 12:00 PM") + '"></label>' +
      '<label class="portal-field"><span class="portal-label">Borrowing rules</span><textarea class="portal-textarea" name="rules">' + esc(settings.rules || "14-day loan period, returns due by 5:00 PM") + '</textarea></label>' +
      '<label class="portal-field"><span class="portal-label">Extension policy</span><textarea class="portal-textarea" name="extension">' + esc(settings.extension || "One 7-day extension per request") + '</textarea></label></div>' +
      '<div class="portal-actions" style="margin-top:18px"><button class="portal-button" type="submit">Save changes</button></div><p id="settings-status" class="portal-note" role="status" hidden></p></form>';
  }
  function render() {
    var content = ({
      dashboard: dashboard,
      inventory: inventoryPage,
      requests: requestsPage,
      returns: returnsPage,
      records: recordsPage,
      directory: directoryPage,
      settings: settingsPage
    }[page] || dashboard)();
    shell(content);
  }
  app.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    try {
      if (button.hasAttribute("data-filter")) {
        selectedStatus = button.getAttribute("data-filter");
        render();
      } else if (button.hasAttribute("data-approve")) {
        store.setStatus(button.getAttribute("data-approve"), "approved");
        toast("Request approved.");
      } else if (button.hasAttribute("data-reject")) {
        store.setStatus(button.getAttribute("data-reject"), "rejected");
        toast("Request rejected.");
      } else if (button.hasAttribute("data-confirm-return")) {
        store.setStatus(button.getAttribute("data-confirm-return"), "returned");
        toast("Return confirmed and inventory updated.");
      } else if (button.hasAttribute("data-damage")) {
        store.setStatus(button.getAttribute("data-damage"), "returned", "damaged");
        toast("Return marked as damaged and recorded.");
      } else if (button.hasAttribute("data-approve-extension")) {
        var extended = store.getRequest(button.getAttribute("data-approve-extension"));
        if (!extended || !extended.extensionDate) throw new Error("This extension request could not be found.");
        extended.extensionStatus = "approved";
        extended.returnBy = extended.extensionDate;
        extended.dueDate = extended.extensionDate;
        store.saveRequest(extended);
        toast("Return extension approved.");
      } else if (button.hasAttribute("data-review")) {
        var request = store.getRequest(button.getAttribute("data-review"));
        if (!request) throw new Error("This request could not be found.");
        modal("Review " + request.id, '<p><strong>Student:</strong> ' + esc(request.studentName) + ' (' + esc(request.studentNumber) + ')</p><p><strong>Department:</strong> ' + esc(request.department) +
          '</p><p><strong>Purpose:</strong> ' + esc(request.purpose) + '</p><p><strong>Dates:</strong> ' + esc(request.borrow) + " to " + esc(request.returnBy) +
          '</p><p><strong>Items:</strong> ' + esc(request.items.map(function (item) { return item.qty + " × " + item.name; }).join(", ")) + "</p><p><strong>Notes:</strong> " + esc(request.notes || "None") + "</p>");
      } else if (button.hasAttribute("data-save-stock")) {
        var id = button.getAttribute("data-save-stock");
        var input = app.querySelector('[data-stock="' + id + '"]');
        var stock = Number(input.value);
        if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number greater than or equal to zero.");
        store.updateInventoryItem(id, { stock: stock });
        toast("Stock quantity saved.");
      } else if (button.hasAttribute("data-delete-item")) {
        var item = store.inventory().filter(function (candidate) { return candidate.id === button.getAttribute("data-delete-item"); })[0];
        if (!item || !window.confirm("Remove " + item.name + " from the inventory?")) return;
        store.removeInventoryItem(item.id);
        toast("Equipment removed.");
      }
    } catch (error) { toast(error.message, true); }
  });
  app.addEventListener("submit", function (event) {
    if (event.target.id === "inventory-add") {
      event.preventDefault();
      var data = new FormData(event.target);
      var name = String(data.get("name") || "").trim();
      if (!name) return toast("Enter an equipment name.", true);
      try {
        store.addInventoryItem({
          name: name,
          detail: String(data.get("detail") || "").trim(),
          category: data.get("category"),
          location: String(data.get("location") || "").trim(),
          stock: Math.max(0, Math.floor(Number(data.get("stock")) || 0)),
          unit: String(data.get("unit") || "units").trim()
        });
        toast("Equipment added to the inventory.");
      } catch (error) { toast(error.message, true); }
    } else if (event.target.id === "directory-add") {
      event.preventDefault();
      var directoryData = new FormData(event.target);
      var users = [];
      try { users = JSON.parse(localStorage.getItem("lablink_directory") || "[]"); } catch (error) { users = []; }
      users.push({ name: String(directoryData.get("name")).trim(), department: String(directoryData.get("department")).trim(), role: directoryData.get("role"), status: "Verified" });
      localStorage.setItem("lablink_directory", JSON.stringify(users));
      toast("User added to the demo directory.");
    } else if (event.target.id === "settings-form") {
      event.preventDefault();
      var settingsData = new FormData(event.target);
      var settings = {};
      settingsData.forEach(function (value, key) { settings[key] = String(value); });
      localStorage.setItem("lablink_settings", JSON.stringify(settings));
      app.querySelector("#settings-status").textContent = "Settings saved in this browser.";
      app.querySelector("#settings-status").hidden = false;
    }
  });
  window.addEventListener("lablink:data-changed", render);
  render();
})();
