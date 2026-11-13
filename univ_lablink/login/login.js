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
  var submitLabel = submitBtn.querySelector(".btn-login__label");
  var submitSpinner = submitBtn.querySelector(".btn-login__spinner");
  var isRedirecting = false;

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("is-loading", isLoading);
    submitBtn.setAttribute("aria-busy", String(isLoading));
    submitSpinner.hidden = !isLoading;
    submitLabel.textContent = isLoading ? "Signing in…" : "Log In";
  }

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

    setLoading(true);

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, password: password, remember: form.querySelector('input[name="remember"]').checked })
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

        clearError();
        isRedirecting = true;
        window.location.href = result.data.redirect; // admin -> admin side, user -> user side
      })
      .catch(function () {
        showError("Cannot reach the server. Make sure the Flask app is running.");
      })
      .finally(function () {
        if (!isRedirecting) setLoading(false);
      });
  });

  idInput.addEventListener("input", clearError);
  pwInput.addEventListener("input", clearError);
})();
