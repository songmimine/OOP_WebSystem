(function () {
  "use strict";
  var store = window.LabLinkStore;
  var list = document.getElementById("return-list");
  var empty = document.getElementById("return-empty");
  var modal = document.getElementById("extension-modal");
  var toast = document.getElementById("portal-toast");
  var selectedId = null;
  var timer;
  var labels = { approved: "Approved · ready for pickup", active: "Borrowed", return_requested: "Awaiting staff inspection" };

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
    timer = window.setTimeout(function () { toast.hidden = true; }, 2800);
  }
  function render() {
    var requests = store.requests().filter(function (request) {
      return ["approved", "active", "return_requested"].indexOf(request.status) !== -1;
    });
    list.innerHTML = requests.map(function (request) {
      var actions = "";
      if (request.status === "approved") {
        actions = '<button class="portal-button portal-button--small portal-button--blue" type="button" data-pickup="' + esc(request.id) + '">Confirm pickup</button>';
      } else if (request.status === "active") {
        actions = '<button class="portal-button portal-button--small portal-button--secondary" type="button" data-extension="' + esc(request.id) + '">Request extension</button>' +
          '<button class="portal-button portal-button--small" type="button" data-return="' + esc(request.id) + '">Request return</button>';
      }
      var details = request.items.map(function (item) { return item.qty + " × " + item.name; }).join(", ");
      var returnDate = request.extensionStatus === "approved" ? request.extensionDate : request.returnBy;
      var extensionNote = request.extensionStatus === "pending" ? " · Extension awaiting staff approval" :
        request.extensionStatus === "approved" ? " · Extension approved" : "";
      return '<article class="portal-card portal-list-item"><div><p class="portal-kicker">' + esc(request.id) + '</p><h3>' + esc(request.purpose || "Equipment borrowing") +
        '</h3><p>' + esc(details) + '</p><p>Return by: ' + esc(returnDate) + esc(extensionNote) + (request.extensionReason ? " · " + esc(request.extensionReason) : "") + '</p></div>' +
        '<div class="portal-actions"><span class="portal-pill ' + (request.status === "return_requested" ? "portal-pill--pending" : "") + '">' + (labels[request.status] || esc(request.status)) + "</span>" + actions + "</div></article>";
    }).join("");
    empty.hidden = requests.length > 0;
  }
  list.addEventListener("click", function (event) {
    var pickup = event.target.closest("[data-pickup]");
    var returnButton = event.target.closest("[data-return]");
    var extension = event.target.closest("[data-extension]");
    try {
      if (pickup) {
        store.setStatus(pickup.getAttribute("data-pickup"), "active");
        notify("Pickup confirmed. Your equipment is now marked as borrowed.");
      } else if (returnButton) {
        var request = store.getRequest(returnButton.getAttribute("data-return"));
        request.status = "return_requested";
        store.saveRequest(request);
        notify("Return request sent to the laboratory staff.");
      } else if (extension) {
        selectedId = extension.getAttribute("data-extension");
        document.getElementById("extension-date").value = store.getRequest(selectedId).returnBy;
        document.getElementById("extension-modal").hidden = false;
      }
    } catch (error) { notify(error.message, true); }
  });
  document.getElementById("extension-cancel").addEventListener("click", function () { modal.hidden = true; });
  document.getElementById("extension-submit").addEventListener("click", function () {
    var reason = document.getElementById("extension-reason").value.trim();
    var date = document.getElementById("extension-date").value;
    if (!reason || !date) return notify("Enter a reason and proposed return date.", true);
    try {
      var request = store.getRequest(selectedId);
      if (!request || date <= request.returnBy) return notify("Choose a date later than the current return date.", true);
      request.extensionReason = reason;
      request.extensionDate = date;
      request.extensionStatus = "pending";
      store.saveRequest(request);
      modal.hidden = true;
      document.getElementById("extension-reason").value = "";
      notify("Extension request sent for staff approval.");
    } catch (error) { notify(error.message, true); }
  });
  window.addEventListener("lablink:data-changed", render);
  render();
})();
