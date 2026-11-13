(function () {
  "use strict";
  var store = window.LabLinkStore;
  var form = document.getElementById("request-form");
  var tbody = document.getElementById("selected-items");
  var available = document.getElementById("available-items");
  var noItems = document.getElementById("no-items");
  var toast = document.getElementById("portal-toast");
  var draft = store.draft();
  var timer;
  var queryId = new URLSearchParams(window.location.search).get("id");
  var statusNames = { pending: "Pending approval", approved: "Approved · awaiting equipment release", rejected: "Rejected", active: "Borrowed", overdue: "Overdue", return_requested: "Return submitted for inspection", returned: "Returned", cancelled: "Cancelled", partially_returned: "Partially returned", damaged: "Damaged", lost: "Lost" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function notify(message, error) {
    toast.textContent = message;
    toast.classList.toggle("portal-toast--error", !!error);
    toast.hidden = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { toast.hidden = true; }, 3000);
  }
  function setDraft(items) { draft = items; store.setDraft(items); render(); }
  function selectedQty(id) {
    var entry = draft.filter(function (item) { return item.id === id; })[0];
    return entry ? entry.qty : 0;
  }
  function changeQty(id, delta) {
    var item = store.inventory().filter(function (candidate) { return candidate.id === id; })[0];
    if (!item) return;
    var items = draft.slice();
    var entry = items.filter(function (candidate) { return candidate.id === id; })[0];
    if (!entry && delta > 0) items.push({ id: id, qty: 1 });
    else if (entry) {
      entry.qty = Math.min(item.stock, entry.qty + delta);
      if (entry.qty < 1) items = items.filter(function (candidate) { return candidate.id !== id; });
    }
    setDraft(items);
  }
  function render() {
    var inventory = store.inventory();
    var selectedIds = {};
    tbody.innerHTML = draft.map(function (entry) {
      var item = inventory.find(function (candidate) { return candidate.id === entry.id; });
      if (!item) return "";
      selectedIds[item.id] = true;
      return "<tr><td>" + esc(item.name) + ' <span class="portal-muted">' + esc(item.detail) + "</span></td><td>" + item.stock +
        '</td><td><span class="portal-qty"><button type="button" aria-label="Remove one ' + esc(item.name) + '" data-change="-1" data-id="' + esc(item.id) + '">−</button>' +
        "<output>" + entry.qty + '</output><button type="button" aria-label="Add one ' + esc(item.name) + '" data-change="1" data-id="' + esc(item.id) + '">+</button></span></td>' +
        '<td><button class="portal-button portal-button--small portal-button--secondary" type="button" data-remove="' + esc(item.id) + '">Remove</button></td></tr>';
    }).join("");
    noItems.hidden = draft.length > 0;
    available.innerHTML = inventory.filter(function (item) { return item.stock > 0; }).map(function (item) {
      var added = !!selectedIds[item.id];
      return '<article class="portal-card"><h3>' + esc(item.name) + '</h3><p class="portal-muted">' + esc(item.detail) + " · Available: " + item.stock + '</p>' +
        '<button class="portal-button portal-button--small portal-button--blue" type="button" data-add="' + esc(item.id) + '">' + (added ? "Add one more" : "Add to request") + "</button></article>";
    }).join("");
  }

  function showExisting() {
    var existing = store.getRequest(queryId);
    form.hidden = true;
    document.getElementById("request-view").hidden = false;
    if (!existing) {
      document.getElementById("form-title").textContent = "Request not found";
      document.getElementById("view-request-status").hidden = true;
      document.getElementById("view-request-meta").textContent = "This request could not be found in your account.";
      return;
    }
    document.getElementById("form-title").textContent = "Borrowing Request";
    document.getElementById("view-request-id").textContent = existing.id;
    document.getElementById("view-request-status").textContent = statusNames[existing.status] || existing.status;
    document.getElementById("view-request-meta").textContent = "Submitted " + existing.submitted + " · Borrow " + existing.borrow + " · Return " + existing.returnBy;
    document.getElementById("view-request-items").innerHTML = existing.items.map(function (item) {
      return '<li class="portal-list-item"><div><h3>' + esc(item.name) + " · " + esc(item.detail) + '</h3><p>Quantity requested: ' + item.qty +
        (item.outstanding ? " · Still outstanding: " + item.outstanding : "") + "</p></div></li>";
    }).join("");
  }

  tbody.addEventListener("click", function (event) {
    var button = event.target.closest("[data-change], [data-remove]");
    if (!button) return;
    changeQty(button.getAttribute("data-id") || button.getAttribute("data-remove"), button.hasAttribute("data-remove") ? -999 : Number(button.getAttribute("data-change")));
  });
  available.addEventListener("click", function (event) {
    var button = event.target.closest("[data-add]");
    if (button) changeQty(button.getAttribute("data-add"), 1);
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var button = document.getElementById("submit-request");
    button.disabled = true;
    store.addRequest({
      purpose: document.getElementById("purpose").value.trim(),
      borrow: document.getElementById("borrow-date").value,
      returnBy: document.getElementById("return-date").value,
      notes: document.getElementById("notes").value.trim(),
      items: draft
    }).then(function (request) {
      document.getElementById("success-reference").textContent = request.id;
      document.getElementById("success-modal").hidden = false;
    }).catch(function (error) { notify(error.message, true); }).finally(function () { button.disabled = false; });
  });
  document.getElementById("close-success").addEventListener("click", function () { document.getElementById("success-modal").hidden = true; });
  window.addEventListener("lablink:data-changed", render);

  store.ready.then(function () {
    if (queryId) return showExisting();
    var account = store.currentUser();
    document.getElementById("student-name").value = account.name;
    document.getElementById("student-number").value = account.id;
    document.getElementById("department").value = account.department || "";
    var today = new Date();
    var dateString = function (date) {
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    };
    var todayValue = dateString(today);
    var dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    document.getElementById("borrow-date").value = todayValue;
    document.getElementById("return-date").value = dateString(dueDate);
    document.getElementById("borrow-date").min = todayValue;
    document.getElementById("return-date").min = todayValue;
    render();
  }).catch(function (error) { notify(error.message, true); });
})();
