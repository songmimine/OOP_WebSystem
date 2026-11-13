/* =====================================================
   My Requests page
   - starts with the EMPTY view (no requests yet)
   - when a request is added (RequestStore.add in portal-store.js) it is
     saved in the browser and shown here as a list card
   - status filter pills + sort dropdown
   ===================================================== */
(function () {
  "use strict";

  var STATUS_LABELS = {
    pending:  "Pending Approval",
    approved: "Approved",
    active:   "Borrowed",
    overdue:  "Overdue",
    partially_returned: "Partially Returned",
    return_requested: "Return Requested",
    returned: "Returned",
    rejected: "Rejected"
  };

  var SORT_LABELS = {
    newest: "Sort: Newest to Oldest",
    oldest: "Sort: Oldest to Newest"
  };

  var FORM_PAGE = "../borrow_request_form/borrow_request_form.html";
  var store = window.LabLinkStore;

  // ---------- State ----------
  var state = {
    requests: [],
    filter: "all",
    sort: "newest",
    query: ""   // text typed in the header's search bar
  };

  // ---------- Elements ----------
  var elList     = document.getElementById("mr-list");
  var elEmpty    = document.getElementById("mr-empty");
  var elNoMatch  = document.getElementById("mr-no-match");
  var elPills    = document.querySelectorAll(".mr-pill");
  var elSortBtn  = document.getElementById("mr-sort-button");
  var elSortMenu = document.getElementById("mr-sort-menu");
  var elSortLbl  = document.getElementById("mr-sort-label");

  // ---------- Helpers ----------
  // "2026-10-15" -> local Date (avoids the UTC off-by-one you get from new Date(string))
  function parseDate(iso) {
    var p = String(iso).split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function fmtLong(iso) {
    return parseDate(iso).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric"
    });
  }

  function fmtShort(iso) {
    return parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function itemsText(items) {
    return items.map(function (item) {
      return item.qty + "x " + item.name;
    }).join(", ");
  }

  // Ignore any stored record that is missing the fields a card needs
  function isUsable(req) {
    return req && req.id && req.submitted && req.borrow && req.returnBy &&
           Array.isArray(req.items) && req.items.length > 0;
  }

  function loadRequests() {
    var stored = window.RequestStore ? window.RequestStore.all() : [];
    state.requests = stored.filter(isUsable);
  }

  // ---------- Rendering ----------
  function cardHtml(req) {
    var status = STATUS_LABELS[req.status] ? req.status : "pending";
    var formUrl = FORM_PAGE + "?id=" + encodeURIComponent(req.id);

    return (
      '<li class="mr-card" data-status="' + status + '">' +
        '<div class="mr-card__meta">' +
          '<p class="mr-card__id">' + escapeHtml(req.id) + "</p>" +
          '<p class="mr-card__submitted">Submitted ' + escapeHtml(fmtLong(req.submitted)) + "</p>" +
        "</div>" +
        '<div class="mr-card__details">' +
          '<p class="mr-card__items">' + escapeHtml(itemsText(req.items)) + "</p>" +
          '<p class="mr-card__timeline">Borrow ' + escapeHtml(fmtShort(req.borrow)) +
            " &middot; Return " + escapeHtml(fmtShort(req.returnBy)) + ", " +
            escapeHtml(req.returnTime || "5:00 PM") + "</p>" +
        "</div>" +
        '<a class="mr-card__form-btn" href="' + escapeHtml(formUrl) + '">View Borrow<br>Request Form</a>' +
          (status === "pending" ? '<button class="mr-card__form-btn" type="button" data-cancel="' + escapeHtml(req.id) + '">Cancel request</button>' : "") +
          '<span class="mr-badge mr-badge--' + status + '">' + STATUS_LABELS[status] + "</span>" +
      "</li>"
    );
  }

  function visibleRequests() {
    var query = state.query.toLowerCase();

    var list = state.requests.filter(function (req) {
      if (state.filter !== "all" && req.status !== state.filter) return false;
      if (!query) return true;

      // search the request id, the equipment names and the status text
      var haystack = (req.id + " " + itemsText(req.items) + " " +
                      (STATUS_LABELS[req.status] || "")).toLowerCase();
      return haystack.indexOf(query) !== -1;
    });

    list.sort(function (a, b) {
      var diff = parseDate(a.submitted) - parseDate(b.submitted);
      if (diff === 0) diff = a.id < b.id ? -1 : 1; // same-day requests: order by id
      return state.sort === "newest" ? -diff : diff;
    });

    return list;
  }

  function render() {
    var hasRequests = state.requests.length > 0;

    // STATE A: no request history yet (this is what a new user sees)
    elEmpty.hidden = hasRequests;
    elList.hidden = !hasRequests;

    if (!hasRequests) {
      elNoMatch.hidden = true;
      elList.innerHTML = "";
      return;
    }

    // STATE B: list, filtered and sorted
    var visible = visibleRequests();
    elList.innerHTML = visible.map(cardHtml).join("");
    elNoMatch.hidden = visible.length > 0;
    elList.hidden = visible.length === 0;
  }

  // ---------- Filters ----------
  function setFilter(filter) {
    state.filter = filter;
    Array.prototype.forEach.call(elPills, function (pill) {
      var active = pill.getAttribute("data-filter") === filter;
      pill.classList.toggle("is-active", active);
      pill.setAttribute("aria-pressed", String(active));
    });

    elList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cancel]");
      if (!button || !window.confirm("Cancel this pending borrowing request?")) return;
      button.disabled = true;
      store.setStatus(button.dataset.cancel, "cancelled").then(refresh).catch(function (error) {
        button.disabled = false;
        window.alert(error.message);
      });
    });
    render();
  }

  Array.prototype.forEach.call(elPills, function (pill) {
    pill.addEventListener("click", function () {
      setFilter(pill.getAttribute("data-filter"));
    });
  });

  // ---------- Sort dropdown ----------
  function openSort() {
    elSortMenu.hidden = false;
    elSortBtn.setAttribute("aria-expanded", "true");
  }

  function closeSort() {
    elSortMenu.hidden = true;
    elSortBtn.setAttribute("aria-expanded", "false");
  }

  function setSort(sort) {
    state.sort = sort;
    elSortLbl.textContent = SORT_LABELS[sort];
    Array.prototype.forEach.call(elSortMenu.children, function (option) {
      option.setAttribute("aria-selected", String(option.getAttribute("data-sort") === sort));
    });
    closeSort();
    render();
  }

  elSortBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    if (elSortMenu.hidden) openSort(); else closeSort();
  });

  Array.prototype.forEach.call(elSortMenu.children, function (option) {
    option.addEventListener("click", function () {
      setSort(option.getAttribute("data-sort"));
    });
    option.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSort(option.getAttribute("data-sort"));
      }
    });
  });

  document.addEventListener("click", function (event) {
    if (!elSortMenu.hidden && !elSortMenu.contains(event.target) && !elSortBtn.contains(event.target)) {
      closeSort();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !elSortMenu.hidden) {
      closeSort();
      elSortBtn.focus();
    }
  });

  // ---------- Keep the page in sync with the store ----------
  function refresh() {
    loadRequests();
    render();
  }

  // a request added in another tab
  window.addEventListener("storage", function (event) {
    if (event.key === window.RequestStore.KEY || event.key === null) refresh();
  });
  window.addEventListener("lablink:data-changed", refresh);

  // coming back to this page with the browser's back button
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) refresh();
  });

  // ---------- Shared header search ----------
  // header.js fires "header:search" when the Search button is pressed.
  // Here it filters the request list by ID, equipment or status.
  document.addEventListener("header:search", function (event) {
    state.query = (event.detail && event.detail.query) || "";
    render();
  });

  window.MyRequests = { refresh: refresh };

  // ---------- Start ----------
  store.ready.then(refresh).catch(function (error) {
    elEmpty.hidden = false;
    elEmpty.querySelector(".mr-empty__text").textContent = error.message;
  });
})();
