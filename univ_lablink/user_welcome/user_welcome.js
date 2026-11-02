// 1.2s fade-in + 1.5s rise + 2s mid-pause + 0.3s final rise = 5s,
// plus a short pause on the full flask.
const REDIRECT_DELAY_MS = 5800;

// Path is relative to this file: univ_lablink/user_welcome/ -> univ_lablink/user_dashboard/
const USER_DASHBOARD_URL = "../user_dashboard/user_dashboard.html";

window.addEventListener("load", () => {
  setTimeout(() => {
    // replace() keeps this loading screen out of the back-button history
    window.location.replace(USER_DASHBOARD_URL);
  }, REDIRECT_DELAY_MS);
});
