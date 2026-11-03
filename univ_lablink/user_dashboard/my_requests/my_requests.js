/* =====================================================
   My Requests page
   - renders STATE A (empty) or STATE B (list) from the data array
   - status filter pills + sort dropdown
   - mock data for now; swap in real data with MyRequests.setRequests([...])

   Preview the empty state without editing code:  my_requests.html?state=empty
   ===================================================== */
(function () {
  "use strict";

  // ---------- Mock data (replace with the real request history) ----------
  var MOCK_REQUESTS = [
    {
      id: "REQ-2026-1015-042",
      submitted: "2026-10-15",
      items: [
        { qty: 2,  name: "Beakers 250ml" },
        { qty: 1,  name: "Digital Weighing Scale" },
        { qty: 10, name: "Test Tubes" }
      ],
      borrow: "2026-10-15",
      returnBy: "2026-10-22",
      returnTime: "5:00 PM",
      status: "pending"
    },
    {
      id: "REQ-2026-1008-031",
      submitted: "2026-10-08",
      items: [
        { qty: 1, name: "Microscope M-400" },
        { qty: 2, name: "Glass Rods" }
      ],
      borrow: "2026-10-09",
      returnBy: "2026-10-16",
      returnTime: "5:00 PM",
      status: "approved"
    },
    {
      id: "REQ-2026-0928-017",
      submitted: "2026-09-28",
      items: [
        { qty: 1, name: "Ethanol 95%" },
        { qty: 1, name: "Bunsen Burner" }
      ],
      borrow: "2026-09-29",
      returnBy: "2026-10-06",
      returnTime: "5:00 PM",
      status: "returned"
    },
    {
      id: "REQ-2026-0912-004",
      submitted: "2026-09-12",
      items: [
        { qty: 1, name: "Fume Hood Access" },
        { qty: 2, name: "Safety Goggles" }
      ],
      borrow: "2026-09-13",
      returnBy: "2026-09-20",
      returnTime: "5:00 PM",
      status: "rejected"
    }
  ];

  var STATUS_LABELS = {
    pending:  "Pending Approval",
    approved: "Approved",
    returned: "Returned",
    rejected: "Rejected"
  };

  var SORT_LABELS = {
    newest: "Sort: Newest to Oldest",
    oldest: "Sort: Oldest to Newest"
  };

  var FORM_PAGE = "../borrow_request_form/borrow_request_form.html";

  // ---------- State ----------
  var state = {
    requests: [],
    filter: "all",
    sort: "newest"
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
    var p = iso.split("-");
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
            escapeHtml(req.returnTime) + "</p>" +
        "</div>" +
        '<a class="mr-card__form-btn" href="' + escapeHtml(formUrl) + '">View Borrow<br>Request Form</a>' +
        '<span class="mr-badge mr-badge--' + status + '">' + STATUS_LABELS[status] + "</span>" +
      "</li>"
    );
  }

  function visibleRequests() {
    var list = state.requests.filter(function (req) {
      return state.filter === "all" || req.status === state.filter;
    });

    list.sort(function (a, b) {
      var diff = parseDate(a.submitted) - parseDate(b.submitted);
      if (diff === 0) diff = a.id < b.id ? -1 : 1; // stable order for same-day requests
      return state.sort === "newest" ? -diff : diff;
    });

    return list;
  }

  function render() {
    var hasRequests = state.requests.length > 0;

    // STATE A: no request history at all
    elEmpty.hidden = hasRequests;
    elList.hidden = !hasRequests;

    // the filter pills and sort button stay visible in both states, like the design

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

  // ---------- Public API ----------
  // MyRequests.setRequests([]) -> empty view,  MyRequests.setRequests([...]) -> list view
  window.MyRequests = {
    setRequests: function (requests) {
      state.requests = Array.isArray(requests) ? requests : [];
      render();
    }
  };

  // ---------- Start ----------
  var forceEmpty = new URLSearchParams(window.location.search).get("state") === "empty";
  state.requests = forceEmpty ? [] : MOCK_REQUESTS.slice();
  render();
})();
