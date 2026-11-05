(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var transactions = [];
  var search = "";
  var selectedTransaction = null;
  var filter = document.getElementById("return-filter");
  var inspectionDialog = document.getElementById("inspection-dialog");
  var caseDialog = document.getElementById("case-dialog");

  function isOpen(row) {
    return ["active", "overdue", "partially_returned", "damaged"].indexOf(row.status) !== -1;
  }

  function render() {
    var visible = transactions.filter(function (row) {
      if (!isOpen(row)) return false;
      if (filter.value === "return_requested" && row.status !== "return_requested") return false;
      if (filter.value === "overdue" && row.status !== "overdue") return false;
      var text = [row.transactionId, row.id, row.studentName, row.studentNumber, row.purpose, admin.itemSummary(row.items)].join(" ").toLowerCase();
      return !search || text.indexOf(search.toLowerCase()) !== -1;
    });
    document.getElementById("return-rows").innerHTML = visible.length ? visible.map(function (row) {
      var outstanding = row.items.filter(function (item) { return item.outstanding > 0; });
      var actions = row.status === "return_requested" ?
        '<button class="portal-button portal-button--small portal-button--success" type="button" data-inspect="' + admin.escape(row.transactionId) + '">Inspect return</button>' :
        '<span class="portal-muted">Awaiting user return submission</span>';
      if (outstanding.length) actions += '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-case="' + admin.escape(row.transactionId) + '">Record case</button>';
      if (row.extensionStatus === "pending") {
        actions += '<button class="portal-button portal-button--small portal-button--success" type="button" data-extension-approve="' + admin.escape(row.extensionId) + '">Approve extension</button>' +
          '<button class="portal-button portal-button--small portal-button--danger" type="button" data-extension-reject="' + admin.escape(row.extensionId) + '">Reject extension</button>';
      }
      return "<tr><td><strong>" + admin.escape(row.transactionId) + "</strong><br><span class=\"portal-muted\">" + admin.escape(row.id) +
        "</span></td><td>" + admin.escape(row.studentName) + '<br><span class="portal-muted">' + admin.escape(row.studentNumber) + "</span></td><td>" +
        admin.itemSummary(outstanding, "outstanding") + "</td><td>" + admin.formatDate(row.releaseDate) + "</td><td>" + admin.formatDate(row.returnBy) +
        "</td><td>" + admin.status(row.status) + "</td><td><div class=\"return-actions\">" + actions + "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="portal-muted">' + (search || filter.value !== "all" ? "No transactions match these filters." : "No active borrowing transactions need return processing.") + "</td></tr>";
  }

  function load() {
    admin.api("/api/transactions").then(function (data) { transactions = data.items || []; render(); }).catch(function (error) { admin.toast(error.message, true); });
  }

  function openInspection(row) {
    selectedTransaction = row;
    document.getElementById("inspection-title").textContent = "Inspect transaction " + row.transactionId;
    document.getElementById("inspection-items").innerHTML = row.items.filter(function (item) { return item.outstanding > 0; }).map(function (item) {
      return '<section class="inspection-item" data-item-id="' + item.transactionItemId + '"><div><h3>' + admin.escape(item.name) +
        '</h3><p>Borrowed ' + item.quantityBorrowed + " · Returned " + item.quantityReturned + " · Outstanding " + item.outstanding +
        '</p></div><label class="portal-field"><span class="portal-label">Received</span><input class="portal-input" data-return-quantity type="number" min="0" max="' + item.outstanding +
        '" step="1" value="' + item.outstanding + '"></label><label class="portal-field"><span class="portal-label">Condition</span><select class="portal-select" data-return-condition><option>Good</option><option>Needs Repair</option><option>Damaged</option><option>Improper Return</option></select></label>' +
        '<label class="portal-field"><span class="portal-label">Inspection notes</span><input class="portal-input" data-return-notes maxlength="500"></label></section>';
    }).join("");
    inspectionDialog.showModal();
  }

  function openCase(row) {
    selectedTransaction = row;
    var outstanding = row.items.filter(function (item) { return item.outstanding > 0; });
    document.getElementById("case-item").innerHTML = outstanding.map(function (item) {
      return '<option value="' + item.transactionItemId + '" data-outstanding="' + item.outstanding + '">' + admin.escape(item.name) + " (outstanding: " + item.outstanding + ")</option>";
    }).join("");
    var select = document.getElementById("case-item");
    document.getElementById("case-quantity").max = select.options.length ? select.options[0].dataset.outstanding : "1";
    caseDialog.showModal();
  }

  document.getElementById("return-rows").addEventListener("click", function (event) {
    var inspect = event.target.closest("[data-inspect]");
    var recordCase = event.target.closest("[data-case]");
    var extensionApprove = event.target.closest("[data-extension-approve]");
    var extensionReject = event.target.closest("[data-extension-reject]");
    if (extensionApprove || extensionReject) {
      var decision = extensionApprove ? "approved" : "rejected";
      if (decision === "rejected" && !window.confirm("Reject this return extension request?")) return;
      admin.api("/api/extensions/" + encodeURIComponent((extensionApprove || extensionReject).dataset.extensionApprove || (extensionReject && extensionReject.dataset.extensionReject)), {
        method: "PATCH", body: { status: decision }
      }).then(function () { admin.toast("Extension " + decision + "."); load(); }).catch(function (error) { admin.toast(error.message, true); });
      return;
    }
    var row = transactions.find(function (item) { return item.transactionId === (inspect && inspect.dataset.inspect || recordCase && recordCase.dataset.case); });
    if (!row) return;
    if (inspect) openInspection(row);
    if (recordCase) openCase(row);
  });
  document.getElementById("inspection-close").addEventListener("click", function () { inspectionDialog.close(); });
  document.getElementById("case-close").addEventListener("click", function () { caseDialog.close(); });
  document.getElementById("inspection-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var items = Array.from(document.querySelectorAll(".inspection-item")).map(function (section) {
      return {
        transactionItemId: Number(section.dataset.itemId),
        quantity: Number(section.querySelector("[data-return-quantity]").value),
        condition: section.querySelector("[data-return-condition]").value,
        notes: section.querySelector("[data-return-notes]").value.trim()
      };
    }).filter(function (item) { return item.quantity > 0; });
    if (!items.length) return admin.toast("Enter at least one quantity physically received.", true);
    if (!window.confirm("Confirm that the listed equipment has been physically received and inspected?")) return;
    var button = document.getElementById("inspection-submit");
    button.disabled = true;
    admin.api("/api/transactions/" + encodeURIComponent(selectedTransaction.transactionId) + "/returns", { method: "POST", body: { items: items } }).then(function (data) {
      inspectionDialog.close();
      admin.toast(data.status === "Returned" ? "Return confirmed. Remaining equipment availability and history were updated." : "Partial return recorded; outstanding units remain on the loan.");
      load();
    }).catch(function (error) { admin.toast(error.message, true); }).finally(function () { button.disabled = false; });
  });
  document.getElementById("case-item").addEventListener("change", function (event) {
    document.getElementById("case-quantity").max = event.target.selectedOptions[0].dataset.outstanding;
  });
  document.getElementById("case-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var quantity = Number(document.getElementById("case-quantity").value);
    var item = document.getElementById("case-item").selectedOptions[0];
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.dataset.outstanding)) return admin.toast("Enter a quantity within the outstanding amount.", true);
    admin.api("/api/transactions/" + encodeURIComponent(selectedTransaction.transactionId) + "/cases", {
      method: "POST",
      body: { transactionItemId: Number(item.value), caseType: document.getElementById("case-type").value, quantity: quantity, description: document.getElementById("case-description").value.trim() }
    }).then(function () {
      caseDialog.close();
      document.getElementById("case-description").value = "";
      admin.toast("Laboratory case saved.");
      load();
    }).catch(function (error) { admin.toast(error.message, true); });
  });
  document.getElementById("return-search").addEventListener("input", function (event) { search = event.target.value; render(); });
  filter.addEventListener("change", render);
  admin.bindSearch(function (value) { search = value; document.getElementById("return-search").value = value; render(); });
  document.addEventListener("lablink:admin-refresh", load);
  load();
})();
