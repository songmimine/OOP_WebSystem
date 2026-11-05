(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var searchQuery = "";

  function render(data) {
    var stats = data.stats;
    var cards = [
      ["Equipment listed", stats.equipment],
      ["Available items", stats.available],
      ["Pending requests", stats.pending],
      ["Units currently borrowed", stats.borrowed],
      ["Overdue transactions", stats.overdue]
    ];
    document.getElementById("dashboard-stats").innerHTML = cards.map(function (card) {
      return '<div class="portal-stat"><strong>' + admin.escape(card[1]) + '</strong><span>' + admin.escape(card[0]) + "</span></div>";
    }).join("");

    var pending = admin.filterRows(data.pendingRequests || [], searchQuery, ["id", "studentName", "studentNumber", "purpose", "department"]);
    document.getElementById("dashboard-pending").innerHTML = pending.length ? pending.map(function (row) {
      return "<tr><td><a href=\"borrow_requests/borrow_requests.html\">" + admin.escape(row.id) + "</a></td><td>" + admin.escape(row.studentName) +
        '<br><span class="portal-muted">' + admin.escape(row.studentNumber) + "</span></td><td>" +
        admin.itemSummary(row.items) + "</td><td>" + admin.formatDate(row.borrow, { month: "short", day: "numeric" }) +
        " – " + admin.formatDate(row.returnBy, { month: "short", day: "numeric", year: "numeric" }) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="portal-muted">' + (searchQuery ? "No matching requests." : "No pending requests.") + "</td></tr>";

    var returns = admin.filterRows(data.upcomingReturns || [], searchQuery, ["studentName", "studentNumber", "purpose", "id"]);
    returns.sort(function (a, b) { return String(a.returnBy).localeCompare(String(b.returnBy)); });
    document.getElementById("dashboard-returns").innerHTML = returns.length ? returns.slice(0, 8).map(function (row) {
      var isOverdue = row.status === "overdue";
      return "<tr><td>" + admin.escape(row.studentName) + "</td><td>" + admin.itemSummary(row.items.filter(function (item) { return item.outstanding > 0; }), "outstanding") +
        "</td><td>" + admin.formatDate(row.returnBy) + '</td><td class="' + (isOverdue ? "dashboard-overdue" : "") + '">' +
        admin.escape(row.status.replace(/_/g, " ")) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="portal-muted">' + (searchQuery ? "No matching transactions." : "No active borrowing transactions.") + "</td></tr>";

    document.getElementById("dashboard-activity").innerHTML = (data.recentActivity || []).length ? data.recentActivity.map(function (item) {
      var label = item.equipment ? item.name + " released " + item.equipment : item.name + " submitted a request";
      return '<li class="portal-list-item"><div><h3>' + admin.escape(label) + '</h3><p>' + admin.escape(item.id) + " · " + admin.escape(item.status) +
        "</p></div><span class=\"portal-muted\">" + admin.formatDate(item.date) + "</span></li>";
    }).join("") : '<li class="portal-muted">No request or release activity has been recorded.</li>';
  }

  function load() {
    admin.api("/api/dashboard").then(render).catch(function (error) {
      admin.toast(error.message, true);
      document.getElementById("dashboard-stats").innerHTML = '<div class="portal-note">Dashboard data could not be loaded.</div>';
    });
  }

  admin.bindSearch(function (query) { searchQuery = query; load(); });
  document.addEventListener("lablink:admin-refresh", load);
  load();
})();
