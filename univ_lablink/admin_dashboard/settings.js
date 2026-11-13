(function () {
  "use strict";
  var admin = window.LabLinkAdmin;
  var form = document.getElementById("settings-form");
  var fields = ["office", "phone", "email", "hours", "rules", "extension"];

  admin.api("/api/settings").then(function (result) {
    fields.forEach(function (name) { form.elements[name].value = result.settings[name] || ""; });
  }).catch(function (error) { admin.toast(error.message, true); });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var values = {};
    fields.forEach(function (name) { values[name] = form.elements[name].value.trim(); });
    var button = document.getElementById("settings-save");
    button.disabled = true;
    admin.api("/api/settings", { method: "PUT", body: values }).then(function () {
      var result = document.getElementById("settings-result");
      result.textContent = "Laboratory settings have been saved.";
      result.hidden = false;
      admin.toast("Settings saved.");
    }).catch(function (error) { admin.toast(error.message, true); }).finally(function () { button.disabled = false; });
  });
})();
