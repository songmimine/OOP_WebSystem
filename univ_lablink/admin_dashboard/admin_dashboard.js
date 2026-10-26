/* ---- Access guard: only a logged-in admin may view this page ---- */
(function () {
  const logoutLink = document.querySelector(".logout");
  const loginUrl = logoutLink ? logoutLink.getAttribute("href") : "login.html";
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem("lablink_session") || sessionStorage.getItem("lablink_session"));
  } catch (e) {}
  if (!session || session.role !== "admin") {
    window.location.replace(loginUrl);
    return;
  }
  if (logoutLink) {
    logoutLink.addEventListener("click", () => {
      localStorage.removeItem("lablink_session");
      sessionStorage.removeItem("lablink_session");
    });
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 1. Count-up on the stat numbers ---- */
  if (!reduceMotion) {
    document.querySelectorAll(".stat-number").forEach((el) => {
      const target = parseInt(el.dataset.count, 10);
      const duration = 700;
      const start = performance.now();
      el.textContent = "0";
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---- 2. Stat cards: soft spotlight that follows the cursor ---- */
  document.querySelectorAll(".stat-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.background =
        `radial-gradient(180px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, #f0f7fd, #ffffff 70%)`;
    });
    card.addEventListener("mouseleave", () => (card.style.background = ""));
  });

  /* ---- 3. Table rows: whole row is clickable, hover highlights the link ---- */
  document.querySelectorAll("tbody tr").forEach((row) => {
    const link = row.querySelector(".review-link");
    if (!link) return;
    row.style.cursor = "pointer";
    row.addEventListener("click", (e) => {
      if (!e.target.closest("a")) window.location.href = link.href;
    });
    row.addEventListener("mouseenter", () => link.classList.add("is-hot"));
    row.addEventListener("mouseleave", () => link.classList.remove("is-hot"));
  });

  /* ---- 4. Ripple on the "View all requests" button ---- */
  document.querySelectorAll(".btn-outline").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (reduceMotion) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.width = dot.style.height = size + "px";
      dot.style.left = e.clientX - r.left - size / 2 + "px";
      dot.style.top = e.clientY - r.top - size / 2 + "px";
      btn.appendChild(dot);
      setTimeout(() => dot.remove(), 600);
    });
  });

  /* ---- 5. Avatar dropdown (account settings / sign out) ---- */
  const avatarBtn = document.getElementById("avatarBtn");
  const menu = document.getElementById("profileMenu");

  const setMenu = (open) => {
    menu.classList.toggle("open", open);
    avatarBtn.setAttribute("aria-expanded", String(open));
  };
  avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(!menu.classList.contains("open"));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#profile")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { setMenu(false); closeSidebar(); }
  });

  /* ---- 6. Mobile sidebar toggle ---- */
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  const toggle = document.getElementById("menuToggle");

  function closeSidebar() {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
  }
  toggle.addEventListener("click", () => {
    sidebar.classList.add("open");
    scrim.classList.add("show");
  });
  scrim.addEventListener("click", closeSidebar);
});
