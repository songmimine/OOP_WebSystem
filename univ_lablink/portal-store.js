(function () {
  "use strict";

  var KEYS = {
    inventory: "lablink_inventory",
    requests: "lablink_requests",
    draft: "lablink_request_draft",
    records: "lablink_records"
  };

  var starterInventory = [
    { id: "EQ-001", name: "Beakers", detail: "250 mL", category: "Glassware & Containers", location: "Lab 1 · Room S201", stock: 10, unit: "pieces" },
    { id: "EQ-002", name: "Bunsen Burner", detail: "Standard", category: "Equipment & Machines", location: "Lab 3 · Room S305", stock: 9, unit: "units" },
    { id: "EQ-003", name: "Centrifuge", detail: "Digital", category: "Equipment & Machines", location: "Lab 2 · Room S204", stock: 5, unit: "units" },
    { id: "EQ-004", name: "Digital Weighing Scale", detail: "Precision balance", category: "Equipment & Machines", location: "Lab 1 · Room S201", stock: 10, unit: "units" },
    { id: "EQ-005", name: "Ethanol", detail: "C₂H₅OH · 95%", category: "Chemicals & Reagents", location: "Store · Room S110", stock: 10, unit: "bottles" },
    { id: "EQ-006", name: "Graduated Cylinders", detail: "100 mL", category: "Glassware & Containers", location: "Lab 2 · Room S204", stock: 10, unit: "pieces" },
    { id: "EQ-007", name: "Hydrochloric Acid", detail: "HCl · 1M", category: "Chemicals & Reagents", location: "Store · Room S110", stock: 10, unit: "bottles" },
    { id: "EQ-008", name: "Hydrogen Peroxide", detail: "H₂O₂ · 3%", category: "Chemicals & Reagents", location: "Store · Room S110", stock: 10, unit: "bottles" },
    { id: "EQ-009", name: "Microscope", detail: "Model M-400", category: "Equipment & Machines", location: "Lab 3 · Room S305", stock: 4, unit: "units" },
    { id: "EQ-010", name: "Test Tubes", detail: "15 × 150 mm", category: "Glassware & Containers", location: "Lab 1 · Room S101", stock: 20, unit: "pieces" }
  ];

  function read(key, fallback) {
    var raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error("Saved LabLink data is invalid. Clear this site's browser storage to reset the demo.");
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("lablink:data-changed", { detail: { key: key } }));
  }

  function isoDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function all() {
    var requests = read(KEYS.requests, []);
    return Array.isArray(requests) ? requests : [];
  }

  function inventory() {
    var items = read(KEYS.inventory, null);
    if (!Array.isArray(items)) {
      items = starterInventory.map(function (item) { return Object.assign({}, item); });
      write(KEYS.inventory, items);
    }
    return items;
  }

  function getRequest(id) {
    return all().filter(function (request) { return request.id === id; })[0] || null;
  }

  function saveRequest(updated) {
    var requests = all();
    var index = requests.findIndex(function (request) { return request.id === updated.id; });
    if (index < 0) throw new Error("This request could not be found.");
    requests[index] = updated;
    write(KEYS.requests, requests);
    return updated;
  }

  function updateInventoryItem(id, change) {
    var items = inventory();
    var item = items.filter(function (candidate) { return candidate.id === id; })[0];
    if (!item) throw new Error("An equipment item could not be found.");
    Object.assign(item, change);
    write(KEYS.inventory, items);
  }

  function addRequest(form) {
    var items = inventory();
    var selected = (form.items || []).map(function (selection) {
      var item = items.filter(function (candidate) { return candidate.id === selection.id; })[0];
      var qty = Math.floor(Number(selection.qty));
      if (!item || qty < 1 || qty > item.stock) {
        throw new Error("Check the selected equipment quantities and available stock.");
      }
      return { id: item.id, name: item.name, detail: item.detail, qty: qty };
    });
    if (!selected.length) throw new Error("Add at least one available item to your request.");
    if (!form.purpose || !form.borrow || !form.returnBy || form.returnBy < form.borrow) {
      throw new Error("Enter a purpose and valid borrow and return dates.");
    }

    var today = isoDate(new Date());
    var requests = all();
    var sequence = requests.length + 1;
    var request = {
      id: "REQ-" + today.slice(0, 4) + "-" + today.slice(5, 7) + today.slice(8, 10) + "-" +
        String(sequence).padStart(3, "0"),
      studentName: form.studentName || "Katrina Mendoza",
      studentNumber: form.studentNumber || "2025-2-00001",
      department: form.department || "Computer Science",
      purpose: form.purpose,
      notes: form.notes || "",
      items: selected,
      qty: selected.reduce(function (total, item) { return total + item.qty; }, 0),
      status: "pending",
      submitted: today,
      requestedDate: today,
      borrow: form.borrow,
      pickupDate: form.borrow,
      returnBy: form.returnBy,
      dueDate: form.returnBy,
      returnTime: form.returnTime || "5:00 PM",
      dueTime: "17:00"
    };
    requests.unshift(request);
    write(KEYS.requests, requests);
    write(KEYS.draft, []);
    return request;
  }

  function setStatus(id, status, condition) {
    var request = getRequest(id);
    if (!request) throw new Error("This request could not be found.");
    if (request.status === status) return request;
    var transitions = {
      pending: { approved: true, rejected: true },
      approved: { active: true },
      active: { return_requested: true },
      return_requested: { returned: true }
    };
    if (!transitions[request.status] || !transitions[request.status][status]) {
      throw new Error("This request cannot move from " + request.status + " to " + status + ".");
    }
    request.status = status;
    if (status === "active") {
      request.borrowedDate = isoDate(new Date());
      request.dueDate = request.returnBy;
      request.dueTime = "17:00";
      var pickupInventory = inventory();
      request.items.forEach(function (item) {
        var storedItem = pickupInventory.filter(function (candidate) { return candidate.id === item.id; })[0];
        if (!storedItem || storedItem.stock < item.qty) {
          throw new Error("There is not enough stock to confirm this pickup.");
        }
      });
      request.items.forEach(function (item) {
        var storedItem = pickupInventory.filter(function (candidate) { return candidate.id === item.id; })[0];
        storedItem.stock -= item.qty;
      });
      write(KEYS.inventory, pickupInventory);
    }
    if (status === "returned") {
      var returnInventory = inventory();
      request.items.forEach(function (item) {
        var storedItem = returnInventory.filter(function (candidate) { return candidate.id === item.id; })[0];
        if (storedItem) storedItem.stock += item.qty;
      });
      write(KEYS.inventory, returnInventory);
      var records = read(KEYS.records, []);
      records.unshift({
        id: request.id,
        studentName: request.studentName,
        items: request.items,
        action: condition === "damaged" ? "Marked as damaged" : "Return completed",
        date: isoDate(new Date()),
        status: condition === "damaged" ? "Damaged" : "Returned"
      });
      write(KEYS.records, records);
    }
    return saveRequest(request);
  }

  function setInventory(items) {
    write(KEYS.inventory, items);
  }

  function addInventoryItem(item) {
    var items = inventory();
    item.id = item.id || "EQ-" + String(Date.now()).slice(-6);
    items.unshift(item);
    write(KEYS.inventory, items);
    return item;
  }

  function removeInventoryItem(id) {
    setInventory(inventory().filter(function (item) { return item.id !== id; }));
  }

  window.LabLinkStore = {
    keys: KEYS,
    inventory: inventory,
    requests: all,
    getRequest: getRequest,
    saveRequest: saveRequest,
    addRequest: addRequest,
    setStatus: setStatus,
    addInventoryItem: addInventoryItem,
    updateInventoryItem: updateInventoryItem,
    removeInventoryItem: removeInventoryItem,
    records: function () { return read(KEYS.records, []); },
    draft: function () { return read(KEYS.draft, []); },
    setDraft: function (items) { write(KEYS.draft, items); }
  };
  window.RequestStore = { KEY: KEYS.requests, all: all, add: addRequest, get: getRequest, update: saveRequest };
})();
