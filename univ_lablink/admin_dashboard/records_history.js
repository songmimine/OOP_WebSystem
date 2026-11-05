(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var rows = [];
  var query = "";
  var filter = document.getElementById("history-status");

  function render() {
    var visible = rows.filter(function (row) {
      var searchText = [row.transactionId, row.userId, row.userName, admin.itemSummary(row.items, "borrowed"), row.status].join(" ").toLowerCase();
      return (!filter.value || row.status === filter.value) && (!query || searchText.indexOf(query.toLowerCase()) !== -1);
    });
    document.getElementById("history-rows").innerHTML = visible.length ? visible.map(function (row) {
      return "<tr><td><strong>" + admin.escape(row.transactionId) + "</strong></td><td>" + admin.escape(row.userId) + "</td><td>" +
        admin.escape(row.userName) + "</td><td>" + row.items.map(function (item) {
          return admin.escape(item.name) + " · " + item.borrowed + " borrowed / " + item.returned + " returned" + (item.lost ? " / " + item.lost + " lost" : "");
        }).join("<br>") + "</td><td>" + admin.formatDate(row.borrow) + "</td><td>" + admin.formatDate(row.due) + "</td><td>" +
        admin.formatDate(row.actualReturn) + "</td><td>" + admin.status(row.status) + "</td></tr>";
    }).join("") : '<tr><td colspan="8" class="history-empty">' + (query || filter.value ? "No records match these filters." : "No returns or completed cases have been recorded yet.") + "</td></tr>";
  }

  function load() {
    admin.api("/api/history").then(function (data) { rows = data.items || []; render(); }).catch(function (error) { admin.toast(error.message, true); });
  }
  document.getElementById("history-search").addEventListener("input", function (event) { query = event.target.value; render(); });
  filter.addEventListener("change", render);
  admin.bindSearch(function (value) { query = value; document.getElementById("history-search").value = value; render(); });
  document.addEventListener("lablink:admin-refresh", load);
  load();
})();
