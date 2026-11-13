(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var form = document.getElementById("equipment-form");
  var search = document.getElementById("equipment-search");
  var category = document.getElementById("equipment-category-filter");
  var rows = [];
  var query = "";

  function imagePath(item) {
    if (!item.image) return '<span class="equipment-image-empty">No image</span>';
    return '<img class="equipment-preview" src="' + admin.escape(item.image) + '" alt="' + admin.escape(item.name) + '" loading="lazy">';
  }

  function render() {
    var categories = Array.from(new Set(rows.map(function (item) { return item.category; }))).sort();
    var current = category.value;
    category.innerHTML = '<option value="">All categories</option>' + categories.map(function (name) {
      return '<option value="' + admin.escape(name) + '">' + admin.escape(name) + "</option>";
    }).join("");
    category.value = categories.indexOf(current) !== -1 ? current : "";
    var visible = rows.filter(function (item) {
      var text = [item.id, item.name, item.detail, item.unit, item.category, item.location].join(" ").toLowerCase();
      return (!query || text.indexOf(query.toLowerCase()) !== -1) && (!category.value || item.category === category.value);
    });
    document.getElementById("equipment-rows").innerHTML = visible.length ? visible.map(function (item) {
      var unavailable = Math.max(0, item.totalQuantity - item.stock - item.borrowedQuantity);
      var details = item.detail || item.id;
      return "<tr><td><div class=\"equipment-name\">" + imagePath(item) + "<span><strong>" + admin.escape(item.name) +
        "</strong><br><span class=\"portal-muted\">" + admin.escape(details) + "</span></span></div></td><td><span class=\"equipment-category-location\">" +
        "<span>" + admin.escape(item.category) + "</span><span class=\"portal-muted\">" + admin.escape(item.location) + "</span></span></td><td>" +
        item.totalQuantity + " " + admin.escape(item.unit) + "</td><td>" + item.stock + "</td><td>" + item.borrowedQuantity +
        "</td><td>" + unavailable + "</td><td>" + admin.status(item.active ? item.status : "Inactive") + "</td>" +
        '<td><div class="equipment-action-buttons"><button class="portal-button portal-button--small portal-button--secondary" type="button" data-edit="' + admin.escape(item.id) +
        '">Edit</button><button class="portal-button portal-button--small portal-button--danger" type="button" data-deactivate="' + admin.escape(item.id) +
        '" ' + (item.active ? "" : "disabled") + ">Remove</button></div></td></tr>";
    }).join("") : '<tr><td colspan="8" class="equipment-filter-empty">' + (query || category.value ? "No equipment matches these filters." : "No equipment is listed.") + "</td></tr>";
  }

  function load() {
    admin.api("/api/equipment").then(function (data) { rows = data.items || []; render(); }).catch(function (error) { admin.toast(error.message, true); });
  }

  function resetForm() {
    form.reset();
    form.dataset.editId = "";
    document.getElementById("equipment-form-title").textContent = "Add New Equipment";
    document.getElementById("equipment-submit").textContent = "Add New Equipment";
    document.getElementById("equipment-cancel").hidden = true;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var formData = new FormData(form);
    var quantity = Number(formData.get("stock"));
    if (!Number.isInteger(quantity) || quantity < 0) return admin.toast("Total quantity must be a non-negative whole number.", true);
    var image = formData.get("image");
    if (image && image.size > 5 * 1024 * 1024) return admin.toast("Image files must be 5 MB or smaller.", true);
    var id = form.dataset.editId;
    formData.set("totalQuantity", String(quantity));
    formData.delete("stock");
    var promise = id ? admin.api("/api/equipment/" + encodeURIComponent(id), { method: "PATCH", body: formData }) :
      admin.api("/api/equipment", { method: "POST", body: formData });
    var submit = document.getElementById("equipment-submit");
    submit.disabled = true;
    promise.then(function () {
      admin.toast(id ? "Equipment details updated." : "Equipment added to the shared catalog.");
      resetForm();
      load();
    }).catch(function (error) { admin.toast(error.message, true); }).finally(function () { submit.disabled = false; });
  });
  document.getElementById("equipment-cancel").addEventListener("click", resetForm);
  document.getElementById("equipment-rows").addEventListener("click", function (event) {
    var edit = event.target.closest("[data-edit]");
    var deactivate = event.target.closest("[data-deactivate]");
    if (edit) {
      var item = rows.find(function (row) { return row.id === edit.dataset.edit; });
      if (!item) return;
      form.dataset.editId = item.id;
      ["name", "detail", "category", "location", "unit"].forEach(function (name) { form.elements[name].value = item[name] || ""; });
      form.elements.stock.value = item.totalQuantity;
      form.elements.image.value = "";
      form.elements.borrowStatus.value = item.borrowStatus || "Available";
      document.getElementById("equipment-form-title").textContent = "Edit equipment";
      document.getElementById("equipment-submit").textContent = "Save changes";
      document.getElementById("equipment-cancel").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (deactivate) {
      var record = rows.find(function (row) { return row.id === deactivate.dataset.deactivate; });
      if (!record || !window.confirm("Remove " + record.name + " from the user catalog?")) return;
      admin.api("/api/equipment/" + encodeURIComponent(record.id), { method: "DELETE" }).then(function () {
        admin.toast("Equipment removed from the user catalog.");
        load();
      }).catch(function (error) { admin.toast(error.message, true); });
    }
  });
  search.addEventListener("input", function () { query = search.value; render(); });
  category.addEventListener("change", render);
  admin.bindSearch(function (value) { query = value; search.value = value; render(); });
  document.addEventListener("lablink:admin-refresh", load);
  window.addEventListener("lablink:data-changed", load);
  load();
})();
