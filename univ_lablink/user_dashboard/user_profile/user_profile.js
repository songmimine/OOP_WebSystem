(function () {
  "use strict";
  var store = window.LabLinkStore;
  var form = document.getElementById("profile-form");
  var status = document.getElementById("profile-status");
  store.api("/api/me").then(function (user) {
    document.getElementById("profile-name").value = user.name || "";
    document.getElementById("profile-id").value = user.id || "";
    document.getElementById("profile-department").value = user.department || "";
    document.getElementById("profile-email").value = user.email || "";
  }).catch(function (error) {
    status.textContent = error.message;
    status.hidden = false;
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    store.api("/api/me", {
      method: "PUT",
      body: {
        name: document.getElementById("profile-name").value.trim(),
        department: document.getElementById("profile-department").value.trim(),
        email: document.getElementById("profile-email").value.trim()
      }
    }).then(function (user) {
      status.textContent = "Profile changes saved to your account.";
      status.hidden = false;
      window.dispatchEvent(new CustomEvent("lablink:data-changed"));
      if (window.LabLinkHeader) window.LabLinkHeader.setUser(user.name, "University User");
    }).catch(function (error) {
      status.textContent = error.message;
      status.hidden = false;
      status.classList.add("portal-toast--error");
    }).finally(function () { button.disabled = false; });
  });
})();
