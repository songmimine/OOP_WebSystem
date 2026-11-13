(function () {
  "use strict";
  var scriptUrl = document.currentScript.src;
  var componentDir = new URL("./", scriptUrl);
  var rootUrl = new URL("../", componentDir);
  var mount = document.getElementById("admin-header-mount");
  if (!mount) return;

  function loadStyles() {
    var href = new URL("admin_header.css", componentDir).href;
    if (!Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (link) { return link.href === href; })) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function api(path, options) {
    return fetch(path, options || {}).then(function (response) {
      if (!response.ok) throw new Error("Request failed with status " + response.status);
      return response.json();
    });
  }

  function init(root) {
    root.querySelectorAll("[data-src]").forEach(function (element) {
      element.src = new URL(element.dataset.src, rootUrl).href;
    });
    root.querySelectorAll("[data-path]").forEach(function (element) {
      element.href = new URL(element.dataset.path, rootUrl).href;
    });
    var active = mount.dataset.active;
    root.querySelectorAll("[data-nav]").forEach(function (link) {
      var selected = link.dataset.nav === active;
      link.classList.toggle("is-active", selected);
      if (selected) link.setAttribute("aria-current", "page");
    });
    function updateClock() {
      var now = new Date();
      root.querySelector("[data-ah-date]").textContent = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      root.querySelector("[data-ah-time]").textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    updateClock();
    window.setInterval(updateClock, 30000);

    api("/api/me").then(function (profile) {
      var name = profile.name || "Laboratory Staff";
      root.querySelector("[data-ah-name]").textContent = name;
      root.querySelector("[data-ah-avatar]").textContent = name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
    }).catch(function (error) { console.error("[LabLink admin header] Could not load the signed-in account.", error); });

    var form = root.querySelector("[data-ah-search]");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      document.dispatchEvent(new CustomEvent("admin-header:search", { detail: { query: root.querySelector("[data-ah-search-input]").value.trim() } }));
    });
    var profileButton = root.querySelector("[data-ah-profile]");
    var profileMenu = root.querySelector("[data-ah-profile-menu]");
    profileButton.addEventListener("click", function () {
      profileMenu.hidden = !profileMenu.hidden;
      profileButton.setAttribute("aria-expanded", String(!profileMenu.hidden));
    });
    var bell = root.querySelector("[data-ah-bell]");
    var panel = root.querySelector("[data-ah-panel]");
    function refreshNotifications() {
      return api("/api/notifications").then(function (data) {
        var badge = root.querySelector("[data-ah-badge]");
        badge.textContent = data.count > 9 ? "9+" : String(data.count);
        badge.hidden = data.count === 0;
        bell.setAttribute("aria-label", "Notifications, " + data.count + " new requests");
        root.querySelector("[data-ah-notification-list]").innerHTML = (data.items || []).map(function (item) {
          var link = document.createElement("a");
          link.href = new URL("admin_dashboard/borrow_requests/borrow_requests.html", rootUrl).href;
          link.textContent = item.name + " submitted a new request";
          var li = document.createElement("li");
          li.appendChild(link);
          return li.outerHTML;
        }).join("");
        root.querySelector("[data-ah-notification-empty]").hidden = data.count > 0;
        return data;
      }).catch(function (error) { console.error("[LabLink admin header] Could not load notifications.", error); });
    }
    bell.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) {
        refreshNotifications().then(function (data) {
          if (data && data.count) {
            return api("/api/notifications/acknowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(refreshNotifications);
          }
        });
      }
    });
    document.addEventListener("click", function (event) {
      if (!root.contains(event.target)) {
        panel.hidden = true;
        profileMenu.hidden = true;
        bell.setAttribute("aria-expanded", "false");
        profileButton.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        panel.hidden = true;
        profileMenu.hidden = true;
        bell.setAttribute("aria-expanded", "false");
        profileButton.setAttribute("aria-expanded", "false");
      }
    });
    refreshNotifications();
    window.setInterval(function () {
      if (!document.hidden) refreshNotifications();
    }, 30000);
    window.AdminHeader = { refreshNotifications: refreshNotifications };
  }

  loadStyles();
  fetch(new URL("admin_header.html", componentDir)).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.text();
  }).then(function (html) {
    mount.innerHTML = html;
    init(mount.querySelector("[data-admin-header]"));
  }).catch(function (error) {
    console.error("[LabLink admin header] Could not load the shared header.", error);
    mount.textContent = "Administrator navigation could not be loaded.";
  });
})();
