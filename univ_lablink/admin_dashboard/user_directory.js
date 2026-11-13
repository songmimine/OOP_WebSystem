(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var rows = [];
  var query = "";
  var dialog = document.getElementById("directory-dialog");

  function render() {
    var visible = admin.filterRows(rows, query, ["id", "name", "email", "department", "role"]);
    document.getElementById("directory-rows").innerHTML = visible.length ? visible.map(function (row) {
      return "<tr><td><strong>" + admin.escape(row.id) + "</strong></td><td>" + admin.escape(row.name) + "</td><td>" +
        admin.escape(row.email) + "</td><td>" + admin.escape(row.department) + "</td><td>" + admin.escape(row.role) + "</td>" +
        '<td><button class="portal-button portal-button--small portal-button--secondary" type="button" data-user="' + admin.escape(row.id) + '">View details</button></td></tr>';
    }).join("") : '<tr><td colspan="6" class="portal-muted">' + (query ? "No accounts match your search." : "No registered accounts.") + "</td></tr>";
  }
  admin.api("/api/users").then(function (data) { rows = data.items || []; render(); }).catch(function (error) { admin.toast(error.message, true); });
  document.getElementById("directory-search").addEventListener("input", function (event) { query = event.target.value; render(); });
  admin.bindSearch(function (value) { query = value; document.getElementById("directory-search").value = value; render(); });
  document.getElementById("directory-close").addEventListener("click", function () { dialog.close(); });
  document.getElementById("directory-rows").addEventListener("click", function (event) {
    var button = event.target.closest("[data-user]");
    if (!button) return;
    var row = rows.find(function (item) { return item.id === button.dataset.user; });
    if (!row) return;
    document.getElementById("directory-dialog-title").textContent = row.name;
    document.getElementById("directory-dialog-body").innerHTML =
      "<p><strong>User ID:</strong> " + admin.escape(row.id) + "</p><p><strong>University email:</strong> " +
      admin.escape(row.email) + "</p><p><strong>Department:</strong> " + admin.escape(row.department) +
      "</p><p><strong>Account role:</strong> " + admin.escape(row.role) + "</p>";
    dialog.showModal();
  });
  document.addEventListener("lablink:admin-refresh", function () {
    admin.api("/api/users").then(function (data) { rows = data.items || []; render(); }).catch(function (error) { admin.toast(error.message, true); });
  });
})();
