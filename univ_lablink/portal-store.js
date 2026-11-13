(function () {
  "use strict";

  var inventory = [];
  var requests = [];
  var user = null;
  var draftKey = "lablink_request_draft";

  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData)) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (response.status === 401) {
          window.location.assign("/index.html");
          throw new Error(body.message || "Your session has expired. Please sign in again.");
        }
        if (!response.ok) throw new Error(body.message || "The server could not complete this request.");
        return body;
      });
    });
  }

  function refresh() {
    return Promise.all([api("/api/equipment"), api("/api/requests"), api("/api/me")]).then(function (results) {
      inventory = results[0].items || [];
      requests = results[1].items || [];
      user = results[2];
      window.dispatchEvent(new CustomEvent("lablink:data-changed"));
      return { inventory: inventory, requests: requests, user: user };
    });
  }

  function afterMutation(promise) {
    return promise.then(function (result) {
      return refresh().then(function () { return result; });
    });
  }

  function readDraft() {
    try {
      var value = JSON.parse(localStorage.getItem(draftKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      throw new Error("The saved request draft is invalid. Clear this site's saved request draft and try again.");
    }
  }

  window.LabLinkStore = {
    ready: refresh(),
    api: api,
    refresh: refresh,
    inventory: function () { return inventory.slice(); },
    requests: function () { return requests.slice(); },
    getRequest: function (id) { return requests.filter(function (row) { return row.id === id; })[0] || null; },
    currentUser: function () { return user; },
    draft: readDraft,
    setDraft: function (items) { localStorage.setItem(draftKey, JSON.stringify(items)); },
    addRequest: function (form) {
      return afterMutation(api("/api/requests", {
        method: "POST",
        body: { purpose: form.purpose, notes: form.notes, borrow: form.borrow, returnBy: form.returnBy, items: form.items }
      })).then(function (result) { localStorage.removeItem(draftKey); return result.request; });
    },
    setStatus: function (id, status, reviewNotes) {
      if (status === "active") {
        return afterMutation(api("/api/requests/" + encodeURIComponent(id) + "/release", { method: "POST", body: {} }));
      }
      return afterMutation(api("/api/requests/" + encodeURIComponent(id), {
        method: "PATCH", body: { status: status, reviewNotes: reviewNotes || "" }
      })).then(function (result) { return result.request; });
    },
    addInventoryItem: function (item) {
      return afterMutation(api("/api/equipment", {
        method: "POST",
        body: { name: item.name, detail: item.detail, category: item.category, location: item.location, unit: item.unit, totalQuantity: item.stock }
      })).then(function (result) { return result.item; });
    },
    updateInventoryItem: function (id, change) {
      return afterMutation(api("/api/equipment/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { name: change.name, detail: change.detail, category: change.category, location: change.location, unit: change.unit, totalQuantity: change.totalQuantity === undefined ? change.stock : change.totalQuantity, active: change.active }
      }));
    },
    removeInventoryItem: function (id) {
      return afterMutation(api("/api/equipment/" + encodeURIComponent(id), { method: "DELETE" }));
    },
    requestReturn: function (transactionId) {
      return afterMutation(api("/api/transactions/" + encodeURIComponent(transactionId) + "/return-request", { method: "POST", body: {} }));
    },
    confirmReturn: function (transactionId, items) {
      return afterMutation(api("/api/transactions/" + encodeURIComponent(transactionId) + "/returns", { method: "POST", body: { items: items } }));
    },
    records: function () { return []; }
  };
  window.RequestStore = { all: function () { return window.LabLinkStore.requests(); } };
  window.setInterval(function () {
    if (!document.hidden) refresh().catch(function (error) { console.error("[LabLink] Could not refresh shared records.", error); });
  }, 30000);
})();
