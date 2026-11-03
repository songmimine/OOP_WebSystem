// =====================================================
// Login: sends ID + password to the Flask backend (/api/login).
// The server decides the role (admin or user) and returns where to go.
// Path is relative to univ_lablink/index.html (the page that loads this script)
// =====================================================
(function () {
  "use strict";

  var form     = document.querySelector(".login-form");
  var idInput  = document.getElementById("email");     // the User ID field
  var pwInput  = document.getElementById("password");
  var errorBox = document.getElementById("login-error");
  var submitBtn = form.querySelector(".btn-login");

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

    var id = idInput.value.trim();
    var password = pwInput.value;

    if (!id || !password) {
      showError("Please enter your User ID and password.");
      return;
    }

    submitBtn.disabled = true;

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, password: password })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok || !result.data.ok) {
          showError(result.data.message || "Invalid User ID or password.");
          pwInput.value = "";
          pwInput.focus();
          return;
        }

        // Keep what the existing dashboards read from localStorage
        try {
          localStorage.setItem("lablink_session", JSON.stringify({ role: result.data.role }));
          localStorage.setItem("lablink_user", JSON.stringify({
            name: result.data.name,
            role: result.data.role === "admin" ? "Laboratory Staff" : "User"
          }));
        } catch (e) { /* storage unavailable */ }

        clearError();
        window.location.href = result.data.redirect; // admin -> admin side, user -> user side
      })
      .catch(function () {
        showError("Cannot reach the server. Make sure the Flask app is running.");
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

  idInput.addEventListener("input", clearError);
  pwInput.addEventListener("input", clearError);
})();

