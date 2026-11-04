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
  var statusNames = { pending: "Pending approval", approved: "Approved", rejected: "Rejected", active: "Borrowed", return_requested: "Return requested", returned: "Returned" };
  var queryId = new URLSearchParams(window.location.search).get("id");

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
    if (!entry && delta > 0) { items.push({ id: id, qty: 1 }); }
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
      var item = inventory.filter(function (candidate) { return candidate.id === entry.id; })[0];
      if (!item) return "";
      selectedIds[item.id] = true;
      return '<tr><td>' + esc(item.name) + " <span class=\"portal-muted\">" + esc(item.detail) + '</span></td><td>' + item.stock +
        '</td><td><span class="portal-qty"><button type="button" aria-label="Remove one ' + esc(item.name) + '" data-change="-1" data-id="' + esc(item.id) + '">−</button>' +
        '<output>' + entry.qty + '</output><button type="button" aria-label="Add one ' + esc(item.name) + '" data-change="1" data-id="' + esc(item.id) + '">+</button></span></td>' +
        '<td><button class="portal-button portal-button--small portal-button--secondary" type="button" data-remove="' + esc(item.id) + '">Remove</button></td></tr>';
    }).join("");
    noItems.hidden = draft.length > 0;
    available.innerHTML = inventory.filter(function (item) { return item.stock > 0; }).map(function (item) {
      var added = !!selectedIds[item.id];
      return '<article class="portal-card"><h3>' + esc(item.name) + '</h3><p class="portal-muted">' + esc(item.detail) + " · Stock: " + item.stock + '</p>' +
        '<button class="portal-button portal-button--small portal-button--blue" type="button" data-add="' + esc(item.id) + '">' + (added ? "Add one more" : "Add to request") + "</button></article>";
    }).join("");
  }

  if (queryId) {
    var existing = store.getRequest(queryId);
    form.hidden = true;
    document.getElementById("request-view").hidden = false;
    if (existing) {
      document.getElementById("form-title").textContent = "Borrowing Request";
      document.getElementById("view-request-id").textContent = existing.id;
      document.getElementById("view-request-status").textContent = statusNames[existing.status] || existing.status;
      document.getElementById("view-request-meta").textContent = "Submitted " + existing.submitted + " · Borrow " + existing.borrow + " · Return " + existing.returnBy;
      document.getElementById("view-request-items").innerHTML = existing.items.map(function (item) {
        return '<li class="portal-list-item"><div><h3>' + esc(item.name) + " · " + esc(item.detail) + '</h3><p>Quantity: ' + item.qty + "</p></div></li>";
      }).join("");
    } else {
      document.getElementById("view-request-id").textContent = "Request not found";
      document.getElementById("view-request-status").hidden = true;
      document.getElementById("view-request-meta").textContent = "This request may have been removed from the demo data.";
    }
  } else {
    var user = {};
    try { user = JSON.parse(localStorage.getItem("lablink_user") || "{}"); } catch (error) { user = {}; }
    document.getElementById("student-name").value = user.name || "Katrina Mendoza";
    document.getElementById("student-number").value = user.id || "2025-2-00001";
    document.getElementById("department").value = user.department || "Computer Science";
    function localDate(date) {
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
        String(date.getDate()).padStart(2, "0");
    }
    var today = new Date();
    var returnDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    document.getElementById("borrow-date").value = localDate(today);
    document.getElementById("return-date").value = localDate(returnDate);
    document.getElementById("borrow-date").min = localDate(today);
    document.getElementById("return-date").min = localDate(today);
    render();
  }

  tbody.addEventListener("click", function (event) {
    var button = event.target.closest("[data-change], [data-remove]");
    if (!button) return;
    if (button.hasAttribute("data-remove")) changeQty(button.getAttribute("data-remove"), -999);
    else changeQty(button.getAttribute("data-id"), Number(button.getAttribute("data-change")));
  });
  available.addEventListener("click", function (event) {
    var button = event.target.closest("[data-add]");
    if (button) changeQty(button.getAttribute("data-add"), 1);
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      var request = store.addRequest({
        studentName: document.getElementById("student-name").value.trim(),
        studentNumber: document.getElementById("student-number").value.trim(),
        department: document.getElementById("department").value.trim(),
        purpose: document.getElementById("purpose").value.trim(),
        borrow: document.getElementById("borrow-date").value,
        returnBy: document.getElementById("return-date").value,
        notes: document.getElementById("notes").value.trim(),
        items: draft
      });
      document.getElementById("success-reference").textContent = request.id;
      document.getElementById("success-modal").hidden = false;
    } catch (error) { notify(error.message, true); }
  });
  document.getElementById("close-success").addEventListener("click", function () {
    document.getElementById("success-modal").hidden = true;
  });
})();
