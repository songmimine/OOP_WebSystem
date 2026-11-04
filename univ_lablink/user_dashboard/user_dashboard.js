/* ==========================================================================
   User Dashboard – LPU Cavite Laboratory Equipment System
   ---------------------------------------------------------------------------
   Data sources (swap the two read functions for your API when ready):

   localStorage "lablink_user"      {"name":"Katrina Mendoza","role":"User"}
       -> written by your login page. Missing/empty name => "User".

   localStorage "lablink_requests"  [
       {
         "id": "REQ-001",
         "purpose": "Chemistry Research",
         "qty": 2,
         "status": "pending" | "approved" | "active" | "overdue" | "returned",
         "requestedDate": "2026-11-01",   // YYYY-MM-DD
         "pickupDate":    "2026-11-03",
         "pickupTime":    "09:00",        // 24h, optional
         "borrowedDate":  "2026-10-12",
         "dueDate":       "2026-10-19",
         "dueTime":       "17:00"         // 24h, optional
       }
     ]
       -> no requests = every counter is 0, no calendar dots, empty states.

   Everything on screen (counters, list, calendar dots, deadlines and the
   notification count) is derived from those requests.
   Call LabLinkDashboard.refresh() after you change the stored data.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var KEYS = {
    user: "lablink_user",
    requests: "lablink_requests",
    read: "lablink_notifs_read"
  };
  var UPCOMING_DAYS = 3;   // deadlines appear this many days ahead
  var MAX_LISTED = 5;      // requests shown on the dashboard
  var OPEN_STATUSES = { pending: 1, approved: 1, active: 1, overdue: 1, return_requested: 1 };
  var STATUS_LABEL = { pending: "Pending", approved: "Approved", active: "Active", overdue: "Overdue", return_requested: "Return requested" };
  var STATUS_ORDER = { overdue: 0, return_requested: 1, active: 2, approved: 3, pending: 4 };
  var EVENT_ORDER = ["pickup", "return", "pending"];
  var EVENT_LABEL = { pickup: "pickup or borrow", "return": "return or due", pending: "pending" };

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /* ---------- Small helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function readJSON(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Dates ---------- */
  function parseDate(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dayDiff(a, b) {
    return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function fmtDate(d) {
    return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function fmtShort(d) {
    return DAYS_SHORT[d.getDay()] + ", " + MONTHS_SHORT[d.getMonth()] + " " + d.getDate();
  }

  function fmtTime(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
    if (!m) return String(t || "");
    var h = parseInt(m[1], 10);
    return (h % 12 || 12) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM");
  }

  function relative(diff, date) {
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    return "on " + fmtShort(date);
  }

  /* ---------- Data access ---------- */
  function getUser() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEYS.user); } catch (e) { /* ignore */ }

    var name = "";
    var role = "";
    if (raw) {
      try {
        var u = JSON.parse(raw);
        if (u && typeof u === "object") {
          name = u.name || u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ");
          role = u.role || "";
        } else if (typeof u === "string") {
          name = u;
        }
      } catch (e) {
        name = raw; // plain string stored instead of JSON
      }
    }

    name = String(name || "").replace(/\s+/g, " ").trim();
    return { name: name || "User", role: String(role || "").trim() || "User" };
  }

  function getRequests(today) {
    var raw = readJSON(KEYS.requests);
    if (!Array.isArray(raw)) return [];

    return raw
      .filter(function (r) { return r && typeof r === "object"; })
      .map(function (r, i) {
        var status = String(r.status || "pending").toLowerCase();
        var due = parseDate(r.dueDate);
        if (status === "active" && due && dayDiff(due, today) < 0) status = "overdue";

        var qty = parseInt(r.qty, 10);
        return {
          id: r.id != null ? String(r.id) : "req" + i,
          purpose: String(r.purpose || "").trim(),
          qty: qty > 0 ? qty : 1,
          status: status,
          requestedDate: parseDate(r.requestedDate),
          pickupDate: parseDate(r.pickupDate),
          borrowedDate: parseDate(r.borrowedDate),
          dueDate: due,
          pickupTime: r.pickupTime || "09:00",
          dueTime: r.dueTime || "17:00"
        };
      })
      .filter(function (r) { return OPEN_STATUSES[r.status] === 1; });
  }

  function sortDate(r) {
    var d = r.status === "pending" || r.status === "approved" ? (r.pickupDate || r.requestedDate) : r.dueDate;
    return d ? d.getTime() : Infinity;
  }

  /* ---------- State ---------- */
  var today = startOfDay(new Date());
  var view = { y: today.getFullYear(), m: today.getMonth() };
  var state = { requests: [], events: {}, notifs: [], unread: null, lastUnread: null };
  var lastTrigger = null;

  /* ---------- Greeting + header user ---------- */
  function renderUser() {
    var user = getUser();
    $("dash-name").textContent = user.name;
    if (window.LabLinkHeader && typeof window.LabLinkHeader.setUser === "function") {
      window.LabLinkHeader.setUser(user.name, user.role);
    }
  }

  /* ---------- Summary cards ---------- */
  function renderStats(reqs) {
    var forReturn = 0;
    var overdue = 0;
    reqs.forEach(function (r) {
      if (r.status === "active" || r.status === "return_requested") forReturn += r.qty;
      if (r.status === "overdue") overdue += r.qty;
    });
    $("stat-active").textContent = String(reqs.length);
    $("stat-return").textContent = String(forReturn);
    $("stat-overdue").textContent = String(overdue);
  }

  /* ---------- Request list ---------- */
  function requestMeta(r) {
    var lines = ["Qty: " + r.qty];
    if (r.status === "pending") {
      var asked = r.pickupDate || r.requestedDate;
      if (asked) lines.push("Requested pickup: " + fmtDate(asked));
    } else if (r.status === "approved") {
      if (r.pickupDate) lines.push("Pickup: " + fmtDate(r.pickupDate) + ", " + fmtTime(r.pickupTime));
    } else if (r.borrowedDate) {
      lines.push("Borrowed: " + fmtDate(r.borrowedDate));
    }
    if (r.dueDate) lines.push("Due: " + fmtDate(r.dueDate));
    return lines;
  }

  function renderRequests(reqs) {
    var list = $("req-list");
    var empty = $("req-empty");
    var more = $("req-more");
    clear(list);

    if (!reqs.length) {
      list.hidden = true;
      more.hidden = true;
      empty.hidden = false;
      return;
    }

    var sorted = reqs.slice().sort(function (a, b) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || sortDate(a) - sortDate(b);
    });

    sorted.slice(0, MAX_LISTED).forEach(function (r) {
      var item = el("li", "dash-req");
      var body = el("div", "dash-req-body");
      body.appendChild(el("p", "dash-req-title", r.purpose ? "For " + r.purpose : "Borrow request"));

      var meta = el("p", "dash-req-meta");
      requestMeta(r).forEach(function (line) { meta.appendChild(el("span", null, line)); });
      body.appendChild(meta);

      item.appendChild(body);
      item.appendChild(el("span", "dash-badge dash-badge--" + r.status, STATUS_LABEL[r.status]));
      list.appendChild(item);
    });

    list.hidden = false;
    empty.hidden = true;
    more.hidden = sorted.length <= MAX_LISTED;
  }

  /* ---------- Calendar ---------- */
  function buildEvents(reqs) {
    var map = {};
    function add(date, type) {
      if (!date) return;
      var key = dateKey(date);
      if (!map[key]) map[key] = {};
      map[key][type] = true;
    }

    reqs.forEach(function (r) {
      if (r.status === "pending") {
        add(r.pickupDate || r.requestedDate, "pending");
      } else if (r.status === "approved") {
        add(r.pickupDate, "pickup");
      } else {
        add(r.borrowedDate, "pickup");
        add(r.dueDate, "return");
      }
    });
    return map;
  }

  function renderCalendar() {
    var body = $("cal-body");
    clear(body);
    $("cal-title").textContent = MONTHS[view.m] + " " + view.y;

    var lead = new Date(view.y, view.m, 1).getDay();
    var total = new Date(view.y, view.m + 1, 0).getDate();
    var cells = Math.ceil((lead + total) / 7) * 7;
    var row = null;

    for (var i = 0; i < cells; i++) {
      if (i % 7 === 0) {
        row = document.createElement("tr");
        body.appendChild(row);
      }

      var td = document.createElement("td");
      var num = i - lead + 1;

      if (num >= 1 && num <= total) {
        var date = new Date(view.y, view.m, num);
        var key = dateKey(date);
        var isToday = dayDiff(date, today) === 0;
        var ev = state.events[key];
        var types = ev ? EVENT_ORDER.filter(function (t) { return ev[t]; }) : [];

        td.setAttribute("data-date", key);
        if (isToday) {
          td.className = "dash-cal-today";
          td.setAttribute("aria-current", "date");
        }

        td.appendChild(el("span", "dash-cal-num", String(num)));

        var spoken = [];
        if (isToday) spoken.push("today");
        types.forEach(function (t) { spoken.push(EVENT_LABEL[t]); });
        if (spoken.length) td.appendChild(el("span", "dash-sr", ", " + spoken.join(", ")));

        // Dots only exist when something happens on that exact date
        if (types.length) {
          var dots = el("span", "dash-dots");
          dots.setAttribute("aria-hidden", "true");
          types.forEach(function (t) { dots.appendChild(el("span", "dash-dot dash-dot--" + t)); });
          td.appendChild(dots);
        }
      }
      row.appendChild(td);
    }
  }

  function shiftMonth(delta) {
    var d = new Date(view.y, view.m + delta, 1);
    view.y = d.getFullYear();
    view.m = d.getMonth();
    renderCalendar();
  }

  /* ---------- Upcoming deadlines ---------- */
  function getDeadlines(reqs) {
    var list = [];

    reqs.forEach(function (r) {
      if (r.status === "approved" && r.pickupDate) {
        var d = dayDiff(r.pickupDate, today);
        if (d >= 0 && d <= UPCOMING_DAYS) {
          list.push({
            id: "borrow-" + r.id + "-" + dateKey(r.pickupDate),
            type: "borrow",
            overdue: false,
            order: d,
            text: "For Borrow: Pick up " + relative(d, r.pickupDate) + " at " + fmtTime(r.pickupTime)
          });
        }
      }

      if (r.status === "active" || r.status === "overdue") {
        if (r.dueDate) {
          var diff = dayDiff(r.dueDate, today);
          if (diff <= UPCOMING_DAYS) {
            var late = diff < 0;
            list.push({
              id: "return-" + r.id + "-" + dateKey(r.dueDate),
              type: "return",
              overdue: late,
              order: late ? -1000 + diff : diff,
              text: late
                ? "For Return: Overdue since " + fmtDate(r.dueDate)
                : "For Return: Due " + relative(diff, r.dueDate) + " by " + fmtTime(r.dueTime)
            });
          }
        } else if (r.status === "overdue") {
          list.push({
            id: "return-" + r.id + "-overdue",
            type: "return",
            overdue: true,
            order: -2000,
            text: "For Return: Overdue"
          });
        }
      }
    });

    return list.sort(function (a, b) { return a.order - b.order; });
  }

  function renderDeadlines(deadlines) {
    var list = $("dl-list");
    var empty = $("dl-empty");
    clear(list);

    if (!deadlines.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    deadlines.forEach(function (d) {
      var cls = "dash-dl dash-dl--" + d.type + (d.overdue ? " dash-dl--overdue" : "");
      list.appendChild(el("li", cls, d.text));
    });
    list.hidden = false;
    empty.hidden = true;
  }

  /* ---------- Notifications (button + header bell share one count) ---------- */
  function getReadMap() {
    var saved = readJSON(KEYS.read);
    var map = {};
    if (Array.isArray(saved)) saved.forEach(function (id) { map[id] = true; });
    return map;
  }

  function pushCountToHeader(count) {
    if (window.LabLinkHeader && typeof window.LabLinkHeader.setNotificationCount === "function") {
      window.LabLinkHeader.setNotificationCount(count);
    }
  }

  function renderNotifications(deadlines) {
    var read = getReadMap();
    state.notifs = deadlines.map(function (d) {
      return { id: d.id, text: d.text, read: !!read[d.id] };
    });
    var unread = state.notifs.filter(function (n) { return !n.read; }).length;
    state.unread = unread;

    // Floating button badge
    var badge = $("fab-badge");
    var fab = $("notif-fab");
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = false;
      fab.setAttribute("aria-label", "Notifications, " + unread + " unread");
    } else {
      badge.textContent = "0";
      badge.hidden = true;
      fab.setAttribute("aria-label", "Notifications");
    }

    // Header bell uses the very same number
    pushCountToHeader(unread);

    // Announce changes to screen readers (not on first render)
    if (state.lastUnread !== null && state.lastUnread !== unread) {
      $("notif-live").textContent =
        unread === 0 ? "No unread notifications." : "You have " + unread + " unread notification" + (unread === 1 ? "." : "s.");
    }
    state.lastUnread = unread;

    // Panel contents
    var list = $("notif-list");
    var empty = $("notif-empty");
    clear(list);

    state.notifs.forEach(function (n) {
      var item = el("li", "dash-notif-item " + (n.read ? "is-read" : "is-unread"));
      if (!n.read) item.appendChild(el("span", "dash-notif-tag", "New"));
      item.appendChild(el("span", null, n.text));
      list.appendChild(item);
    });

    list.hidden = !state.notifs.length;
    empty.hidden = !!state.notifs.length;
    $("notif-markall").disabled = unread === 0;
  }

  function markAllRead() {
    writeJSON(KEYS.read, state.notifs.map(function (n) { return n.id; }));
    renderNotifications(getDeadlines(state.requests));
  }

  /* ---------- Notification panel open/close ---------- */
  function headerBell() {
    return document.querySelector(".main-system-header .msh-bell");
  }

  function setExpanded(value) {
    $("notif-fab").setAttribute("aria-expanded", value ? "true" : "false");
    var bell = headerBell();
    if (bell) bell.setAttribute("aria-expanded", value ? "true" : "false");
  }

  function openPanel(trigger) {
    lastTrigger = trigger || $("notif-fab");
    $("notif-panel").hidden = false;
    setExpanded(true);
    $("notif-panel").focus();
  }

  function closePanel(returnFocus) {
    var panel = $("notif-panel");
    if (panel.hidden) return;
    panel.hidden = true;
    setExpanded(false);
    if (returnFocus && lastTrigger) lastTrigger.focus();
  }

  function togglePanel(trigger) {
    if ($("notif-panel").hidden) openPanel(trigger);
    else closePanel(true);
  }

  function wireHeaderBell() {
    var bell = headerBell();
    if (!bell) return;
    bell.setAttribute("aria-haspopup", "dialog");
    bell.setAttribute("aria-controls", "notif-panel");
    bell.setAttribute("aria-expanded", $("notif-panel").hidden ? "false" : "true");
  }

  /* ---------- Render everything ---------- */
  function renderAll() {
    today = startOfDay(new Date());
    state.requests = getRequests(today);
    state.events = buildEvents(state.requests);

    renderUser();
    renderStats(state.requests);
    renderRequests(state.requests);
    renderCalendar();

    var deadlines = getDeadlines(state.requests);
    renderDeadlines(deadlines);
    renderNotifications(deadlines);
  }

  /* ---------- Events ---------- */
  function bind() {
    $("cal-prev").addEventListener("click", function () { shiftMonth(-1); });
    $("cal-next").addEventListener("click", function () { shiftMonth(1); });

    $("notif-fab").addEventListener("click", function (e) {
      e.stopPropagation();
      togglePanel($("notif-fab"));
    });
    $("notif-close").addEventListener("click", function () { closePanel(true); });
    $("notif-markall").addEventListener("click", markAllRead);

    document.addEventListener("click", function (e) {
      var bell = e.target.closest ? e.target.closest(".main-system-header .msh-bell") : null;
      if (bell) {
        togglePanel(bell);
        return;
      }
      var panel = $("notif-panel");
      if (!panel.hidden && !panel.contains(e.target) && !$("notif-fab").contains(e.target)) {
        closePanel(false);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel(true);
    });

    // Header loads asynchronously: sync user name, bell attributes and count when ready
    document.addEventListener("lablink:header-ready", function () {
      renderUser();
      wireHeaderBell();
      pushCountToHeader(state.unread || 0);
    });

    // Stay in sync with other tabs and with a day rollover
    window.addEventListener("storage", renderAll);
    window.addEventListener("lablink:data-changed", renderAll);
    setInterval(function () {
      if (dateKey(new Date()) !== dateKey(today)) renderAll();
    }, 60000);
  }

  function init() {
    bind();
    renderAll();
    wireHeaderBell();
  }

  window.LabLinkDashboard = { refresh: renderAll };

  init();
})();
