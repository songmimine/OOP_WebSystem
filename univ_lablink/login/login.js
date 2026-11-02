// =====================================================
// Login: separates admin and user accounts, then redirects
// Paths are relative to univ_lablink/index.html (the page that loads this script)
// =====================================================
(function () {
  "use strict";

  var PASSWORD = "lab123"; // the only valid password for both roles

  var ACCOUNTS = {
    "LAB-00001":    { role: "admin", redirect: "admin_welcome/admin_welcome.html" },
    "2025-2-00001": { role: "user",  redirect: "user_welcome/user_welcome.html" }
  };

  var form     = document.querySelector(".login-form");
  var idInput  = document.getElementById("email");     // the User ID field
  var pwInput  = document.getElementById("password");
  var errorBox = document.getElementById("login-error");

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var id = idInput.value.trim().toUpperCase(); // "lab-00001" also works
    var password = pwInput.value;

    if (!id || !password) {
      showError("Please enter your User ID and password.");
      return;
    }

    var account = Object.prototype.hasOwnProperty.call(ACCOUNTS, id) ? ACCOUNTS[id] : null;

    // Unknown ID or wrong password: stay on the login page
    if (!account || password !== PASSWORD) {
      showError("Invalid User ID or password.");
      pwInput.value = "";
      pwInput.focus();
      return;
    }

    clearError();
    window.location.href = account.redirect; // admin -> admin welcome, user -> user welcome
  });

  // Hide the error as soon as the person starts typing again
  idInput.addEventListener("input", clearError);
  pwInput.addEventListener("input", clearError);
})();
