document.addEventListener("DOMContentLoaded", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     1. Calendar (October 2026)
     Sample data: replace with real records from your backend later.
     ------------------------------------------------------------------ */
  const YEAR = 2026;
  const MONTH = 9;            // 0-based, 9 = October
  const TODAY = 21;           // highlighted day (set to new Date().getDate() for live use)

  const events = {
    10: [{ type: "borrow", text: "Triple Beam Balance ×1 borrowed" }],
    14: [{ type: "return", text: "Triple Beam Balance ×1 returned" }],
    18: [{ type: "borrow", text: "Compound Microscope ×1 borrowed" }],
    20: [{ type: "borrow", text: "Digital Multimeter ×2, Vernier Caliper ×1 borrowed" }],
    22: [{ type: "return", text: "Compound Microscope ×1 due" }],
    24: [{ type: "return", text: "Digital Multimeter ×2, Vernier Caliper ×1 due" }],
    25: [{ type: "borrow", text: "Oscilloscope ×1 scheduled pickup" }],
    28: [{ type: "return", text: "Oscilloscope ×1 due" }]
  };

  const grid = document.getElementById("calendarGrid");
  const tip = document.getElementById("tip");
  const monthName = new Date(YEAR, MONTH, 1).toLocaleString("en-US", { month: "long" });
  const firstWeekday = new Date(YEAR, MONTH, 1).getDay();
  const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();

  // leading blanks
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "day blank";
    blank.setAttribute("aria-hidden", "true");
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day" + (d === TODAY ? " today" : "");
    cell.textContent = d;

    const list = events[d];
    const label = `${monthName} ${d}, ${YEAR}` + (d === TODAY ? " (today)" : "");
    cell.setAttribute("aria-label", list ? `${label}: ${list.map((e) => e.text).join("; ")}` : label);
    if (d === TODAY) cell.setAttribute("aria-current", "date");

    if (list) {
      const marks = document.createElement("span");
      marks.className = "marks";
      [...new Set(list.map((e) => e.type))].forEach((t) => {
        const dot = document.createElement("i");
        dot.className = "dot dot-" + t;
        marks.appendChild(dot);
      });
      cell.appendChild(marks);

      const html = `<b>${monthName} ${d}</b>` + list.map((e) => e.text).join("<br>");
      cell.addEventListener("mouseenter", () => showTip(cell, html));
      cell.addEventListener("focus", () => showTip(cell, html));
      cell.addEventListener("mouseleave", hideTip);
      cell.addEventListener("blur", hideTip);
    }

    // click to select a day
    cell.addEventListener("click", () => {
      const was = cell.classList.contains("selected");
      grid.querySelectorAll(".selected").forEach((el) => el.classList.remove("selected"));
      if (!was) cell.classList.add("selected");
    });

    grid.appendChild(cell);
  }

  function showTip(target, html) {
    tip.innerHTML = html;
    tip.classList.add("show");
    const r = target.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
    let top = r.top - t.height - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { tip.classList.remove("show"); }
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ------------------------------------------------------------------
     2. Count-up on the stat numbers
     ------------------------------------------------------------------ */
  if (!reduceMotion) {
    document.querySelectorAll(".stat-number").forEach((el) => {
      const target = parseInt(el.dataset.count, 10);
      const start = performance.now();
      const duration = 650;
      el.textContent = "0";
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ------------------------------------------------------------------
     3. Stat cards: spotlight that follows the cursor (desktop only)
     ------------------------------------------------------------------ */
  if (window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".stat-card").forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.background =
          `radial-gradient(140px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, #f6faff, #dfecf9 80%)`;
      });
      card.addEventListener("mouseleave", () => (card.style.background = ""));
    });
  }

  /* ------------------------------------------------------------------
     4. Profile dropdown (My requests / Sign out)
     ------------------------------------------------------------------ */
  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");
  const setMenu = (open) => {
    profileMenu.classList.toggle("open", open);
    profileBtn.setAttribute("aria-expanded", String(open));
  };
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(!profileMenu.classList.contains("open"));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#profile")) setMenu(false);
  });

  /* ------------------------------------------------------------------
     5. Mobile sidebar
     ------------------------------------------------------------------ */
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("scrim");
  const toggle = document.getElementById("menuToggle");

  function setSidebar(open) {
    sidebar.classList.toggle("open", open);
    scrim.classList.toggle("show", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", () => setSidebar(true));
  scrim.addEventListener("click", () => setSidebar(false));
  window.addEventListener("resize", () => { if (window.innerWidth > 760) setSidebar(false); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { setMenu(false); setSidebar(false); hideTip(); }
  });
});
