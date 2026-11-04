(function () {
  "use strict";
  var form = document.getElementById("profile-form");
  var status = document.getElementById("profile-status");
  var user = {};
  try { user = JSON.parse(localStorage.getItem("lablink_user") || "{}"); } catch (error) { user = {}; }
  document.getElementById("profile-name").value = user.name || "Katrina Mendoza";
  document.getElementById("profile-id").value = user.id || "2025-2-00001";
  document.getElementById("profile-department").value = user.department || "Computer Science";
  document.getElementById("profile-email").value = user.email || "";
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    user.name = document.getElementById("profile-name").value.trim();
    user.id = document.getElementById("profile-id").value.trim();
    user.department = document.getElementById("profile-department").value.trim();
    user.email = document.getElementById("profile-email").value.trim();
    user.role = user.role || "User";
    localStorage.setItem("lablink_user", JSON.stringify(user));
    status.textContent = "Profile saved in this browser.";
    status.hidden = false;
    if (window.LabLinkHeader) window.LabLinkHeader.setUser(user.name, user.role);
  });
})();