(function () {
  "use strict";
  var toastTimer;

  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(path, options).then(function (response) {
      var isCsv = response.headers.get("content-type") && response.headers.get("content-type").indexOf("text/csv") !== -1;
      if (isCsv) {
        if (!response.ok) throw new Error("The report could not be exported.");
        return response.blob();
      }
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401) {
          window.location.assign("/index.html");
          throw new Error(data.message || "Please sign in again.");
        }
        if (!response.ok) throw new Error(data.message || "The server could not complete this action.");
        return data;
      });
    });
  }

  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function formatDate(value, options) {
    if (!value) return "—";
    var date = new Date(value);
    return isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US", options || { year: "numeric", month: "short", day: "numeric" });
  }

  function toast(message, error) {
    var node = document.getElementById("admin-toast");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("portal-toast--error", !!error);
    node.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { node.hidden = true; }, 3500);
  }

  function status(status) {
    var text = String(status || "Unknown").replace(/_/g, " ");
    var normalized = text.toLowerCase();
    var modifier = normalized.indexOf("pending") !== -1 || normalized.indexOf("overdue") !== -1 || normalized.indexOf("return requested") !== -1 ? "portal-pill--pending" :
      normalized.indexOf("rejected") !== -1 || normalized.indexOf("damaged") !== -1 || normalized.indexOf("lost") !== -1 ? "portal-pill--rejected" :
        normalized.indexOf("returned") !== -1 ? "portal-pill--returned" : "";
    return '<span class="portal-pill ' + modifier + '">' + escape(text) + "</span>";
  }

  function itemSummary(items, key) {
    return (items || []).map(function (item) {
      var count = item[key || "qty"];
      return (count == null ? "" : escape(count) + " × ") + escape(item.name);
    }).join(", ");
  }

  function filterRows(rows, query, fields) {
    var normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter(function (row) {
      return fields.map(function (field) { return row[field] == null ? "" : String(row[field]); }).join(" ").toLowerCase().indexOf(normalized) !== -1;
    });
  }

  function bindSearch(callback) {
    document.addEventListener("admin-header:search", function (event) {
      callback(event.detail && event.detail.query || "");
    });
  }

  function setActive(key) {
    var mount = document.getElementById("admin-header-mount");
    if (mount) mount.dataset.active = key;
  }

  function downloadCsv(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  window.LabLinkAdmin = {
    api: api,
    escape: escape,
    formatDate: formatDate,
    toast: toast,
    status: status,
    itemSummary: itemSummary,
    filterRows: filterRows,
    bindSearch: bindSearch,
    setActive: setActive,
    downloadCsv: downloadCsv
  };
  window.setInterval(function () {
    if (!document.hidden) document.dispatchEvent(new CustomEvent("lablink:admin-refresh"));
  }, 30000);
})();
