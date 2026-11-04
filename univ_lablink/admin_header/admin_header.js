(function () {
  "use strict";

  var root = document.querySelector("[data-admin-header]");
  if (!root) return;

  /* ---------- Date / time (static by default; data-live="true" makes it live) ---------- */
  var datetime = root.querySelector("[data-ah-datetime]");
  var dateEl = root.querySelector("[data-ah-date]");
  var timeEl = root.querySelector("[data-ah-time]");

  function updateClock() {
    var now = new Date();
    dateEl.textContent = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    timeEl.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }

  if (datetime && datetime.dataset.live === "true") {
    updateClock();
    setInterval(updateClock, 30000);
  }

  /* ---------- Search ---------- */
  var form = root.querySelector("[data-ah-search]");
  var input = root.querySelector("[data-ah-search-input]");

  if (form && input) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var query = input.value.trim();
      if (!query) { input.focus(); return; }
      // Listen for this event to run your real search.
      document.dispatchEvent(new CustomEvent("admin-header:search", { detail: { query: query } }));
    });
  }

  /* ---------- Notifications ---------- */
  var bell = root.querySelector("[data-ah-bell]");
  var badge = root.querySelector("[data-ah-badge]");

  function setNotificationCount(count) {
    if (!badge || !bell) return;
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.hidden = count <= 0;
    bell.setAttribute("aria-label", "Notifications, " + count + " unread");
  }

  if (bell) {
    bell.addEventListener("click", function () {
      document.dispatchEvent(new CustomEvent("admin-header:notifications"));
    });
  }

  /* ---------- Navigation: active item ---------- */
  var links = Array.prototype.slice.call(root.querySelectorAll(".ah-nav__link"));

  function setActive(target) {
    links.forEach(function (l) {
      var on = l === target;
      l.classList.toggle("is-active", on);
      if (on) l.setAttribute("aria-current", "page");
      else l.removeAttribute("aria-current");
    });
  }

  links.forEach(function (link) {
    link.addEventListener("click", function () {
      setActive(link);
      document.dispatchEvent(new CustomEvent("admin-header:navigate", { detail: { href: link.getAttribute("href") } }));
    });
  });

  /* ---------- Public API ---------- */
  // AdminHeader.setNotificationCount(5)
  // AdminHeader.setUser({ name: "Dr. Aris Thorne", role: "Admin", initials: "DR" })
  window.AdminHeader = {
    setNotificationCount: setNotificationCount,
    setUser: function (u) {
      if (u.name) root.querySelector(".ah-user__name").textContent = u.name;
      if (u.role) root.querySelector(".ah-user__role").textContent = u.role;
      if (u.initials) root.querySelector(".ah-user__avatar").textContent = u.initials;
    }
  };
})();
