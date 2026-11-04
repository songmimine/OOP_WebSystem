(function () {
  "use strict";

  /* ---------- Clock (static by default; set data-live="true" in HTML to enable) ---------- */
  const datetime = document.getElementById("datetime");
  const dateText = document.getElementById("dateText");
  const timeText = document.getElementById("timeText");

  function updateClock() {
    const now = new Date();
    dateText.textContent = now.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric"
    });
    timeText.textContent = now.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true
    });
  }

  if (datetime && datetime.dataset.live === "true") {
    updateClock();
    setInterval(updateClock, 30 * 1000);
  }

  /* ---------- Search ---------- */
  const searchForm = document.getElementById("searchForm");
  const searchInput = document.getElementById("searchInput");

  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) { searchInput.focus(); return; }

      // Hook up your real search here (API call, route change, etc.)
      document.dispatchEvent(new CustomEvent("les:search", { detail: { query } }));
      console.log("Search submitted:", query);
    });
  }

  /* ---------- Notifications ---------- */
  const notifBtn = document.getElementById("notifBtn");
  const notifBadge = document.getElementById("notifBadge");

  function setNotificationCount(count) {
    if (!notifBadge) return;
    notifBadge.textContent = count > 9 ? "9+" : String(count);
    notifBadge.hidden = count <= 0;
    notifBtn.setAttribute("aria-label", `Notifications, ${count} unread`);
  }

  if (notifBtn) {
    notifBtn.addEventListener("click", function () {
      // Replace with a dropdown/panel as needed.
      document.dispatchEvent(new CustomEvent("les:notifications-open"));
    });
  }

  // Expose for your app to update the count (e.g. LES.setNotificationCount(5))
  window.LES = { setNotificationCount };

  /* ---------- Active nav item ---------- */
  const links = document.querySelectorAll(".mainnav__link");
  links.forEach(function (link) {
    link.addEventListener("click", function () {
      links.forEach(function (l) { l.classList.remove("is-active"); });
      link.classList.add("is-active");
    });
  });
})();
