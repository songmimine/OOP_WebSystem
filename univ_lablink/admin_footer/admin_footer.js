(function () {
  "use strict";
  var scriptUrl = document.currentScript.src;
  var folder = new URL("./", scriptUrl);
  var mount = document.getElementById("admin-footer-mount");
  if (!mount) return;
  var stylesheet = new URL("admin_footer.css", folder).href;
  if (!Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (link) { return link.href === stylesheet; })) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet;
    document.head.appendChild(link);
  }
  fetch(new URL("admin_footer.html", folder)).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.text();
  }).then(function (html) {
    mount.innerHTML = html;
  }).catch(function (error) {
    console.error("[LabLink admin footer] Could not load the shared footer.", error);
    mount.textContent = "University LabLink";
  });
})();
