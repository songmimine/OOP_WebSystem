(function () {
  "use strict";

  var store = window.LabLinkStore;
  var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var today = new Date();
  var view = { year: today.getFullYear(), month: today.getMonth() };
  var requests = [];
  var eventMap = {};
  var MAX_ROWS = 3;

  var labels = {
    pending: "Pending",
    approved: "Approved",
    active: "Borrowed",
    overdue: "Overdue",
    return_requested: "Return submitted",
    returned: "Returned",
    rejected: "Rejected",
    cancelled: "Cancelled",
    partially_returned: "Partially returned"
  };

  var OPEN_STATUSES = ["pending", "approved", "active", "overdue", "return_requested", "partially_returned"];
  var RETURN_STATUSES = ["active", "overdue", "return_requested", "partially_returned"];

  var ICONS = {
    pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    approved: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12.2 2.6 2.6L16.4 9"></path></svg>',
    active: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2z"></path><path d="M4 8.2 12 12l8-3.8M12 12v8"></path></svg>',
    overdue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 20H3z"></path><path d="M12 9v5"></path><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"></circle></svg>',
    return_requested: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"></path></svg>',
    partially_returned: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"></path></svg>',
    returned: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12.2 2.6 2.6L16.4 9"></path></svg>',
    rejected: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>',
    cancelled: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>'
  };

  var NOTICE_ICONS = {
    overdue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 20H3z"></path><path d="M12 9v5"></path><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"></circle></svg>',
    today: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    upcoming: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path></svg>',
    return: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"></path></svg>'
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function parseDateTime(value) {
    if (!value) return null;
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(value));
    if (!match) return null;
    var date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      match[4] ? Number(match[4]) : 0,
      match[5] ? Number(match[5]) : 0
    );
    return isNaN(date.getTime()) ? null : date;
  }

  function dateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dateKey(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function isSameDay(first, second) {
    return first && second &&
      first.getFullYear() === second.getFullYear() &&
      first.getMonth() === second.getMonth() &&
      first.getDate() === second.getDate();
  }

  function daysBetween(from, to) {
    return Math.round((dateOnly(to) - dateOnly(from)) / 86400000);
  }

  function hasTime(value) {
    return /[T ]\d{2}:\d{2}/.test(String(value || ""));
  }

  function formatDate(date) {
    return monthsShort[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
  }

  function formatTime(date) {
    var hours = date.getHours();
    var minutes = String(date.getMinutes()).padStart(2, "0");
    var suffix = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return hours + ":" + minutes + " " + suffix;
  }

  function formatMoment(date, withTime) {
    if (isSameDay(date, new Date())) {
      return withTime ? "Today, " + formatTime(date) : "Today";
    }
    return formatDate(date) + (withTime ? ", " + formatTime(date) : "");
  }

  function plural(count, singular, pluralForm) {
    return count + " " + (count === 1 ? singular : (pluralForm || singular + "s"));
  }

  function itemCount(row) {
    return Array.isArray(row.items) ? row.items.length : 0;
  }

  function outstanding(row) {
    if (!Array.isArray(row.items)) return 0;
    return row.items.reduce(function (total, item) {
      return total + (Number(item.outstanding) || 0);
    }, 0);
  }

  function statusLabel(status) {
    return labels[status] || String(status || "Updated").replace(/_/g, " ");
  }

  function statusIcon(status) {
    return ICONS[status] || ICONS.pending;
  }

  function canReturn(row) {
    return RETURN_STATUSES.indexOf(row.status) !== -1 && outstanding(row) > 0;
  }

  function returnUrl(row) {
    return "return_equipment/return_equipment.html?request=" + encodeURIComponent(row.id);
  }

  function requestUrl(row) {
    return "my_requests/my_requests.html?request=" + encodeURIComponent(row.id);
  }

  function openRequests() {
    return requests.filter(function (row) {
      return OPEN_STATUSES.indexOf(row.status) !== -1;
    });
  }

  function returnRequests() {
    return requests.filter(function (row) {
      return RETURN_STATUSES.indexOf(row.status) !== -1 && parseDateTime(row.returnBy);
    });
  }

  function renderUser() {
    var user = store.currentUser();
    var name = user && user.name ? user.name : "User";
    byId("dash-name").textContent = name;
    if (window.LabLinkHeader && user) {
      window.LabLinkHeader.setUser(name, user.role === "user" ? "University User" : user.role);
    }
  }

  function renderStats() {
    var pending = requests.filter(function (row) { return row.status === "pending"; });
    var active = requests.filter(function (row) {
      return ["active", "return_requested", "partially_returned"].indexOf(row.status) !== -1;
    });
    var activeItems = active.reduce(function (total, row) { return total + outstanding(row); }, 0);
    var overdue = requests.filter(function (row) { return row.status === "overdue"; });

    var dueThisWeek = returnRequests().filter(function (row) {
      var due = parseDateTime(row.returnBy);
      var diff = daysBetween(new Date(), due);
      return diff >= 0 && diff <= 7;
    }).sort(function (first, second) {
      return parseDateTime(first.returnBy) - parseDateTime(second.returnBy);
    });

    byId("stat-pending").textContent = String(pending.length);
    byId("stat-active").textContent = String(active.length);
    byId("stat-active-hint").textContent = plural(activeItems, "item") + " in your hands";
    byId("stat-due").textContent = String(dueThisWeek.length);
    byId("stat-overdue").textContent = String(overdue.length);

    var dueHint = byId("stat-due-hint");
    if (dueThisWeek.length) {
      var next = parseDateTime(dueThisWeek[0].returnBy);
      dueHint.textContent = "Next: " + formatMoment(next, hasTime(dueThisWeek[0].returnBy));
    } else {
      dueHint.textContent = "Nothing due this week";
    }

    var overdueCard = byId("stat-overdue").closest(".dash-stat");
    var overdueHint = byId("stat-overdue-hint");
    if (overdue.length === 0) {
      overdueCard.classList.add("is-clear");
      overdueHint.innerHTML = '<svg class="dash-stat__check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"></path></svg><span>All clear</span>';
    } else {
      overdueCard.classList.remove("is-clear");
      overdueHint.textContent = "Return needed now";
    }

    var live = byId("dash-live");
    if (live) {
      live.textContent = plural(openRequests().length, "open request") + ". " + plural(overdue.length, "overdue request") + ".";
    }
  }

  function renderNextDue() {
    var upcoming = returnRequests().sort(function (first, second) {
      return parseDateTime(first.returnBy) - parseDateTime(second.returnBy);
    });

    var next = upcoming.filter(function (row) {
      return daysBetween(new Date(), parseDateTime(row.returnBy)) >= 0;
    })[0] || upcoming[0];

    var label = byId("next-due-label");
    var title = byId("next-due-title");
    var meta = byId("next-due-meta");
    var action = byId("next-due-action");

    if (!next) {
      label.textContent = "NEXT RETURN DUE";
      title.textContent = "Nothing due right now";
      meta.textContent = "You have no returns scheduled.";
      action.textContent = "Browse equipment";
      action.href = "equipment_catalog/equipment_catalog.html";
      return;
    }

    var due = parseDateTime(next.returnBy);
    var remaining = due.getTime() - Date.now();

    if (remaining < 0) {
      var hoursLate = Math.max(1, Math.round(Math.abs(remaining) / 3600000));
      label.textContent = "NEXT RETURN DUE · OVERDUE BY " + (hoursLate >= 24 ? plural(Math.round(hoursLate / 24), "DAY", "DAYS") : plural(hoursLate, "HOUR", "HOURS"));
    } else if (remaining < 86400000) {
      var hoursLeft = Math.max(1, Math.round(remaining / 3600000));
      label.textContent = "NEXT RETURN DUE · IN " + plural(hoursLeft, "HOUR", "HOURS");
    } else {
      var daysLeft = Math.max(1, Math.round(remaining / 86400000));
      label.textContent = "NEXT RETURN DUE · IN " + plural(daysLeft, "DAY", "DAYS");
    }

    title.textContent = formatMoment(due, hasTime(next.returnBy)) + " · " + (next.purpose || "Borrow request");
    meta.textContent = next.id + " · " + plural(itemCount(next), "item");
    action.textContent = "View request";
    action.href = requestUrl(next);
  }

  function dueInfo(row) {
    var now = new Date();

    if (row.status === "pending" || row.status === "approved") {
      var pickup = parseDateTime(row.borrow);
      return {
        date: pickup ? formatDate(pickup) : "To be scheduled",
        hint: row.status === "pending" ? "Requested pickup" : "Awaiting pickup"
      };
    }

    if (row.status === "returned") {
      var actual = parseDateTime(row.actualReturn) || parseDateTime(row.returnBy);
      return { date: actual ? formatDate(actual) : "Returned", hint: "Return completed" };
    }

    if (row.status === "rejected" || row.status === "cancelled") {
      return { date: "—", hint: statusLabel(row.status) };
    }

    var due = parseDateTime(row.returnBy);
    if (!due) {
      return { date: "No due date", hint: "Contact laboratory staff" };
    }

    var diff = daysBetween(now, due);
    var withTime = hasTime(row.returnBy);

    if (diff < 0) {
      return {
        date: formatDate(due),
        hint: plural(Math.abs(diff), "day") + " overdue",
        late: true
      };
    }

    if (isSameDay(due, now)) {
      return {
        date: "Today" + (withTime ? ", " + formatTime(due) : ""),
        hint: "Due today"
      };
    }

    if (diff <= 7) {
      return { date: formatDate(due), hint: "Due in " + plural(diff, "day") };
    }

    var released = parseDateTime(row.releaseDate);
    return {
      date: formatDate(due),
      hint: released ? "Borrowed " + formatDate(released) : "Due in " + plural(diff, "day")
    };
  }

  function buildRequestRow(row) {
    var item = document.createElement("li");
    item.className = "dash-req";
    if (row.status === "overdue") item.classList.add("is-overdue");

    var main = document.createElement("div");
    main.className = "dash-req__main";

    var title = document.createElement("p");
    title.className = "dash-req__title";
    title.textContent = row.purpose || "Borrow request";

    var meta = document.createElement("p");
    meta.className = "dash-req__meta";
    meta.textContent = row.id + " · " + plural(itemCount(row), "item");

    main.appendChild(title);
    main.appendChild(meta);

    var status = document.createElement("span");
    status.className = "dash-status dash-status--" + row.status;
    status.innerHTML = statusIcon(row.status);
    var statusText = document.createElement("span");
    statusText.textContent = statusLabel(row.status);
    status.appendChild(statusText);

    var due = document.createElement("div");
    due.className = "dash-due";
    var info = dueInfo(row);
    var dueDate = document.createElement("span");
    dueDate.className = "dash-due__date";
    dueDate.textContent = info.date;
    var dueHint = document.createElement("span");
    dueHint.className = "dash-due__hint" + (info.late ? " is-late" : "");
    dueHint.textContent = info.hint;
    due.appendChild(dueDate);
    due.appendChild(dueHint);

    var action = document.createElement("a");
    action.className = "dash-act " + (canReturn(row) ? "dash-act--primary" : "dash-act--ghost");
    action.textContent = canReturn(row) ? "Return" : "View";
    action.href = canReturn(row) || row.status === "return_requested" ? returnUrl(row) : requestUrl(row);
    action.setAttribute("aria-label", action.textContent + " " + row.id);

    item.appendChild(main);
    item.appendChild(status);
    item.appendChild(due);
    item.appendChild(action);

    return item;
  }

  function renderRequests() {
    var open = openRequests().sort(function (first, second) {
      var rank = { overdue: 0, active: 1, return_requested: 2, partially_returned: 2, approved: 3, pending: 4 };
      var firstRank = rank[first.status] == null ? 5 : rank[first.status];
      var secondRank = rank[second.status] == null ? 5 : rank[second.status];
      if (firstRank !== secondRank) return firstRank - secondRank;

      var firstDate = parseDateTime(first.returnBy) || parseDateTime(first.borrow);
      var secondDate = parseDateTime(second.returnBy) || parseDateTime(second.borrow);
      if (firstDate && secondDate) return firstDate - secondDate;
      return 0;
    });

    var list = byId("req-list");
    var empty = byId("req-empty");
    var more = byId("req-more");

    list.innerHTML = "";

    if (!open.length) {
      list.hidden = true;
      empty.hidden = false;
      more.hidden = true;
      return;
    }

    empty.hidden = true;
    open.slice(0, MAX_ROWS).forEach(function (row) {
      list.appendChild(buildRequestRow(row));
    });
    list.hidden = false;

    if (open.length > MAX_ROWS) {
      more.hidden = false;
      more.textContent = "View all " + open.length + " requests";
    } else {
      more.hidden = true;
    }
  }

  function addEvent(storeForDay, type, value) {
    if (storeForDay[type].indexOf(value) === -1) storeForDay[type].push(value);
  }

  function buildEvents() {
    eventMap = {};

    requests.forEach(function (row) {
      var purpose = row.purpose || "Borrow request";
      var name = purpose + " (" + row.id + ")";

      function add(value, type, text) {
        var date = parseDateTime(value);
        if (!date) return;
        var key = dateKey(date);
        if (!eventMap[key]) eventMap[key] = { pickup: [], pending: [], return: [] };
        addEvent(eventMap[key], type, text);
      }

      if (row.status === "pending") {
        add(row.borrow, "pending", "Pending pickup · " + name);
      } else if (row.status === "approved") {
        add(row.borrow, "pickup", "Pickup · " + name);
      } else if (RETURN_STATUSES.indexOf(row.status) !== -1) {
        add(row.releaseDate, "pickup", "Pickup · " + name);
        add(row.returnBy, "return", "Return due · " + name);
      } else if (row.status === "returned") {
        add(row.actualReturn || row.returnBy, "return", "Returned · " + name);
      }
    });
  }

  function renderCalendar() {
    byId("cal-title").textContent = months[view.month] + " " + view.year;

    var body = byId("cal-body");
    body.innerHTML = "";

    var lead = new Date(view.year, view.month, 1).getDay();
    var total = new Date(view.year, view.month + 1, 0).getDate();
    var cells = Math.ceil((lead + total) / 7) * 7;
    var row;

    for (var index = 0; index < cells; index++) {
      if (index % 7 === 0) {
        row = document.createElement("tr");
        body.appendChild(row);
      }

      var cell = document.createElement("td");
      var number = index - lead + 1;

      if (number >= 1 && number <= total) {
        var date = new Date(view.year, view.month, number);
        var key = dateKey(date);
        var dayEvents = eventMap[key];

        cell.className = "dash-cal-cell";
        if (isSameDay(date, new Date())) {
          cell.classList.add("dash-cal-today");
          cell.setAttribute("aria-current", "date");
        }

        var day = document.createElement("span");
        day.className = "dash-cal-num";
        day.textContent = String(number);
        cell.appendChild(day);

        if (dayEvents) {
          var types = ["pickup", "return", "pending"].filter(function (type) {
            return dayEvents[type].length;
          });

          if (types.length) {
            var dots = document.createElement("span");
            dots.className = "dash-dots";
            dots.setAttribute("aria-hidden", "true");

            types.forEach(function (type) {
              var dot = document.createElement("span");
              dot.className = "dash-dot dash-dot--" + type;
              dots.appendChild(dot);
            });

            cell.appendChild(dots);

            var tooltip = [];
            types.forEach(function (type) {
              tooltip = tooltip.concat(dayEvents[type]);
            });

            cell.setAttribute("data-tooltip", tooltip.join(" • "));
            cell.setAttribute("aria-label", formatDate(date) + ". " + tooltip.join(". "));
            cell.tabIndex = 0;
          }
        }
      }

      row.appendChild(cell);
    }

    var present = { pickup: false, return: false, pending: false };
    Object.keys(eventMap).forEach(function (key) {
      Object.keys(present).forEach(function (type) {
        if (eventMap[key][type].length) present[type] = true;
      });
    });

    var legend = byId("cal-legend");
    var any = false;
    Array.prototype.forEach.call(legend.querySelectorAll("[data-legend]"), function (item) {
      var show = present[item.getAttribute("data-legend")];
      item.hidden = !show;
      if (show) any = true;
    });
    legend.hidden = !any;
  }

  function noticeLabel(kind, date, diff, withTime) {
    if (kind === "overdue") {
      return "Overdue · " + plural(Math.abs(diff), "day");
    }
    if (kind === "today") {
      return "Due today" + (withTime ? " · " + formatTime(date) : " · " + formatDate(date));
    }
    if (kind === "pickup") {
      if (diff === 0) return "Pickup today · " + formatDate(date);
      return "Pickup in " + plural(diff, "day") + " · " + formatDate(date);
    }
    return "Return in " + plural(diff, "day") + " · " + formatDate(date);
  }

  function buildNotice(entry) {
    var item = document.createElement("li");
    item.className = "dash-notice dash-notice--" + entry.kind;

    var icon = document.createElement("span");
    icon.className = "dash-notice__icon";
    icon.innerHTML = NOTICE_ICONS[entry.icon];
    icon.setAttribute("aria-hidden", "true");

    var body = document.createElement("div");
    body.className = "dash-notice__body";

    var label = document.createElement("p");
    label.className = "dash-notice__label";
    label.textContent = entry.label;

    var title = document.createElement("p");
    title.className = "dash-notice__title";
    title.textContent = entry.title;

    var meta = document.createElement("p");
    meta.className = "dash-notice__meta";
    meta.textContent = entry.meta;

    body.appendChild(label);
    body.appendChild(title);
    body.appendChild(meta);

    var link = document.createElement("a");
    link.className = "dash-notice__link";
    link.href = entry.href;
    link.textContent = entry.linkText;
    link.setAttribute("aria-label", entry.linkText + " for " + (entry.title || entry.meta));

    item.appendChild(icon);
    item.appendChild(body);
    item.appendChild(link);

    return item;
  }

  function buildNotices() {
    var now = new Date();
    var notices = [];

    requests.forEach(function (row) {
      var purpose = row.purpose || "Borrow request";
      var count = itemCount(row);
      var title = purpose + " - " + plural(count, "item");
      var id = row.id;

      if (row.status === "overdue") {
        var overdue = parseDateTime(row.returnBy);
        if (!overdue) return;
        var overdueDiff = daysBetween(now, overdue);
        notices.push({
          kind: "overdue",
          icon: "overdue",
          sort: overdue.getTime(),
          label: noticeLabel("overdue", overdue, overdueDiff, false),
          title: title,
          meta: id + " · Was due " + formatDate(overdue),
          href: returnUrl(row),
          linkText: "Return now"
        });
        return;
      }

      if (RETURN_STATUSES.indexOf(row.status) !== -1) {
        var due = parseDateTime(row.returnBy);
        if (!due) return;
        var diff = daysBetween(now, due);
        if (diff < 0) {
          notices.push({
            kind: "overdue",
            icon: "overdue",
            sort: due.getTime(),
            label: noticeLabel("overdue", due, diff, false),
            title: title,
            meta: id + " · Was due " + formatDate(due),
            href: returnUrl(row),
            linkText: "Return now"
          });
          return;
        }
        if (diff === 0) {
          notices.push({
            kind: "today",
            icon: "today",
            sort: due.getTime() - 86400000,
            label: noticeLabel("today", due, diff, hasTime(row.returnBy)),
            title: title,
            meta: id + " · " + plural(count, "item"),
            href: returnUrl(row),
            linkText: "View return details"
          });
          return;
        }
        if (diff <= 7) {
          notices.push({
            kind: "upcoming",
            icon: "upcoming",
            sort: due.getTime(),
            label: noticeLabel("return", due, diff, false),
            title: title,
            meta: id + " · " + plural(count, "item"),
            href: returnUrl(row),
            linkText: "View return details"
          });
        }
        return;
      }

      if (row.status === "pending" || row.status === "approved") {
        var pickup = parseDateTime(row.borrow);
        if (!pickup) return;
        var pickupDiff = daysBetween(now, pickup);
        if (pickupDiff < 0 || pickupDiff > 7) return;
        notices.push({
          kind: "upcoming",
          icon: "upcoming",
          sort: pickup.getTime() + 43200000,
          label: noticeLabel("pickup", pickup, pickupDiff, false),
          title: title,
          meta: id + " · " + (row.status === "pending" ? "Pending approval" : "Awaiting pickup"),
          href: requestUrl(row),
          linkText: "View request"
        });
      }
    });

    notices.sort(function (first, second) { return first.sort - second.sort; });
    return notices.slice(0, 6);
  }

  function renderNotices() {
    var list = byId("dl-list");
    var empty = byId("dl-empty");
    var notices = buildNotices();

    list.innerHTML = "";

    if (!notices.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    notices.forEach(function (entry) {
      list.appendChild(buildNotice(entry));
    });
    list.hidden = false;
  }

  function renderAll() {
    requests = store.requests() || [];

    renderUser();
    renderStats();
    renderNextDue();
    renderRequests();
    buildEvents();
    renderCalendar();
    renderNotices();

    var reqSkeleton = byId("req-skeleton");
    if (reqSkeleton) reqSkeleton.hidden = true;

    var dlSkeleton = byId("dl-skeleton");
    if (dlSkeleton) dlSkeleton.hidden = true;

    var reqList = byId("req-list");
    if (reqList) reqList.setAttribute("aria-busy", "false");
  }

  function renderError(error) {
    console.error("[LabLink dashboard] Could not load dashboard data.", error);

    var reqSkeleton = byId("req-skeleton");
    if (reqSkeleton) reqSkeleton.hidden = true;

    var dlSkeleton = byId("dl-skeleton");
    if (dlSkeleton) dlSkeleton.hidden = true;

    var reqEmpty = byId("req-empty");
    reqEmpty.hidden = false;
    reqEmpty.querySelector(".dash-empty-title").textContent = "Dashboard unavailable";
    reqEmpty.querySelector(".dash-empty-text").textContent = error && error.message ? error.message : "Refresh the page to try again.";

    var reqList = byId("req-list");
    reqList.hidden = true;
    reqList.setAttribute("aria-busy", "false");

    var more = byId("req-more");
    more.hidden = true;

    byId("dl-empty").hidden = false;
    byId("dl-empty").textContent = "Deadlines are unavailable right now.";

    byId("next-due-title").textContent = "Schedule unavailable";
    byId("next-due-meta").textContent = "Refresh the page to try again.";
    byId("next-due-action").textContent = "Retry";
    byId("next-due-action").href = window.location.href;

    ["stat-pending", "stat-active", "stat-due", "stat-overdue"].forEach(function (id) {
      byId(id).textContent = "—";
    });
    byId("stat-active-hint").textContent = "Unavailable";
    byId("stat-due-hint").textContent = "Unavailable";
    byId("stat-overdue-hint").textContent = "Unavailable";
  }

  byId("cal-prev").addEventListener("click", function () {
    var date = new Date(view.year, view.month - 1, 1);
    view.year = date.getFullYear();
    view.month = date.getMonth();
    renderCalendar();
  });

  byId("cal-next").addEventListener("click", function () {
    var date = new Date(view.year, view.month + 1, 1);
    view.year = date.getFullYear();
    view.month = date.getMonth();
    renderCalendar();
  });

  document.addEventListener("lablink:header-ready", renderUser);
  window.addEventListener("lablink:data-changed", renderAll);

  store.ready.then(renderAll).catch(renderError);
})();
