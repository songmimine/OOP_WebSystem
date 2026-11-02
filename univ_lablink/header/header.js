/* ==========================================================================
   LPU Cavite – Laboratory Equipment System · Global Header
   ---------------------------------------------------------------------------
   Usage on any page (any folder depth):

     <div id="lablink-header" data-active="dashboard"></div>
     <script src="../header/header.js"></script>

   The script:
     1. Loads header.css and header.html from the same folder as this file.
     2. Resolves logo / link paths relative to the univ_lablink root.
     3. Wires up the live clock, profile dropdown and notification badge.

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

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var clockTimer = null;
  var rootEl = null;
  var pendingCount = null;

  /* ---------- Live date / time ---------- */
  function formatDateTime(date) {
    var hours = date.getHours();
    var suffix = hours >= 12 ? "PM" : "AM";
    var hour12 = hours % 12 || 12;
    var minutes = String(date.getMinutes()).padStart(2, "0");
    return (
      MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear() +
      " | " + hour12 + ":" + minutes + " " + suffix
    );
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
    var bell = rootEl.querySelector(".msh-bell");
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

  /* ---------- Profile dropdown ---------- */
  function initProfileMenu(root) {
    var toggle = root.querySelector("[data-profile-toggle]");
    var menu = root.querySelector("[data-profile-menu]");
    if (!toggle || !menu) return;

    function open() {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    }

    function close() {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      if (menu.hidden) open();
      else close();
    });

    // Click anywhere outside dismisses the menu
    document.addEventListener("click", function (event) {
      if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) {
        close();
      }
    });

    // Escape closes and returns focus to the button
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) {
        close();
        toggle.focus();
      }
    });

    // Close after choosing an item
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) close();
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

  /* ---------- Init ---------- */
  function init(root, activeKey) {
    rootEl = root;
    resolvePaths(root);
    startClock(root);
    initProfileMenu(root);

    if (activeKey) setActive(activeKey);

    // Default state: read data-count from the header element, else hide badge
    var initial = pendingCount !== null ? pendingCount : root.getAttribute("data-count");
    setNotificationCount(initial === null ? 0 : initial);

    document.dispatchEvent(new CustomEvent("lablink:header-ready", { detail: { root: root } }));
  }

  function ensureStylesheet() {
    var href = new URL("header.css", HEADER_DIR).href + "?v=3";
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

  function mount() {
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
