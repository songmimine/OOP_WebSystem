(function () {
  "use strict";
  var store = window.LabLinkStore;
  var list = document.getElementById("return-list");
  var empty = document.getElementById("return-empty");
  var modal = document.getElementById("extension-modal");
  var toast = document.getElementById("portal-toast");
  var selected = null;
  var timer;

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
  function label(status) {
    return { active: "Borrowed", overdue: "Overdue", return_requested: "Return submitted · Awaiting staff inspection", partially_returned: "Partially returned" }[status] || status.replace(/_/g, " ");
  }
  function render() {
    var requests = store.requests().filter(function (request) {
      return request.transactionId && ["active", "overdue", "return_requested", "partially_returned"].indexOf(request.status) !== -1;
    });
    list.innerHTML = requests.map(function (request) {
      var outstanding = request.items.filter(function (item) { return item.outstanding > 0; });
      var actions = "";
      if (request.status !== "return_requested" && outstanding.length) {
        actions += '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-return="' + esc(request.transactionId) + '">Submit return</button>';
      } else if (request.status === "return_requested") {
        actions += '<span class="portal-pill portal-pill--pending">Waiting for staff inspection</span>';
      }
      if (outstanding.length && !request.extensionId) {
        actions += '<button class="portal-button portal-button--small" type="button" data-extension="' + esc(request.transactionId) + '">Request extension</button>';
      } else if (request.extensionStatus === "pending") {
        actions += '<span class="portal-pill portal-pill--pending">Extension awaiting staff review</span>';
      } else if (request.extensionStatus === "approved") {
        actions += '<span class="portal-pill">Extension approved</span>';
      } else if (request.extensionStatus === "rejected") {
        actions += '<span class="portal-pill portal-pill--rejected">Extension rejected</span>';
      }
      return '<article class="portal-card portal-list-item"><div><p class="portal-kicker">' + esc(request.transactionId) + ' · ' + esc(request.id) +
        '</p><h3>' + esc(request.purpose || "Equipment borrowing") + '</h3><p>' + outstanding.map(function (item) { return esc(item.outstanding + " × " + item.name); }).join(", ") +
        '</p><p>Released: ' + esc(request.releaseDate || "") + ' · Return deadline: <strong>' + esc(request.returnBy || "") + "</strong></p>" +
        (request.extensionReason ? '<p>Extension reason: ' + esc(request.extensionReason) + "</p>" : "") + '</div><div class="portal-actions"><span class="portal-pill ' +
        (request.status === "overdue" ? "portal-pill--rejected" : "") + '">' + esc(label(request.status)) + "</span>" + actions + "</div></article>";
    }).join("");
    empty.hidden = requests.length > 0;
  }

  list.addEventListener("click", function (event) {
    var returnButton = event.target.closest("[data-return]");
    var extensionButton = event.target.closest("[data-extension]");
    if (returnButton) {
      if (!window.confirm("Submit this equipment for return inspection? Staff must physically inspect and confirm it.")) return;
      returnButton.disabled = true;
      store.requestReturn(returnButton.dataset.return).then(function () {
        notify("Return submitted. The borrowing remains active until laboratory staff confirms inspection.");
      }).catch(function (error) { notify(error.message, true); returnButton.disabled = false; });
    }
    if (extensionButton) {
      selected = store.requests().find(function (request) { return request.transactionId === extensionButton.dataset.extension; });
      if (!selected) return notify("Borrowing transaction was not found.", true);
      document.getElementById("extension-date").value = "";
      document.getElementById("extension-date").min = selected.returnBy.slice(0, 10);
      document.getElementById("extension-reason").value = "";
      modal.hidden = false;
    }
  });
  document.getElementById("extension-cancel").addEventListener("click", function () { modal.hidden = true; });
  document.getElementById("extension-submit").addEventListener("click", function () {
    var reason = document.getElementById("extension-reason").value.trim();
    var date = document.getElementById("extension-date").value;
    if (!selected || !reason || !date) return notify("Enter a reason and proposed return date.", true);
    var button = document.getElementById("extension-submit");
    button.disabled = true;
    store.api("/api/transactions/" + encodeURIComponent(selected.transactionId) + "/extensions", {
      method: "POST",
      body: { reason: reason, newDueDate: date }
    }).then(function () {
      return store.refresh();
    }).then(function () {
      modal.hidden = true;
      notify("Extension request sent to laboratory staff for approval.");
    }).catch(function (error) { notify(error.message, true); }).finally(function () { button.disabled = false; });
  });
  window.addEventListener("lablink:data-changed", render);
  store.ready.then(render).catch(function (error) { notify(error.message, true); });
})();
