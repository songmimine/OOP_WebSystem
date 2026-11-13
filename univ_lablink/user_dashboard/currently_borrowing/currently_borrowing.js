(function () {
  "use strict";
  var store = window.LabLinkStore;
  var list = document.getElementById("borrowing-list");
  var empty = document.getElementById("borrowing-empty");
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function render() {
    var requests = store.requests().filter(function (request) { return request.status === "approved" || request.status === "active"; });
    list.innerHTML = requests.map(function (request) {
      return '<article class="portal-card portal-list-item"><div><p class="portal-kicker">' + esc(request.id) + '</p><h3>' + esc(request.purpose) +
        '</h3><p>' + request.items.map(function (item) { return esc(item.qty + " × " + item.name); }).join(", ") +
        '</p><p>Borrow: ' + esc(request.borrow) + " · Return: " + esc(request.extensionStatus === "approved" ? request.extensionDate : request.returnBy) + '</p></div>' +
        '<span class="portal-pill">' + (request.status === "active" ? "Borrowed" : "Ready for pickup") + "</span></article>";
    }).join("");
    empty.hidden = requests.length > 0;
  }
  window.addEventListener("lablink:data-changed", render);
  store.ready.then(render).catch(function (error) {
    empty.hidden = false;
    empty.querySelector("p").textContent = error.message;
  });
})();
