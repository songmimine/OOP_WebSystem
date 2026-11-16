/* ==========================================================================
   LPU Cavite – Laboratory Equipment System · Global Header
   ---------------------------------------------------------------------------
   Usage on any page (any folder depth):

     <div id="lablink-header" data-active="dashboard"></div>
     <script src="../header/header.js"></script>

   The script:
     1. Loads header.css and header.html from the same folder as this file.
     2. Resolves logo / link paths relative to the univ_lablink root.
     3. Wires up the live clock, navigation, profile menu and notifications.

   Public API:
     window.LabLinkHeader.setNotificationCount(n)
     window.setNotificationCount(n)               (shortcut)
     window.LabLinkHeader.setActive("catalog")
     window.LabLinkHeader.setUser("Juan Dela Cruz", "Laboratory Staff")

   NOTE: fetch() needs http(s). Open the project with a local server
   (e.g. VS Code "Live Server"); it will not load from file://.
   ========================================================================== */

(function () {
  "use strict";

  // Folder that contains this script (…/univ_lablink/header/)
  var scriptSrc = document.currentScript && document.currentScript.src;
  var HEADER_DIR = scriptSrc
    ? new URL("./", scriptSrc).href
    : new URL("./", document.baseURI).href;
  // Project root (…/univ_lablink/)
  var ROOT_DIR = new URL("../", HEADER_DIR).href;

  var READ_KEY = "lablink_notifications_read";
  var clockTimer = null;
  var rootEl = null;
  var pendingCount = null;
  var notificationItems = [];
  var notificationsLoaded = false;
  var notificationError = false;
  var notificationLoading = false;
  var notifTimer = null;

  var clockDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  var clockTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  var NOTIF_ICONS = {
    approved: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12.2 2.6 2.6L16.4 9"></path></svg>',
    due: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    pending: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>',
    overdue: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 20H3z"></path><path d="M12 9v5"></path><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"></circle></svg>',
    returned: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12.2 2.6 2.6L16.4 9"></path></svg>',
    return: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M4 17v-5h5"></path><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"></path></svg>',
    rejected: '<svg class="msh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>'
  };

  /* ---------- Live date / time ---------- */
  function formatDateTime(date) {
    return clockDate.format(date) + " · " + clockTime.format(date);
  }

  function startClock(root) {
    var el = root.querySelector("[data-datetime]");
    if (!el) return;

    function tick() {
      var now = new Date();
      el.textContent = formatDateTime(now);
      el.setAttribute("datetime", now.toISOString());
    }

    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 15000);
  }

  /* ---------- Notification badge ---------- */
  function setNotificationCount(count) {
    var n = parseInt(count, 10);
    if (isNaN(n) || n < 0) n = 0;

    if (!rootEl) {
      pendingCount = n; // header not loaded yet; apply after init
      return;
    }

    var badge = rootEl.querySelector("[data-notification-badge]");
    var bell = rootEl.querySelector("[data-notification-bell]") || rootEl.querySelector(".msh-bell");
    if (!badge) return;

    if (n > 0) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = false;
      if (bell) bell.setAttribute("aria-label", "Notifications, " + n + " unread");
    } else {
      badge.textContent = "0";
      badge.hidden = true;
      if (bell) bell.setAttribute("aria-label", "Notifications");
    }
  }

  /* ---------- Signed-in user (shown in dropdown card) ---------- */
  function setUser(name, role) {
    if (!rootEl) return;
    var nameEl = rootEl.querySelector("[data-user-name]");
    var roleEl = rootEl.querySelector("[data-user-role]");
    if (nameEl && name != null) nameEl.textContent = name || "User";
    if (roleEl && role != null) {
      roleEl.textContent = role;
      roleEl.hidden = !role; // hide the role line when there is none
    }
  }

  /* ---------- Notification read state ---------- */
  function readSet() {
    try {
      var value = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeSet(ids) {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-200)));
    } catch (error) {
      // Private browsing can block storage; the panel still works for this visit.
    }
  }

  function relativeTime(value) {
    var date = new Date(String(value || "").replace(" ", "T"));
    if (isNaN(date.getTime())) return "";

    var seconds = Math.round((Date.now() - date.getTime()) / 1000);
    var amount;

    if (seconds < 0) {
      amount = Math.abs(seconds);
      if (amount < 60) return "In a moment";
      if (amount < 3600) return "In " + Math.round(amount / 60) + " min";
      if (amount < 86400) {
        var futureHours = Math.round(amount / 3600);
        return "In " + futureHours + (futureHours === 1 ? " hour" : " hours");
      }
      var futureDays = Math.round(amount / 86400);
      if (futureDays < 7) return "In " + futureDays + (futureDays === 1 ? " day" : " days");
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    if (seconds < 45) return "Just now";
    if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + " min ago";
    if (seconds < 86400) {
      amount = Math.round(seconds / 3600);
      return amount + (amount === 1 ? " hour ago" : " hours ago");
    }
    amount = Math.round(seconds / 86400);
    if (amount < 7) return amount + (amount === 1 ? " day ago" : " days ago");
    amount = Math.round(amount / 7);
    if (amount < 5) return amount + (amount === 1 ? " week ago" : " weeks ago");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function notifIcon(type) {
    return NOTIF_ICONS[type] || NOTIF_ICONS.pending;
  }

  /* ---------- Notification panel ---------- */
  function initNotifications(root) {
    var bell = root.querySelector("[data-notification-bell]");
    var panel = root.querySelector("[data-notif-panel]");
    if (!bell || !panel) return;

    var list = panel.querySelector("[data-notif-list]");
    var empty = panel.querySelector("[data-notif-empty]");
    var markAll = panel.querySelector("[data-notif-markall]");
    var closeBtn = panel.querySelector("[data-notif-close]");
    var viewAll = panel.querySelector("[data-notif-viewall]");

    function closeProfileMenu() {
      var menu = root.querySelector("[data-profile-menu]");
      var toggle = root.querySelector("[data-profile-toggle]");
      if (menu && !menu.hidden) {
        menu.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    }

    function positionPanel() {
      if (window.matchMedia("(max-width: 820px)").matches) {
        var rect = root.getBoundingClientRect();
        panel.style.top = Math.round(rect.bottom + 8) + "px";
        panel.style.left = "12px";
        panel.style.right = "12px";
      } else {
        panel.style.top = "";
        panel.style.left = "";
        panel.style.right = "";
      }
    }

    function renderSkeleton() {
      list.innerHTML = "";
      for (var index = 0; index < 3; index++) {
        var row = document.createElement("li");
        row.className = "msh-notif-skeleton-item";
        row.setAttribute("role", "none");
        row.appendChild(document.createElement("span"));
        row.appendChild(document.createElement("span"));
        list.appendChild(row);
      }
      list.hidden = false;
      empty.hidden = true;
      markAll.disabled = true;
    }

    function updateState() {
      var read = readSet();
      var unread = notificationItems.filter(function (item) {
        return read.indexOf(item.id) === -1;
      });

      setNotificationCount(unread.length);
      markAll.disabled = unread.length === 0;

      Array.prototype.forEach.call(list.querySelectorAll(".msh-notif-item"), function (link) {
        var item = notificationItems.filter(function (entry) { return entry.id === link.getAttribute("data-id"); })[0];
        if (!item) return;
        var isRead = read.indexOf(item.id) !== -1;
        link.classList.toggle("is-unread", !isRead);
        link.classList.toggle("is-read", isRead);
        link.setAttribute(
          "aria-label",
          (isRead ? "" : "Unread. ") + (item.title || "Notification") + ". " +
          (item.message || "") + " " + relativeTime(item.time)
        );
      });
    }

    function render() {
      list.innerHTML = "";

      if (!notificationItems.length) {
        list.hidden = true;
        empty.hidden = false;
        empty.textContent = notificationError
          ? "Notifications are unavailable right now."
          : "You're all caught up.";
        markAll.disabled = true;
        setNotificationCount(0);
        return;
      }

      var read = readSet();
      empty.hidden = true;
      list.hidden = false;

      notificationItems.forEach(function (item) {
        var row = document.createElement("li");
        row.setAttribute("role", "none");

        var link = document.createElement("a");
        link.className = "msh-notif-item " + (read.indexOf(item.id) === -1 ? "is-unread" : "is-read");
        link.setAttribute("role", "menuitem");
        link.setAttribute("data-id", item.id);
        link.href = item.url ? new URL(item.url, ROOT_DIR).href : "#";
        link.setAttribute(
          "aria-label",
          (read.indexOf(item.id) === -1 ? "Unread. " : "") + (item.title || "Notification") + ". " +
          (item.message || "") + " " + relativeTime(item.time)
        );

        var icon = document.createElement("span");
        icon.className = "msh-notif-icon msh-notif-icon--" + (item.type || "pending");
        icon.setAttribute("aria-hidden", "true");
        icon.innerHTML = notifIcon(item.type);

        var body = document.createElement("span");
        body.className = "msh-notif-body";

        var top = document.createElement("span");
        top.className = "msh-notif-top";

        var title = document.createElement("span");
        title.className = "msh-notif-title";
        title.textContent = item.title || "Notification";

        var time = document.createElement("span");
        time.className = "msh-notif-time";
        time.textContent = relativeTime(item.time);

        var message = document.createElement("span");
        message.className = "msh-notif-message";
        message.textContent = item.message || "";

        var dot = document.createElement("span");
        dot.className = "msh-notif-unread";
        dot.setAttribute("aria-hidden", "true");

        top.appendChild(title);
        top.appendChild(time);
        body.appendChild(top);
        body.appendChild(message);

        link.appendChild(icon);
        link.appendChild(body);
        link.appendChild(dot);
        row.appendChild(link);
        list.appendChild(row);

        link.addEventListener("click", function () {
          var current = readSet();
          if (current.indexOf(item.id) === -1) {
            current.push(item.id);
            writeSet(current);
          }
          updateState();
        });
      });

      updateState();
    }

    function loadNotifications() {
      if (notificationLoading) return;
      notificationLoading = true;

      if (!panel.hidden && !notificationItems.length) renderSkeleton();

      fetch("/api/notifications/mine", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          notificationItems = Array.isArray(data.items) ? data.items.slice(0, 20) : [];
          notificationsLoaded = true;
          notificationError = false;
          if (viewAll && data.viewAllUrl) viewAll.setAttribute("href", new URL(data.viewAllUrl, ROOT_DIR).href);
          render();
        })
        .catch(function (error) {
          notificationError = true;
          console.error("[LabLink notifications] Could not load updates.", error);
          if (!panel.hidden) render();
        })
        .finally(function () {
          notificationLoading = false;
        });
    }

    function openPanel() {
      closeProfileMenu();
      panel.hidden = false;
      bell.setAttribute("aria-expanded", "true");
      root.classList.add("notif-open");
      positionPanel();
      if (!notificationsLoaded) loadNotifications();
      panel.focus();
    }

    function closePanel(returnFocus) {
      panel.hidden = true;
      bell.setAttribute("aria-expanded", "false");
      root.classList.remove("notif-open");
      if (returnFocus) bell.focus();
    }

    bell.addEventListener("click", function (event) {
      event.stopPropagation();
      if (panel.hidden) openPanel();
      else closePanel(true);
    });

    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        closePanel(true);
      });
    }

    if (markAll) {
      markAll.addEventListener("click", function () {
        var current = readSet();
        notificationItems.forEach(function (item) {
          if (current.indexOf(item.id) === -1) current.push(item.id);
        });
        writeSet(current);
        updateState();
        markAll.focus();
      });
    }

    if (viewAll) {
      viewAll.addEventListener("click", function () {
        closePanel(false);
      });
    }

    panel.addEventListener("keydown", function (event) {
      if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) === -1) return;
      var items = Array.prototype.slice.call(panel.querySelectorAll(".msh-notif-item"));
      if (!items.length) return;

      var index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") index = index < 0 || index >= items.length - 1 ? 0 : index + 1;
      if (event.key === "ArrowUp") index = index <= 0 ? items.length - 1 : index - 1;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = items.length - 1;

      event.preventDefault();
      items[index].focus();
    });

    document.addEventListener("click", function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) {
        closePanel(panel.contains(document.activeElement));
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) {
        closePanel(true);
      }
    });

    window.addEventListener("resize", function () {
      if (!panel.hidden) positionPanel();
    });

    window.addEventListener("lablink:data-changed", loadNotifications);

    if (notifTimer) clearInterval(notifTimer);
    notifTimer = setInterval(function () {
      if (!document.hidden) loadNotifications();
    }, 60000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) loadNotifications();
    });

    loadNotifications();
  }

  /* ---------- Profile dropdown ---------- */
  function initProfileMenu(root) {
    var toggle = root.querySelector("[data-profile-toggle]");
    var menu = root.querySelector("[data-profile-menu]");
    if (!toggle || !menu) return;

    function closeNotifications() {
      var panel = root.querySelector("[data-notif-panel]");
      var bell = root.querySelector("[data-notification-bell]");
      if (panel && !panel.hidden) {
        panel.hidden = true;
        if (bell) bell.setAttribute("aria-expanded", "false");
      }
    }

    function open() {
      closeNotifications();
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      var first = menu.querySelector('[role="menuitem"]');
      if (first) first.focus();
    }

    function close() {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      if (menu.hidden) open();
      else {
        close();
        toggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) {
        var keepFocus = menu.contains(document.activeElement);
        close();
        if (keepFocus) toggle.focus();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) {
        close();
        toggle.focus();
      }
    });

    menu.addEventListener("keydown", function (event) {
      if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) === -1) return;
      var items = Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
      if (!items.length) return;

      var index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown") index = index < 0 || index >= items.length - 1 ? 0 : index + 1;
      if (event.key === "ArrowUp") index = index <= 0 ? items.length - 1 : index - 1;
      if (event.key === "Home") index = 0;
      if (event.key === "End") index = items.length - 1;

      event.preventDefault();
      items[index].focus();
    });

    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) close();
    });
  }

  /* ---------- Mobile navigation ---------- */
  function initNavToggle(root) {
    var toggle = root.querySelector("[data-nav-toggle]");
    var nav = root.querySelector("#msh-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      root.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(!root.classList.contains("nav-open"));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (root.classList.contains("nav-open") && !root.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && root.classList.contains("nav-open")) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024 && root.classList.contains("nav-open")) {
        setOpen(false);
      }
    });
  }

  function initSearch(root) {
    var form = root.querySelector(".msh-search");
    var input = root.querySelector(".msh-search-input");
    var suggestionList = root.querySelector("[data-search-suggestions]");
    if (!form || !input) return;

    var navigationSuggestions = [
      { name: "Dashboard", page: "Dashboard", path: "user_dashboard/user_dashboard.html", terms: ["dashboard", "home", "overview"] },
      { name: "Borrowing Request Form", page: "Borrowing Request Form", path: "user_dashboard/borrow_request_form/borrow_request_form.html", terms: ["borrow", "borrowing", "request", "form"] },
      { name: "Equipment Catalog", page: "Equipment Catalog", path: "user_dashboard/equipment_catalog/equipment_catalog.html", terms: ["equipment", "catalog", "inventory", "category", "categories"] },
      { name: "My Requests", page: "My Requests", path: "user_dashboard/my_requests/my_requests.html", terms: ["my requests", "requests", "status", "approval"] },
      { name: "Borrowed Equipment", page: "Borrowed Equipment", path: "user_dashboard/currently_borrowing/currently_borrowing.html", terms: ["borrowed", "currently borrowing", "active borrowing"] },
      { name: "Return Management", page: "Return Management", path: "user_dashboard/return_equipment/return_equipment.html", terms: ["return", "returns", "deadline", "due"] },
      { name: "About", page: "About", path: "user_welcome/about.html", terms: ["about", "laboratory", "system"] }
    ];
    var equipmentSuggestions = [];
    var searchDataPromise;

    function escapeSearch(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
      });
    }

    function highlightSearch(value, query) {
      var text = String(value == null ? "" : value);
      var index = text.toLowerCase().indexOf(query.toLowerCase());
      if (index === -1) return escapeSearch(text);
      return escapeSearch(text.slice(0, index)) + "<mark>" +
        escapeSearch(text.slice(index, index + query.length)) + "</mark>" +
        escapeSearch(text.slice(index + query.length));
    }

    function loadEquipmentSuggestions() {
      if (searchDataPromise) return searchDataPromise;
      searchDataPromise = fetch("/api/equipment").then(function (response) {
        if (!response.ok) throw new Error("Equipment search unavailable.");
        return response.json();
      }).then(function (data) {
        equipmentSuggestions = [];
        (data.items || []).forEach(function (item) {
          if (item.name) equipmentSuggestions.push({ name: item.name, page: "Equipment Catalog", path: "user_dashboard/equipment_catalog/equipment_catalog.html", query: item.name });
          if (item.category) equipmentSuggestions.push({ name: item.category, page: "Equipment Catalog", path: "user_dashboard/equipment_catalog/equipment_catalog.html", query: item.category });
        });
        return equipmentSuggestions;
      }).catch(function (error) {
        console.error("[LabLink user header] Equipment search could not be loaded.", error);
        return [];
      });
      return searchDataPromise;
    }

    function suggestionsFor(query) {
      var normalized = query.toLowerCase();
      var matches = navigationSuggestions.filter(function (item) {
        return item.name.toLowerCase().indexOf(normalized) !== -1 ||
          item.terms.some(function (term) { return term.indexOf(normalized) !== -1; });
      }).concat(equipmentSuggestions.filter(function (item) {
        return item.name.toLowerCase().indexOf(normalized) !== -1;
      }));
      var seen = {};
      return matches.filter(function (item) {
        var key = item.name.toLowerCase() + "|" + item.path;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      }).slice(0, 12);
    }

    function renderSuggestions(query, matches) {
      if (!query) {
        suggestionList.hidden = true;
        suggestionList.innerHTML = "";
        return;
      }
      suggestionList.hidden = false;
      suggestionList.innerHTML = matches.length ? matches.map(function (item, index) {
        return '<li><button class="msh-search-suggestion" type="button" data-search-suggestion-index="' + index + '"><strong>' +
          highlightSearch(item.name, query) + '</strong> <span>— from ' + escapeSearch(item.page) + "</span></button></li>";
      }).join("") : '<li class="msh-search-empty">No matching user-side results found.</li>';
    }

    function navigateSearch(item, query) {
      var targetQuery = item && item.query ? item.query : query;
      var url = new URL(item ? item.path : "user_dashboard/equipment_catalog/equipment_catalog.html", ROOT_DIR);
      if (targetQuery) url.searchParams.set("q", targetQuery);
      window.location.assign(url.href);
    }

    input.addEventListener("input", function () {
      var query = input.value.trim();
      if (!query) return renderSuggestions("", []);
      renderSuggestions(query, suggestionsFor(query));
      loadEquipmentSuggestions().then(function () {
        if (input.value.trim() === query) renderSuggestions(query, suggestionsFor(query));
      });
    });

    suggestionList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-search-suggestion-index]");
      if (!button) return;
      var matches = suggestionsFor(input.value.trim());
      var selected = matches[Number(button.dataset.searchSuggestionIndex)];
      if (selected) navigateSearch(selected, input.value.trim());
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var query = input.value.trim();
      if (!query) return;
      var matches = suggestionsFor(query);
      navigateSearch(matches[0], query);
    });

    document.addEventListener("click", function (event) {
      if (!form.contains(event.target)) suggestionList.hidden = true;
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        suggestionList.hidden = true;
        input.blur();
      }
    });
  }

  /* ---------- Paths & active link ---------- */
  function resolvePaths(root) {
    root.querySelectorAll("[data-src]").forEach(function (el) {
      el.setAttribute("src", new URL(el.getAttribute("data-src"), ROOT_DIR).href);
    });
    root.querySelectorAll("[data-path]").forEach(function (el) {
      el.setAttribute("href", new URL(el.getAttribute("data-path"), ROOT_DIR).href);
    });
  }

  function setActive(key) {
    if (!rootEl) return;
    rootEl.querySelectorAll(".msh-nav-link").forEach(function (link) {
      var isMatch = link.getAttribute("data-nav") === key;
      link.classList.toggle("is-active", isMatch);
      if (isMatch) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function activeFromLocation() {
    var path = String(window.location.pathname || "").toLowerCase();
    if (path.indexOf("/borrow_request_form/") !== -1) return "borrow";
    if (path.indexOf("/equipment_catalog/") !== -1) return "catalog";
    if (path.indexOf("/return_equipment/") !== -1) return "returns";
    if (path.indexOf("/my_requests/") !== -1) return "requests";
    if (path.indexOf("/currently_borrowing/") !== -1) return "requests";
    if (path.indexOf("/user_dashboard.html") !== -1) return "dashboard";
    if (path.indexOf("/about") !== -1) return "about";
    return null;
  }

  /* ---------- Init ---------- */
  function init(root, activeKey) {
    rootEl = root;
    resolvePaths(root);
    initProfileMenu(root);
    initSearch(root);
    initNotifications(root);
    initNavToggle(root);

    // Existing pages pass generic keys ("requests", "settings"); refine them
    // from the URL so the most specific nav item highlights.
    var resolvedKey = activeFromLocation() || activeKey;
    if (resolvedKey) setActive(resolvedKey);

    // Default state: read data-count from the header element, else hide badge
    var initial = pendingCount !== null ? pendingCount : root.getAttribute("data-count");
    setNotificationCount(initial === null ? 0 : initial);

    document.dispatchEvent(new CustomEvent("lablink:header-ready", { detail: { root: root } }));
  }

  function ensureStylesheet() {
    var href = new URL("header.css", HEADER_DIR).href + "?v=9";
    var exists = Array.prototype.some.call(
      document.querySelectorAll('link[rel="stylesheet"]'),
      function (l) { return l.href === href; }
    );
    if (exists) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadUserFooter() {
    if (!document.body || document.getElementById("lablink-footer-mount")) return;

    var footerMount = document.createElement("div");
    footerMount.id = "lablink-footer-mount";
    document.body.appendChild(footerMount);

    var footerCss = document.createElement("link");
    footerCss.rel = "stylesheet";
    footerCss.href = new URL("../user_footer/user_footer.css", HEADER_DIR).href;
    document.head.appendChild(footerCss);

    fetch(new URL("../user_footer/user_footer.html", HEADER_DIR).href)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        footerMount.innerHTML = html;
        resolvePaths(footerMount);
      })
      .catch(function (err) {
        footerMount.remove();
        console.error("[LabLink footer] Could not load shared footer:", err);
      });
  }

  function mount() {
    loadUserFooter();
    var placeholder = document.getElementById("lablink-header");

    // Case 1: header markup is already inline on the page
    var inline = document.querySelector(".main-system-header");
    if (inline && !placeholder) {
      ensureStylesheet();
      init(inline, null);
      return;
    }

    // Case 2: load header.html into the placeholder
    if (!placeholder) return;
    var activeKey = placeholder.getAttribute("data-active");
    var count = placeholder.getAttribute("data-count");
    if (count !== null) pendingCount = parseInt(count, 10);

    ensureStylesheet();

    fetch(new URL("header.html", HEADER_DIR).href)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        placeholder.innerHTML = html;
        // Placeholder must not trap the sticky header inside a short box
        placeholder.style.display = "contents";
        init(placeholder.querySelector(".main-system-header"), activeKey);
      })
      .catch(function (err) {
        console.error("[LabLink header] Could not load header.html:", err);
      });
  }

  /* ---------- Public API ---------- */
  window.LabLinkHeader = {
    setNotificationCount: setNotificationCount,
    setActive: setActive,
    setUser: setUser
  };
  window.setNotificationCount = setNotificationCount;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
