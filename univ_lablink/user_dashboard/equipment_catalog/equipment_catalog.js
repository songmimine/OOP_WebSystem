(function () {
  "use strict";
  var store = window.LabLinkStore;
  var grid = document.getElementById("catalog-grid");
  var rows = document.getElementById("catalog-rows");
  var search = document.getElementById("catalog-search");
  var category = document.getElementById("catalog-category");
  var empty = document.getElementById("catalog-empty");
  var categoryChips = document.querySelector(".catalog-categories");
  var toast = document.getElementById("portal-toast");
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
      if (item.status !== "Available") return notify("This equipment is currently unavailable.", true);
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
      return '<option value="' + esc(name) + '">' + (name === "all" ? "All Categories" : esc(name)) + "</option>";
    }).join("");
    category.value = selected;
    categoryChips.querySelectorAll("[data-category]").forEach(function (chip) {
      var active = chip.getAttribute("data-category") === category.value;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    var query = search.value.trim().toLowerCase();
    var visible = items.filter(function (item) {
      return (category.value === "all" || item.category === category.value) &&
        (item.name + " " + item.detail + " " + item.category).toLowerCase().indexOf(query) !== -1;
    });
    rows.innerHTML = visible.map(function (item) {
      var available = item.stock > 0 && item.status === "Available";
      var selectedQuantity = chosen(item.id);
      var imagePath = item.image || imageFor(item);
      var image = imagePath ?
        '<img class="catalog-item-image" src="' + esc(imagePath) + '" alt="' + esc(item.name) + '" loading="lazy">' :
        '<span class="catalog-item-image catalog-item-image--empty" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M25 8h14M28 8v17L15 48a5 5 0 0 0 4 8h26a5 5 0 0 0 4-8L36 25V8"/><path d="M21 43h22M25 35h14"/></svg></span>';
      return "<tr>" +
        '<td><div class="catalog-item">' + image + '<span class="catalog-item-copy"><strong>' + esc(item.name) +
        "</strong>" + (item.detail ? "<small>" + esc(item.detail) + "</small>" : "") + "</span></div></td>" +
        '<td><span class="catalog-category">' + esc(item.category) + "</span></td>" +
        '<td class="catalog-location">' + esc(item.location || "—") + "</td>" +
        '<td><span class="catalog-availability ' + (available ? "is-available" : "is-unavailable") + '">' +
        '<span class="catalog-availability-dot" aria-hidden="true"></span>' + (available ? "Available" : "Not Available") + "</span></td>" +
        '<td class="catalog-quantity">' + esc(item.totalQuantity) + "</td>" +
        '<td><button class="portal-button portal-button--small catalog-borrow" type="button" data-add="' + esc(item.id) + '" ' +
        (available ? "" : "disabled") + ">" + (available ? (selectedQuantity ? "Add Another" : "Borrow Available") : "Borrow Unavailable") + "</button></td></tr>";
    }).join("");
    if (!visible.length && !(query || category.value !== "all")) {
      rows.innerHTML = '<tr><td class="catalog-empty-row" colspan="6">No equipment is currently listed.</td></tr>';
    }

    function imageFor(item) {
      var text = (item.name + " " + item.detail).toLowerCase();
      var root = "../../assets/";
      if (text.indexOf("beaker") !== -1) return root + "beaker-250ml.png";
      if (text.indexOf("bunsen") !== -1) return root + "bunsen-burner.png";
      if (text.indexOf("centrif") !== -1) return root + "centrifuge.png";
      if (text.indexOf("weigh") !== -1 || text.indexOf("scale") !== -1) return root + "weighing-scale.png";
      if (text.indexOf("ethanol") !== -1) return root + "ethanol.png";
      if (text.indexOf("graduated") !== -1 || text.indexOf("cylinder") !== -1) return root + "graduated-cylinder.png";
      if (text.indexOf("hydrochloric") !== -1) return root + "hydrochloric-acid.png";
      if (text.indexOf("peroxide") !== -1) return root + "hydrogen-peroxide.png";
      if (text.indexOf("microscope") !== -1) return root + "microscope.png";
      if (text.indexOf("test tube holder") !== -1) return root + "test-tube-holder.png";
      if (text.indexOf("test tube") !== -1) return root + "test-tubes.png";
      return "";
    }
    empty.hidden = visible.length > 0 || items.length === 0;
    var selectedCount = draft().reduce(function (total, entry) { return total + entry.qty; }, 0);
    document.getElementById("catalog-selection").hidden = selectedCount === 0;
    document.getElementById("catalog-selection-summary").textContent =
      selectedCount + " item" + (selectedCount === 1 ? "" : "s") + " selected";
  }

  search.addEventListener("input", render);
  search.value = new URLSearchParams(window.location.search).get("q") || "";
  document.addEventListener("header:search", function (event) {
    search.value = event.detail && event.detail.query || "";
    render();
  });
  category.addEventListener("change", render);
  categoryChips.addEventListener("click", function (event) {
    var chip = event.target.closest("[data-category]");
    if (!chip) return;
    category.value = chip.getAttribute("data-category");
    render();
  });
  categoryChips.addEventListener("keydown", function (event) {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-category]")) {
      event.preventDefault();
      event.target.click();
    }
  });
  grid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-add]");
    if (!button) return;
    var item = store.inventory().filter(function (candidate) { return candidate.id === button.getAttribute("data-add"); })[0];
    if (item) add(item);
  });
  window.addEventListener("lablink:data-changed", render);
  store.ready.then(render).catch(function (error) {
    grid.innerHTML = '<div class="portal-note">' + esc(error.message) + "</div>";
  });
})();
