(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var rows = [];
  var query = "";
  var search = document.getElementById("request-search");
  var filter = document.getElementById("request-status");
  var dialog = document.getElementById("request-dialog");

  function statusMatches(row) {
    var value = filter.value;
    if (value === "all") return true;
    return value === "approved" ? row.requestStatus === "approved" && !row.transactionId :
      value === "active" ? ["active", "overdue", "partially_returned", "return_requested"].indexOf(row.status) !== -1 :
        value === "returned" ? row.status === "returned" : row.requestStatus === value;
  }

  function render() {
    var visible = rows.filter(function (row) {
      var text = [row.id, row.studentName, row.studentNumber, row.department, row.purpose, admin.itemSummary(row.items)].join(" ").toLowerCase();
      return statusMatches(row) && (!query || text.indexOf(query.toLowerCase()) !== -1);
    });
    document.getElementById("request-rows").innerHTML = visible.length ? visible.map(function (row) {
      var actions = '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-view="' + admin.escape(row.id) + '">View</button>';
      if (row.requestStatus === "pending") {
        actions += '<button class="portal-button portal-button--small portal-button--success" type="button" data-approve="' + admin.escape(row.id) + '">Approve</button>' +
          '<button class="portal-button portal-button--small portal-button--danger" type="button" data-reject="' + admin.escape(row.id) + '">Reject</button>';
      } else if (row.requestStatus === "approved" && !row.transactionId) {
        actions += '<button class="portal-button portal-button--small" type="button" data-release="' + admin.escape(row.id) + '">Release equipment</button>';
      }
      return "<tr><td><strong>" + admin.escape(row.id) + "</strong>" + (row.isNew ? '<br><span class="request-new">New inquiry</span>' : "") +
        "</td><td>" + admin.escape(row.studentName) + '<br><span class="portal-muted">' + admin.escape(row.studentNumber) + "</span></td><td>" +
        admin.itemSummary(row.items) + "</td><td>" + admin.escape(row.purpose) + "</td><td>" + admin.formatDate(row.borrow, { month: "short", day: "numeric", year: "numeric" }) +
        "<br>to " + admin.formatDate(row.returnBy, { month: "short", day: "numeric", year: "numeric" }) + "</td><td>" +
        admin.status(row.status) + "</td><td><div class=\"request-actions\">" + actions + "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="portal-muted">' + (query || filter.value !== "all" ? "No requests match these filters." : "No borrowing requests have been submitted.") + "</td></tr>";
  }

  function load() {
    admin.api("/api/requests").then(function (data) {
      rows = data.items || [];
      render();
      var unseen = rows.filter(function (row) { return row.isNew; }).map(function (row) { return row.id; });
      if (unseen.length) {
        admin.api("/api/notifications/acknowledge", { method: "POST", body: { ids: unseen } }).then(function () {
          if (window.AdminHeader) window.AdminHeader.refreshNotifications();
        }).catch(function (error) { admin.toast(error.message, true); });
      }
    }).catch(function (error) { admin.toast(error.message, true); });
  }

  function showDetails(row) {
    document.getElementById("request-dialog-title").textContent = row.id;
    document.getElementById("request-dialog-body").innerHTML =
      '<p><strong>Requester:</strong> ' + admin.escape(row.studentName) + " · " + admin.escape(row.studentNumber) +
      " · " + admin.escape(row.email) + "</p><p><strong>Department:</strong> " + admin.escape(row.department) +
      "</p><p><strong>Purpose:</strong> " + admin.escape(row.purpose) + "</p><p><strong>Borrowing schedule:</strong> " +
      admin.formatDate(row.borrow) + " – " + admin.formatDate(row.returnBy) + "</p><p><strong>Notes:</strong> " + admin.escape(row.notes || "None") +
      "</p><h3>Requested equipment</h3><ul class=\"request-details-list\">" + row.items.map(function (item) {
        return "<li>" + admin.escape(item.name) + " · " + admin.escape(item.detail) + " · Quantity: " + item.qty + "</li>";
      }).join("") + "</ul><p><strong>Status:</strong> " + admin.escape(row.status.replace(/_/g, " ")) + "</p>";
    dialog.showModal();
  }

  document.getElementById("request-dialog-close").addEventListener("click", function () { dialog.close(); });
  document.getElementById("request-rows").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-view], button[data-approve], button[data-reject], button[data-release]");
    if (!button) return;
    var row = rows.find(function (item) { return item.id === button.dataset.view || item.id === button.dataset.approve || item.id === button.dataset.reject || item.id === button.dataset.release; });
    if (!row) return;
    if (button.dataset.view) return showDetails(row);
    var action = button.dataset.approve ? "approved" : button.dataset.reject ? "rejected" : "release";
    if (action === "rejected" && !window.confirm("Reject request " + row.id + "?")) return;
    button.disabled = true;
    var operation = action === "release" ? admin.api("/api/requests/" + encodeURIComponent(row.id) + "/release", { method: "POST", body: {} }) :
      admin.api("/api/requests/" + encodeURIComponent(row.id), { method: "PATCH", body: { status: action } });
    operation.then(function () {
      admin.toast(action === "release" ? "Equipment release recorded; the borrowing transaction is now active." : "Request " + action + ".");
      load();
    }).catch(function (error) { admin.toast(error.message, true); button.disabled = false; });
  });
  search.addEventListener("input", function () { query = search.value; render(); });
  filter.addEventListener("change", render);
  admin.bindSearch(function (value) { query = value; search.value = value; render(); });
  document.addEventListener("lablink:admin-refresh", load);
  load();
})();
