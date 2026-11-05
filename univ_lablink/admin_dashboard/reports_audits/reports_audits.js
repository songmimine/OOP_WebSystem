(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var data = null;
  var query = "";
  var kinds = document.getElementById("report-kind");
  var filter = document.getElementById("report-filter");

  function records() {
    if (!data) return [];
    return data[kinds.value] || [];
  }

  function renderSummary() {
    var summary = data.summary;
    var cards = [
      ["Equipment records", summary.equipment],
      ["Available quantity", summary.available],
      ["Units borrowed", summary.borrowed],
      ["Returned transactions", summary.returnedTransactions],
      ["Overdue transactions", summary.overdue],
      ["Recorded cases", summary.cases]
    ];
    document.getElementById("report-summary").innerHTML = cards.map(function (card) {
      return '<div class="portal-stat"><strong>' + admin.escape(card[1]) + '</strong><span>' + admin.escape(card[0]) + "</span></div>";
    }).join("");
  }

  function render() {
    if (!data) return;
    var list = records();
    var searchText = function (row) {
      if (kinds.value === "equipment") return [row.id, row.name, row.category, row.location, row.condition].join(" ");
      if (kinds.value === "cases") return [row.id, row.transactionId, row.userName, row.userId, row.equipment, row.type, row.description].join(" ");
      return [row.transactionId, row.id, row.studentName, row.studentNumber, row.status, admin.itemSummary(row.items)].join(" ");
    };
    var selectedType = filter.value;
    list = list.filter(function (row) {
      var value = kinds.value === "equipment" ? (row.active ? "active" : "inactive") :
        kinds.value === "cases" ? row.type.toLowerCase() : row.status;
      return (!selectedType || value === selectedType) && (!query || searchText(row).toLowerCase().indexOf(query.toLowerCase()) !== -1);
    });

    var head;
    var body;
    if (kinds.value === "equipment") {
      head = "<tr><th>Equipment</th><th>Category</th><th>Total</th><th>Available</th><th>Borrowed</th><th>Condition</th><th>Status</th></tr>";
      body = list.map(function (row) {
        return "<tr><td>" + admin.escape(row.name) + "<br><span class=\"portal-muted\">" + admin.escape(row.id) + "</span></td><td>" +
          admin.escape(row.category) + "</td><td>" + row.totalQuantity + " " + admin.escape(row.unit) + "</td><td>" + row.stock +
          "</td><td>" + row.borrowedQuantity + "</td><td>" + admin.escape(row.condition) + "</td><td>" + admin.status(row.active ? row.status : "Inactive") + "</td></tr>";
      }).join("");
    } else if (kinds.value === "cases") {
      head = "<tr><th>Case</th><th>Transaction</th><th>Borrower</th><th>Equipment</th><th>Type / quantity</th><th>Description</th><th>Resolution</th></tr>";
      body = list.map(function (row) {
        return "<tr><td>" + admin.escape(row.id) + "<br><span class=\"portal-muted\">" + admin.formatDate(row.date) + "</span></td><td>" + admin.escape(row.transactionId) +
          "</td><td>" + admin.escape(row.userName) + "<br><span class=\"portal-muted\">" + admin.escape(row.userId) + "</span></td><td>" + admin.escape(row.equipment) +
          "</td><td>" + admin.escape(row.type) + " · " + row.quantity + "</td><td>" + admin.escape(row.description) + "</td><td>" + admin.escape(row.resolution) + "</td></tr>";
      }).join("");
    } else {
      head = "<tr><th>Transaction</th><th>Borrower</th><th>Equipment / outstanding</th><th>Release</th><th>Return deadline</th><th>Actual return</th><th>Status</th></tr>";
      body = list.map(function (row) {
        return "<tr><td>" + admin.escape(row.transactionId) + "</td><td>" + admin.escape(row.studentName) + "<br><span class=\"portal-muted\">" + admin.escape(row.studentNumber) +
          "</span></td><td>" + admin.itemSummary(row.items, "outstanding") + "</td><td>" + admin.formatDate(row.releaseDate) + "</td><td>" + admin.formatDate(row.returnBy) +
          "</td><td>" + admin.formatDate(row.actualReturn) + "</td><td>" + admin.status(row.status) + "</td></tr>";
      }).join("");
    }
    document.getElementById("report-head").innerHTML = head;
    document.getElementById("report-rows").innerHTML = body || '<tr><td colspan="8" class="report-empty">No records match this report and filter.</td></tr>';
  }

  function updateFilters() {
    var values = kinds.value === "equipment" ? ["active", "inactive"] :
      kinds.value === "cases" ? Array.from(new Set((data.cases || []).map(function (row) { return row.type.toLowerCase(); }))).sort() :
        Array.from(new Set((data.transactions || []).map(function (row) { return row.status; }))).sort();
    var labels = { active: "Active", inactive: "Inactive", partially_returned: "Partially returned", return_requested: "Return requested" };
    filter.innerHTML = '<option value="">All</option>' + values.map(function (value) {
      return '<option value="' + admin.escape(value) + '">' + admin.escape(labels[value] || value.replace(/_/g, " ")) + "</option>";
    }).join("");
    render();
  }

  function load() {
    admin.api("/api/reports").then(function (response) {
      data = response;
      renderSummary();
      updateFilters();
    }).catch(function (error) { admin.toast(error.message, true); });
  }
  document.getElementById("report-generate").addEventListener("click", load);
  document.getElementById("report-export").addEventListener("click", function () {
    admin.api("/api/reports/export").then(function (blob) { admin.downloadCsv(blob, "university-lablink-transactions.csv"); })
      .catch(function (error) { admin.toast(error.message, true); });
  });
  kinds.addEventListener("change", updateFilters);
  filter.addEventListener("change", render);
  document.getElementById("report-search").addEventListener("input", function (event) { query = event.target.value; render(); });
  admin.bindSearch(function (value) { query = value; document.getElementById("report-search").value = value; render(); });
  document.addEventListener("lablink:admin-refresh", load);
  load();
})();
