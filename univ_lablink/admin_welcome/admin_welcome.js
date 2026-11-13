// 1.2s fade-in + 3s fill = 4.2s, plus a short pause on the completed icon.
const REDIRECT_DELAY_MS = 5000;

// Path is relative to this file: univ_lablink/admin_welcome/ -> univ_lablink/admin_dashboard/
const ADMIN_DASHBOARD_URL = "../admin_dashboard/admin_dashboard.html";

window.addEventListener("load", () => {
  setTimeout(() => {
    // replace() keeps this loading screen out of the back-button history
    window.location.replace(ADMIN_DASHBOARD_URL);
  }, REDIRECT_DELAY_MS);
});
