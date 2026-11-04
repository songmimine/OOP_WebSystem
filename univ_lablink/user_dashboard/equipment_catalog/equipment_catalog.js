(function () {
  "use strict";
  var store = window.LabLinkStore;
  var grid = document.getElementById("catalog-grid");
  var search = document.getElementById("catalog-search");
  var category = document.getElementById("catalog-category");
  var categories = document.getElementById("catalog-categories");
  var empty = document.getElementById("catalog-empty");
  var toast = document.getElementById("portal-toast");
  var selectedCategory = "all";
  var toastTimer;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function notify(message, error) {
    toast.textContent = message;
    toast.classList.toggle("portal-toast--error", !!error);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }

  function draft() { return store.draft(); }
  function chosen(id) {
    var entry = draft().filter(function (item) { return item.id === id; })[0];
    return entry ? entry.qty : 0;
  }

  function add(item) {
    try {
      var current = draft();
      var selection = current.filter(function (entry) { return entry.id === item.id; })[0];
      if (selection) {
        if (selection.qty >= item.stock) return notify("You have selected all available stock.", true);
        selection.qty += 1;
      } else {
        current.push({ id: item.id, qty: 1 });
      }
      store.setDraft(current);
      render();
      notify(item.name + " added to your request.");
    } catch (error) { notify(error.message, true); }
  }

  function render() {
    var items = store.inventory();
    var names = ["all"].concat(items.map(function (item) { return item.category; }).filter(function (value, index, list) { return list.indexOf(value) === index; }));
    var selected = names.filter(function (name) { return name === category.value; })[0] || "all";
    category.innerHTML = names.map(function (name) {
      return '<option value="' + esc(name) + '">' + (name === "all" ? "All categories" : esc(name)) + "</option>";
    }).join("");
    category.value = selected;
    categories.innerHTML = names.map(function (name) {
      return '<button class="portal-chip ' + (name === selectedCategory ? "is-active" : "") + '" type="button" data-category="' + esc(name) + '">' +
        (name === "all" ? "All" : esc(name)) + "</button>";
    }).join("");
    var query = search.value.trim().toLowerCase();
    var visible = items.filter(function (item) {
      return (selectedCategory === "all" || item.category === selectedCategory) &&
        (category.value === "all" || item.category === category.value) &&
        (item.name + " " + item.detail + " " + item.category).toLowerCase().indexOf(query) !== -1;
    });
    grid.innerHTML = visible.map(function (item) {
      var available = item.stock > 0;
      return '<article class="portal-card portal-product">' +
        '<div class="portal-product-art" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M25 8h14M28 8v17L15 48a5 5 0 0 0 4 8h26a5 5 0 0 0 4-8L36 25V8"/><path d="M21 43h22M25 35h14"/></svg></div>' +
        '<div class="portal-product-body"><span class="portal-pill">' + (available ? "Available" : "Not available") + "</span>" +
        '<h2>' + esc(item.name) + "</h2><p>" + esc(item.detail) + " · " + esc(item.category) + "</p>" +
        '<p>Stock: ' + esc(item.stock) + " " + esc(item.unit) + " · " + esc(item.location) + "</p>" +
        '<div class="portal-product-footer"><span class="portal-muted">' + (chosen(item.id) ? chosen(item.id) + " selected" : "Ready to borrow") + "</span>" +
        '<button class="portal-button portal-button--small ' + (available ? "portal-button--blue" : "portal-button--secondary") + '" type="button" data-add="' + esc(item.id) + '" ' + (available ? "" : "disabled") + ">" +
        (chosen(item.id) ? "Add one more" : "Borrow") + "</button></div></div></article>";
    }).join("");
    empty.hidden = visible.length > 0;
    var count = draft().reduce(function (total, entry) { return total + entry.qty; }, 0);
    document.getElementById("catalog-selection-count").textContent = String(count);
  }

  search.addEventListener("input", render);
  search.value = new URLSearchParams(window.location.search).get("q") || "";
  document.addEventListener("header:search", function (event) {
    search.value = event.detail && event.detail.query || "";
    render();
  });
  category.addEventListener("change", function () { selectedCategory = category.value; render(); });
  categories.addEventListener("click", function (event) {
    var button = event.target.closest("[data-category]");
    if (!button) return;
    selectedCategory = button.getAttribute("data-category");
    category.value = selectedCategory;
    render();
  });
  grid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-add]");
    if (!button) return;
    var item = store.inventory().filter(function (candidate) { return candidate.id === button.getAttribute("data-add"); })[0];
    if (item) add(item);
  });
  window.addEventListener("lablink:data-changed", render);
  render();
})();
