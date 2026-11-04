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
  const store = window.LabLinkStore;

  function renderStoredRequests() {
    if (!store) return;
    const requests = store.requests();
    const counts = [
      requests.filter((request) => request.status === "pending").length,
      requests.filter((request) => request.status === "approved" || request.status === "active").length,
      requests.filter((request) => request.status === "rejected").length,
      requests.length
    ];
    document.querySelectorAll(".stat-number").forEach((el, index) => {
      el.dataset.count = String(counts[index]);
      el.textContent = String(counts[index]);
    });
    const body = document.querySelector(".panel tbody");
    const pending = requests.filter((request) => request.status === "pending").slice(0, 5);
    if (!pending.length) {
      body.innerHTML = '<tr><td colspan="7" class="portal-muted">No pending requests. New student requests will appear here.</td></tr>';
      return;
    }
    const escape = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
    body.innerHTML = pending.map((request) => {
      const equipment = request.items.map((item) => item.name + " ×" + item.qty).join(", ");
      return `<tr><td class="req-id">${escape(request.id)}</td><td><span class="student">${escape(request.studentName)}</span><span class="course">${escape(request.department)}</span></td><td>${escape(equipment)}</td><td>${escape(request.borrow)}</td><td>${escape(request.returnBy)}</td><td><span class="badge">Pending</span></td><td><a href="borrow_requests/borrow_requests.html" class="review-link">Review <span class="arrow">→</span></a></td></tr>`;
    }).join("");
    document.querySelectorAll("tbody tr").forEach((row) => {
      const link = row.querySelector(".review-link");
      if (!link) return;
      row.style.cursor = "pointer";
      row.addEventListener("click", (event) => {
        if (!event.target.closest("a")) window.location.href = link.href;
      });
    });
  }
  renderStoredRequests();
  window.addEventListener("lablink:data-changed", renderStoredRequests);
  window.addEventListener("storage", renderStoredRequests);

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
