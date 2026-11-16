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
    api("/api/me").then(function (profile) {
      var name = profile.name || "Laboratory Staff";
      root.querySelector("[data-ah-name]").textContent = name;
      root.querySelector("[data-ah-avatar]").textContent = name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("").toUpperCase();
    }).catch(function (error) { console.error("[LabLink admin header] Could not load the signed-in account.", error); });

    var form = root.querySelector("[data-ah-search]");
    var searchInput = root.querySelector("[data-ah-search-input]");
    var suggestionList = root.querySelector("[data-ah-search-suggestions]");
    var navigationSuggestions = [
      { name: "Admin Dashboard", page: "Admin Dashboard", path: "admin_dashboard/admin_dashboard.html", terms: ["dashboard", "overview", "home"] },
      { name: "Equipment Management", page: "Equipment Management", path: "admin_dashboard/inventory_records/inventory_records.html", terms: ["equipment", "inventory", "category", "categories"] },
      { name: "Borrowing Requests", page: "Borrowing Requests", path: "admin_dashboard/borrow_requests/borrow_requests.html", terms: ["borrow", "borrowing", "request", "requests"] },
      { name: "Return Management", page: "Return Management", path: "admin_dashboard/return_confirmation/return_confirmation.html", terms: ["return", "returns", "overdue"] },
      { name: "Records & History", page: "Records & History", path: "admin_dashboard/records_history.html", terms: ["record", "records", "history", "transaction", "transactions"] },
      { name: "Reports & Audits", page: "Reports & Audits", path: "admin_dashboard/reports_audits/reports_audits.html", terms: ["report", "reports", "audit", "audits"] },
      { name: "Settings", page: "Settings", path: "admin_dashboard/settings.html", terms: ["setting", "settings"] }
    ];
    var records = [];
    var searchDataPromise;

    function escape(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
      });
    }

    function highlighted(value, query) {
      var text = String(value == null ? "" : value);
      var start = text.toLowerCase().indexOf(query.toLowerCase());
      if (start === -1) return escape(text);
      return escape(text.slice(0, start)) + "<mark>" + escape(text.slice(start, start + query.length)) + "</mark>" + escape(text.slice(start + query.length));
    }

    function addRecord(name, page, path, extra) {
      if (name) records.push({ name: name, page: page, path: path, extra: extra || "" });
    }

    function loadSearchData() {
      if (searchDataPromise) return searchDataPromise;
      function load(path) {
        return api(path).catch(function (error) {
          console.error("[LabLink admin header] Search data could not be loaded from " + path + ".", error);
          return {};
        });
      }
      searchDataPromise = Promise.all([
        load("/api/equipment"),
        load("/api/requests"),
        load("/api/transactions"),
        load("/api/history"),
        load("/api/staff/cases")
      ]).then(function (results) {
        (results[0].items || []).forEach(function (item) {
          addRecord(item.name, "Equipment Management", "admin_dashboard/inventory_records/inventory_records.html", item.category + " · " + item.location);
          addRecord(item.category, "Equipment Management", "admin_dashboard/inventory_records/inventory_records.html", "Category");
        });
        (results[1].items || []).forEach(function (item) {
          addRecord(item.id, "Borrowing Requests", "admin_dashboard/borrow_requests/borrow_requests.html", item.studentName);
          (item.items || []).forEach(function (equipment) {
            addRecord(equipment.name + " Request", "Borrowing Requests", "admin_dashboard/borrow_requests/borrow_requests.html", item.id);
          });
        });
        (results[2].items || []).forEach(function (item) {
          addRecord(item.transactionId, "Return Management", "admin_dashboard/return_confirmation/return_confirmation.html", item.studentName);
          (item.items || []).forEach(function (equipment) {
            addRecord(equipment.name, "Return Management", "admin_dashboard/return_confirmation/return_confirmation.html", item.transactionId);
          });
        });
        (results[3].items || []).forEach(function (item) {
          addRecord(item.transactionId, "Records & History", "admin_dashboard/records_history.html", item.userName);
          addRecord(item.userName, "Records & History", "admin_dashboard/records_history.html", item.transactionId);
        });
        (results[4].cases || []).forEach(function (item) {
          addRecord(item.type + " Case", "Reports & Audits", "admin_dashboard/reports_audits/reports_audits.html", item.transactionId + " · " + item.equipment);
          addRecord(item.equipment, "Reports & Audits", "admin_dashboard/reports_audits/reports_audits.html", item.type);
        });
        return records;
      });
      return searchDataPromise;
    }

    function suggestionsFor(query) {
      var normalized = query.toLowerCase();
      var matches = navigationSuggestions.filter(function (item) {
        return item.name.toLowerCase().indexOf(normalized) !== -1 || item.terms.some(function (term) { return term.indexOf(normalized) !== -1; });
      }).concat(records.filter(function (item) {
        return (item.name + " " + item.extra).toLowerCase().indexOf(normalized) !== -1;
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
        return '<li><button class="ah-search__suggestion" type="button" data-suggestion-index="' + index + '"><strong>' +
          highlighted(item.name, query) + '</strong> <span>— from ' + escape(item.page) + "</span></button></li>";
      }).join("") : '<li class="ah-search__empty">No matching admin results found.</li>';
    }

    function navigateSearch() {
      var query = searchInput.value.trim();
      if (!query) return;
      var matches = suggestionsFor(query);
      if (matches[0]) window.location.assign(new URL(matches[0].path, rootUrl).href);
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      navigateSearch();
    });
    searchInput.addEventListener("input", function () {
      var query = searchInput.value.trim();
      if (!query) return renderSuggestions("", []);
      renderSuggestions(query, suggestionsFor(query));
      loadSearchData().then(function () {
        if (searchInput.value.trim() === query) renderSuggestions(query, suggestionsFor(query));
      });
    });
    suggestionList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-suggestion-index]");
      if (!button) return;
      var matches = suggestionsFor(searchInput.value.trim());
      var selected = matches[Number(button.dataset.suggestionIndex)];
      if (selected) window.location.assign(new URL(selected.path, rootUrl).href);
    });
    document.addEventListener("click", function (event) {
      if (!form.contains(event.target)) suggestionList.hidden = true;
    });
    searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        suggestionList.hidden = true;
        searchInput.blur();
      }
    });
    var profileButton = root.querySelector("[data-ah-profile]");
    var profileMenu = root.querySelector("[data-ah-profile-menu]");
    profileButton.addEventListener("click", function () {
      profileMenu.hidden = !profileMenu.hidden;
      profileButton.setAttribute("aria-expanded", String(!profileMenu.hidden));
    });
    var nav = root.querySelector(".ah-nav");
    var navToggle = root.querySelector("[data-ah-nav-toggle]");
    navToggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("ah-nav--open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });
    root.querySelectorAll(".ah-nav__link").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("ah-nav--open");
        navToggle.setAttribute("aria-expanded", "false");
      });
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
        nav.classList.remove("ah-nav--open");
        bell.setAttribute("aria-expanded", "false");
        profileButton.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        panel.hidden = true;
        profileMenu.hidden = true;
        nav.classList.remove("ah-nav--open");
        bell.setAttribute("aria-expanded", "false");
        profileButton.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-expanded", "false");
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
