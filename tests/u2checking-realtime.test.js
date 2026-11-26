const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
const updateItem = html.slice(html.indexOf("function updateItem("), html.indexOf("const nm="));
const scheduleSync = html.slice(html.indexOf("function scheduleSync("), html.indexOf("async function allRows("));

function tracker() {
  const item = { id: "item", page_id: "page", done: false, done_by: null, done_at: null };
  const calls = [];
  const context = vm.createContext({
    itemsById: new Map([[item.id, item]]),
    pageStats: new Map([[item.page_id, { d: 0, n: 1 }]]),
    pendingChecks: new Map(),
    syncTables: new Set(),
    itemsVersion: 0,
    syncT: null,
    lastSync: 0,
    filter: "all",
    clearTimeout() {},
    setTimeout(callback) { context.scheduled = callback; return 1; },
    refreshChecks() { calls.push("refresh"); },
    draw() { calls.push("draw"); },
    loadItems: async () => { calls.push("items"); },
    loadNotes: async () => { calls.push("notes"); },
    loadAll: async () => { calls.push("all"); },
    toast(message) { calls.push(message); },
  });
  vm.runInContext(updateItem + scheduleSync, context);
  return { context, item, calls };
}

test("realtime checkbox updates immediately and still reconciles from the server", async () => {
  const { context, item, calls } = tracker();
  context.scheduleSync({ table: "items", eventType: "UPDATE", new: {
    id: "item", done: true, done_by: "editor@example.com", done_at: "2026-01-01",
  } });
  assert.equal(item.done, true);
  assert.equal(item.done_by, "editor@example.com");
  assert.equal(context.pageStats.get("page").d, 1);
  assert.equal(context.itemsVersion, 1);
  assert.deepEqual(calls, ["refresh"]);
  await context.scheduled();
  assert.deepEqual(calls, ["refresh", "items", "draw"]);
});

test("pending local checkbox changes are not overwritten by realtime events", () => {
  const { context, item, calls } = tracker();
  context.pendingChecks.set("item", { update: { done: false } });
  context.scheduleSync({ table: "items", eventType: "UPDATE", new: {
    id: "item", done: true, done_by: "other@example.com", done_at: "2026-01-01",
  } });
  assert.equal(item.done, false);
  assert.equal(context.itemsVersion, 1);
  assert.deepEqual(calls, []);
  assert.equal(context.syncTables.has("items"), true);
});

test("filtered views redraw immediately; incomplete events use normal reconciliation", async () => {
  const { context, item, calls } = tracker();
  context.filter = "open";
  context.scheduleSync({ table: "items", eventType: "UPDATE", new: {
    id: "item", done: true, done_by: null, done_at: null,
  } });
  assert.deepEqual(calls, ["draw"]);
  context.scheduleSync({ table: "items", eventType: "UPDATE", new: { id: "item", done: false } });
  assert.equal(item.done, true);
  assert.equal(context.itemsVersion, 1);
  await context.scheduled();
  assert.deepEqual(calls, ["draw", "items", "draw"]);
});
