(function () {
  "use strict";
  var store = window.LabLinkStore;
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var today = new Date();
  var view = { year: today.getFullYear(), month: today.getMonth() };
  var requests = [];
  var eventMap = {};
  var labels = { pending: "Pending", approved: "Approved · awaiting release", active: "Borrowed", overdue: "Overdue", return_requested: "Return submitted", returned: "Returned", rejected: "Rejected", cancelled: "Cancelled", partially_returned: "Partially returned", damaged: "Damaged", lost: "Lost" };

  function byId(id) { return document.getElementById(id); }
  function dateValue(value) {
    if (!value) return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }
  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function formatDate(date) {
    return monthsShort[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function statusLabel(status) { return labels[status] || status.replace(/_/g, " "); }

  function renderUser() {
    var user = store.currentUser();
    byId("dash-name").textContent = user ? user.name : "User";
    if (window.LabLinkHeader && user) window.LabLinkHeader.setUser(user.name, user.role === "user" ? "University User" : user.role);
  }

  function renderStats() {
    var open = requests.filter(function (row) { return ["pending", "approved", "active", "overdue", "return_requested", "partially_returned"].indexOf(row.status) !== -1; });
    var borrowed = requests.reduce(function (total, row) {
      if (["active", "overdue", "return_requested", "partially_returned"].indexOf(row.status) === -1) return total;
      return total + row.items.reduce(function (sum, item) { return sum + item.outstanding; }, 0);
    }, 0);
    var overdue = requests.reduce(function (total, row) {
      return total + (row.status === "overdue" ? row.items.reduce(function (sum, item) { return sum + item.outstanding; }, 0) : 0);
    }, 0);
    var upcoming = deadlines().filter(function (entry) { return entry.diff >= 0; }).length;
    byId("stat-active").textContent = String(open.length);
    byId("stat-return").textContent = String(borrowed);
    byId("stat-upcoming").textContent = String(upcoming);
    byId("stat-overdue").textContent = String(overdue);
  }

  function renderRequests() {
    var open = requests.filter(function (row) { return ["pending", "approved", "active", "overdue", "return_requested", "partially_returned"].indexOf(row.status) !== -1; });
    var list = byId("req-list");
    list.innerHTML = "";
    if (!open.length) {
      list.hidden = true;
      byId("req-empty").hidden = false;
      byId("req-more").hidden = true;
      return;
    }
    byId("req-empty").hidden = true;
    open.slice(0, 5).forEach(function (row) {
      var item = document.createElement("li");
      item.className = "dash-req";
      var body = document.createElement("div");
      body.className = "dash-req-body";
      var title = document.createElement("p");
      title.className = "dash-req-title";
      title.textContent = row.purpose || "Borrow request";
      var detail = document.createElement("p");
      detail.className = "dash-req-meta";
      detail.textContent = row.items.map(function (entry) { return entry.qty + " × " + entry.name; }).join(", ") + (row.returnBy ? " · Due " + row.returnBy.slice(0, 10) : "");
      body.appendChild(title);
      body.appendChild(detail);
      var badge = document.createElement("span");
      badge.className = "dash-badge dash-badge--" + row.status;
      badge.textContent = statusLabel(row.status);
      item.appendChild(body);
      item.appendChild(badge);
      list.appendChild(item);
    });
    list.hidden = false;
    byId("req-more").hidden = open.length <= 5;
  }

  function buildEvents() {
    eventMap = {};
    function add(value, key) {
      var date = dateValue(value);
      if (!date) return;
      var day = dateKey(date);
      eventMap[day] = eventMap[day] || {};
      eventMap[day][key] = true;
    }
    requests.forEach(function (row) {
      if (row.status === "pending") add(row.borrow, "pending");
      else if (row.status === "approved") add(row.borrow, "pickup");
      else if (row.transactionId && row.status !== "returned" && row.status !== "lost") {
        add(row.releaseDate, "pickup");
        add(row.returnBy, "return");
      }
    });
  }

  function renderCalendar() {
    byId("cal-title").textContent = months[view.month] + " " + view.year;
    var body = byId("cal-body");
    body.innerHTML = "";
    var lead = new Date(view.year, view.month, 1).getDay();
    var total = new Date(view.year, view.month + 1, 0).getDate();
    var cells = Math.ceil((lead + total) / 7) * 7;
    var row;
    for (var index = 0; index < cells; index++) {
      if (index % 7 === 0) { row = document.createElement("tr"); body.appendChild(row); }
      var cell = document.createElement("td");
      var number = index - lead + 1;
      if (number >= 1 && number <= total) {
        var date = new Date(view.year, view.month, number);
        var key = dateKey(date);
        var events = eventMap[key] || {};
        cell.setAttribute("data-date", key);
        if (key === dateKey(new Date())) { cell.className = "dash-cal-today"; cell.setAttribute("aria-current", "date"); }
        var day = document.createElement("span");
        day.className = "dash-cal-num";
        day.textContent = String(number);
        cell.appendChild(day);
        var types = ["pickup", "return", "pending"].filter(function (name) { return events[name]; });
        if (types.length) {
          var dots = document.createElement("span");
          dots.className = "dash-dots";
          dots.setAttribute("aria-hidden", "true");
          types.forEach(function (type) {
            var dot = document.createElement("span");
            dot.className = "dash-dot dash-dot--" + type;
            dots.appendChild(dot);
          });
          cell.appendChild(dots);
        }
      }
      row.appendChild(cell);
    }
  }

  function deadlines() {
    var now = new Date();
    var results = [];
    requests.forEach(function (row) {
      if (!row.transactionId || ["active", "overdue", "return_requested", "partially_returned"].indexOf(row.status) === -1 || !row.returnBy) return;
      var due = dateValue(row.returnBy);
      if (!due) return;
      var diff = Math.floor((new Date(due.getFullYear(), due.getMonth(), due.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      if (diff <= 7) results.push({ row: row, date: due, diff: diff });
    });
    return results.sort(function (a, b) { return a.diff - b.diff; }).slice(0, 8);
  }

  function renderDeadlines() {
    var upcoming = deadlines();
    var list = byId("dl-list");
    list.innerHTML = "";
    if (!upcoming.length) {
      list.hidden = true;
      byId("dl-empty").hidden = false;
      return;
    }
    byId("dl-empty").hidden = true;
    upcoming.forEach(function (entry) {
      var item = document.createElement("li");
      item.className = "dash-dl dash-dl--return" + (entry.diff < 0 ? " dash-dl--overdue" : "");
      item.textContent = (entry.diff < 0 ? "Overdue since " : "Due ") + formatDate(entry.date) + " · " + entry.row.id;
      list.appendChild(item);
    });
    list.hidden = false;
  }

  function notificationRows() {
    return requests.filter(function (row) { return ["pending", "approved", "rejected", "return_requested", "returned"].indexOf(row.status) !== -1; }).slice(0, 10);
  }
  function renderNotifications() {
    var items = notificationRows();
    var read = [];
    try { read = JSON.parse(localStorage.getItem("lablink_user_notifications_read") || "[]"); } catch (error) { read = []; }
    var unread = items.filter(function (row) { return read.indexOf(row.id + ":" + row.status) === -1; });
    var badge = byId("fab-badge");
    badge.textContent = String(unread.length);
    badge.hidden = unread.length === 0;
    byId("notif-fab").setAttribute("aria-label", unread.length ? "Notifications, " + unread.length + " unread" : "Notifications");
    byId("notif-markall").disabled = unread.length === 0;
    byId("notif-list").innerHTML = items.map(function (row) {
      return '<li class="dash-notif-item ' + (read.indexOf(row.id + ":" + row.status) === -1 ? "is-unread" : "is-read") + '">' +
        (read.indexOf(row.id + ":" + row.status) === -1 ? '<span class="dash-notif-tag">New</span>' : "") +
        escape(row.id + " · " + statusLabel(row.status)) + "</li>";
    }).join("");
    byId("notif-list").hidden = !items.length;
    byId("notif-empty").hidden = items.length > 0;
    if (window.LabLinkHeader) window.LabLinkHeader.setNotificationCount(unread.length);
  }

  function renderAll() {
    requests = store.requests();
    renderUser();
    renderStats();
    renderRequests();
    buildEvents();
    renderCalendar();
    renderDeadlines();
    renderNotifications();
  }

  byId("cal-prev").addEventListener("click", function () {
    var date = new Date(view.year, view.month - 1, 1);
    view.year = date.getFullYear(); view.month = date.getMonth(); renderCalendar();
  });
  byId("cal-next").addEventListener("click", function () {
    var date = new Date(view.year, view.month + 1, 1);
    view.year = date.getFullYear(); view.month = date.getMonth(); renderCalendar();
  });
  function setPanel(open) {
    byId("notif-panel").hidden = !open;
    byId("notif-fab").setAttribute("aria-expanded", String(open));
    var bell = document.querySelector(".main-system-header .msh-bell");
    if (bell) bell.setAttribute("aria-expanded", String(open));
  }
  byId("notif-fab").addEventListener("click", function () { setPanel(byId("notif-panel").hidden); });
  byId("notif-close").addEventListener("click", function () { setPanel(false); });
  byId("notif-markall").addEventListener("click", function () {
    localStorage.setItem("lablink_user_notifications_read", JSON.stringify(notificationRows().map(function (row) { return row.id + ":" + row.status; })));
    renderNotifications();
  });
  document.addEventListener("click", function (event) {
    if (!byId("notif-panel").hidden && !byId("notif-panel").contains(event.target) && !byId("notif-fab").contains(event.target)) setPanel(false);
  });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") setPanel(false); });
  document.addEventListener("lablink:header-ready", function () {
    renderUser();
    var bell = document.querySelector(".main-system-header .msh-bell");
    if (bell) bell.addEventListener("click", function (event) { event.preventDefault(); setPanel(byId("notif-panel").hidden); });
  });
  window.addEventListener("lablink:data-changed", renderAll);
  store.ready.then(renderAll).catch(function (error) {
    byId("req-empty").hidden = false;
    byId("req-empty").querySelector(".dash-empty-text").textContent = error.message;
  });
})();
