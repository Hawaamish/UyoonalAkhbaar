const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
const sync = html.slice(html.indexOf("async function trackedLoad("), html.indexOf("async function allRows("));
const connection = html.slice(html.indexOf("const fallbackSyncInterval="), html.indexOf("sb.auth.getSession()"));
const item = (id, fields = {}) => ({ id, page_id: "page", text: "Point", sort_order: 1, done: false, done_by: null, done_at: null, ...fields });
const note = (id, fields = {}) => ({ id, page_id: "page", item_id: null, body: "Hi", author: "a@example.com",
  created_at: "2026-01-01", reply_to: null, voice_path: null, attachments: [], ...fields });
const page = id => ({ id, label: id, image_path: null, sort_order: 1 });
const notification = id => ({ id, note_id: "n", page_id: "page", item_id: null, recipient: "me@example.com",
  sender: "other@example.com", created_at: "2026-01-01", read_at: null, kind: "mention" });

function tracker() {
  const calls = [];
  const context = vm.createContext({
    items: [item("i1")], itemsById: new Map(), pendingChecks: new Map(),
    pages: [page("page")], cur: "page", notes: [], notesFor: "page",
    members: [{ email: "me@example.com", name: "Me", role: "admin" }], me: "me@example.com", isAdmin: true,
    notifications: [], notificationsReady: true,
    pageCommentCounts: new Map(), pageCommentIds: new Map(),
    pageColumns: "id,label,image_path,sort_order",
    itemColumns: "id,page_id,text,sort_order,done,done_by,done_at",
    noteColumns: "id,page_id,item_id,body,author,created_at,reply_to,voice_path,attachments",
    memberColumns: "email,name,role",
    pagesVersion: 0, itemsVersion: 0, notesVersion: 0, pageCommentCountsVersion: 0,
    membersVersion: 0, notificationsVersion: 0,
    activeLoads: new Map(), pendingWrites: new Set(), notificationRecoveries: new Map(), signedOut: false,
    syncTables: new Set(), syncT: null, lastSync: 0,
    $: () => ({}), comparePages: (a, b) => a.label.localeCompare(b.label),
    indexItems() { context.itemsById = new Map(context.items.map(row => [row.id, row])); },
    draw() { calls.push("draw"); }, renderNotifications() { calls.push("notifications-render"); },
    announceNotification(row) { calls.push("announce:" + row.id); },
    loadNotificationPreview() { calls.push("preview"); },
    clearTimeout() {}, setTimeout(callback) { context.scheduled = callback; return 1; },
    loadPages: async () => calls.push("pages"), loadMembers: async () => calls.push("members"),
    loadItems: async () => calls.push("items"), loadNotes: async () => calls.push("notes"),
    loadPageCommentCounts: async () => calls.push("page counts"),
    loadNotifications: async () => calls.push("notifications"), loadAll: async () => calls.push("all"),
    toast(message) { calls.push(message); },
  });
  context.indexItems();
  vm.runInContext(sync, context);
  vm.runInContext(html.slice(html.indexOf("function receiveNotification("), html.indexOf("async function loadNotificationPreview(")), context);
  return { context, calls };
}

test("item insert, update, delete and own echo patch state without reads", () => {
  const { context: c, calls } = tracker();
  const added = item("i2", { sort_order: 2 });
  c.scheduleSync({ table: "items", eventType: "INSERT", new: added });
  c.scheduleSync({ table: "items", eventType: "INSERT", new: added });
  assert.equal(c.items.length, 2);
  c.scheduleSync({ table: "items", eventType: "UPDATE", new: { ...added, done: true } });
  assert.equal(c.itemsById.get("i2").done, true);
  c.scheduleSync({ table: "items", eventType: "DELETE", old: { id: "i2" } });
  c.scheduleSync({ table: "items", eventType: "DELETE", old: { id: "i2" } });
  assert.deepEqual(Array.from(c.items, row => row.id), ["i1"]);
  assert.equal(c.syncTables.size, 0);
  assert.ok(calls.every(call => call === "draw"));
});

test("local checkbox intent survives competing events and requests reconciliation", () => {
  const { context: c } = tracker();
  c.pendingChecks.set("i1", { update: { done: true, done_by: "me", done_at: "time" } });
  c.scheduleSync({ table: "items", eventType: "UPDATE", new: item("i1", { done: false, text: "Remote edit" }) });
  assert.equal(c.itemsById.get("i1").done, true);
  assert.equal(c.itemsById.get("i1").text, "Remote edit");
  assert.equal(c.pendingChecks.get("i1").needsRefresh, true);
});

test("a differently formatted timestamp in the checkbox echo is not a conflict", () => {
  const { context: c } = tracker();
  c.pendingChecks.set("i1", { update: { done: true, done_by: "me", done_at: "2026-01-01T00:00:00.000Z" } });
  c.scheduleSync({ table: "items", eventType: "UPDATE", new: item("i1", {
    done: true, done_by: "me", done_at: "2026-01-01T00:00:00+00:00",
  }) });
  assert.equal(c.pendingChecks.get("i1").needsRefresh, undefined);
  assert.equal(c.syncTables.size, 0);
});

test("note changes update current thread and global page counts exactly once", () => {
  const { context: c } = tracker();
  const n = note("n1");
  c.scheduleSync({ table: "notes", eventType: "INSERT", new: n });
  c.scheduleSync({ table: "notes", eventType: "INSERT", new: n });
  assert.equal(c.notes.length, 1);
  assert.equal(c.pageCommentCounts.get("page"), 1);
  c.scheduleSync({ table: "notes", eventType: "UPDATE", new: { ...n, item_id: "i1" } });
  assert.equal(c.pageCommentCounts.has("page"), false);
  assert.equal(c.notes[0].item_id, "i1");
  c.scheduleSync({ table: "notes", eventType: "DELETE", old: { id: "n1" } });
  assert.equal(c.notes.length, 0);
  assert.equal(c.syncTables.size, 0);
});

test("pages and members apply row changes and delete without fetching unrelated tables", () => {
  const { context: c } = tracker();
  c.scheduleSync({ table: "pages", eventType: "INSERT", new: page("other") });
  c.scheduleSync({ table: "pages", eventType: "UPDATE", new: { ...page("other"), label: "Changed" } });
  assert.equal(c.pages.find(p => p.id === "other").label, "Changed");
  c.scheduleSync({ table: "pages", eventType: "DELETE", old: { id: "other" } });
  c.scheduleSync({ table: "members", eventType: "INSERT", new: { email: "new@example.com", name: "New", role: "member" } });
  c.scheduleSync({ table: "members", eventType: "UPDATE", new: { email: "new@example.com", name: "Updated", role: "member" } });
  assert.equal(c.members[1].name, "Updated");
  c.scheduleSync({ table: "members", eventType: "DELETE", old: { email: "new@example.com" } });
  assert.equal(c.members.length, 1);
  assert.equal(c.syncTables.size, 0);
});

test("notification insert, update and delete are idempotent and preview loads once", () => {
  const { context: c, calls } = tracker(), n = notification(1);
  c.scheduleSync({ table: "tracker_notifications", eventType: "INSERT", new: n });
  c.scheduleSync({ table: "tracker_notifications", eventType: "INSERT", new: n });
  assert.equal(c.notifications.length, 1);
  assert.equal(calls.filter(call => call === "preview").length, 1);
  c.scheduleSync({ table: "tracker_notifications", eventType: "UPDATE", new: { ...n, read_at: "now" } });
  assert.equal(c.notifications[0].read_at, "now");
  c.scheduleSync({ table: "tracker_notifications", eventType: "DELETE", old: { id: 1 } });
  assert.equal(c.notifications.length, 0);
});

test("a tagged comment recovers its notification when the notification event is missing", async () => {
  const { context: c, calls } = tracker();
  const n = { ...notification(1), note_id: "n1" };
  let queries = 0;
  c.sb = { from: () => ({ select: () => ({
    eq() { return this; }, async maybeSingle() { queries++; return { data: n, error: null }; },
  }) }) };
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n1", { body: "Hi @[me@example.com]" }) });
  await c.scheduled();
  assert.equal(queries, 1);
  assert.equal(c.notifications.length, 1);
  assert.ok(calls.includes("announce:1"));
  assert.ok(!calls.includes("all"));
});

test("a native notification arriving during recovery is announced only once", async () => {
  const { context: c, calls } = tracker();
  const n = { ...notification(1), note_id: "n1" };
  let finish;
  c.sb = { from: () => ({ select: () => ({
    eq() { return this; }, maybeSingle() { return new Promise(resolve => { finish = resolve; }); },
  }) }) };
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n1", { body: "Hi @[me@example.com]" }) });
  const recovery = c.scheduled();
  c.receiveChange({ table: "tracker_notifications", eventType: "INSERT", new: n });
  finish({ data: n, error: null });
  await recovery;
  assert.equal(c.notifications.length, 1);
  assert.equal(calls.filter(call => call === "announce:1").length, 1);
  assert.equal(calls.filter(call => call === "preview").length, 1);
});

test("a reply recovers its recipient notification, and failed checks report an error", async () => {
  const { context: c, calls } = tracker();
  c.sb = { from: () => ({ select: () => ({
    eq() { return this; }, async maybeSingle() { return { data: null, error: new Error("offline") }; },
  }) }) };
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n1", { reply_to: "original" }) });
  await c.scheduled();
  assert.ok(calls.some(call => call.includes("Couldn’t check the mention notification: offline")));
});

test("a notification received before recovery needs no extra query", async () => {
  const { context: c } = tracker();
  const n = { ...notification(1), note_id: "n1" };
  c.sb = { from: () => { throw new Error("Unexpected notification query"); } };
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n1", { body: "@[me@example.com]" }) });
  const recovery = c.scheduled;
  c.receiveChange({ table: "tracker_notifications", eventType: "INSERT", new: n });
  await recovery();
  assert.equal(c.notifications.length, 1);
});

test("ordinary comments do not trigger notification recovery and missing tagged notifications are reported", async () => {
  const { context: c, calls } = tracker();
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n1") });
  assert.equal(c.notificationRecoveries.size, 0);
  c.sb = { from: () => ({ select: () => ({
    eq() { return this; }, async maybeSingle() { return { data: null, error: null }; },
  }) }) };
  c.receiveChange({ table: "notes", eventType: "INSERT", new: note("n2", { body: "@[me@example.com]" }) });
  await c.scheduled();
  assert.ok(calls.some(call => call.includes("Mention notification not found")));
});

test("incomplete events fall back only to the affected table", async () => {
  const { context: c, calls } = tracker();
  c.scheduleSync({ table: "items", eventType: "UPDATE", new: { id: "i1" } });
  await c.scheduled();
  assert.deepEqual(calls, ["items", "draw"]);
  calls.length = 0;
  c.scheduleSync({ table: "members", eventType: "DELETE", old: {} });
  await c.scheduled();
  assert.deepEqual(calls, ["members", "draw"]);
  calls.length = 0;
  c.scheduleSync({ table: "notes", eventType: "DELETE", old: {} });
  await c.scheduled();
  assert.deepEqual(calls, ["notes", "page counts", "draw"]);
});

test("events during reads queue table-specific reconciliation", async () => {
  const { context: c, calls } = tracker();
  c.activeLoads.set("items", 1);
  c.scheduleSync({ table: "items", eventType: "INSERT", new: item("i2") });
  assert.equal(c.items.length, 2);
  await c.scheduled();
  assert.deepEqual(calls, ["draw", "items", "draw"]);
});

test("an insert response cannot resurrect a row deleted after its realtime echo", async () => {
  const { context: c } = tracker();
  let finish;
  c.sb = { from: () => ({ insert: () => ({ select: () => new Promise(resolve => { finish = resolve; }) }) }) };
  vm.runInContext(html.slice(html.indexOf("async function addItems("), html.indexOf("/* ---------- render ---------- */")), c);
  const save = c.addItems("page", ["New"]);
  const added = item("i2");
  c.receiveChange({ table: "items", eventType: "INSERT", new: added });
  c.receiveChange({ table: "items", eventType: "DELETE", old: { id: "i2" } });
  finish({ data: [added], error: null });
  await save;
  assert.equal(c.items.some(row => row.id === "i2"), false);
  assert.equal(c.pendingWrites.size, 0);
});

test("a successful checkbox save uses its returned row without reloading items", async () => {
  const { context: c, calls } = tracker();
  c.refreshChecks = () => {};
  c.updateItem = (row, fields) => Object.assign(row, fields);
  c.sb = { from: () => ({ update: fields => ({ eq: () => ({ select: () => ({
    maybeSingle: async () => ({ data: { id: "i1", ...fields }, error: null }),
  }) }) }) }) };
  c.fail = error => { throw error; };
  vm.runInContext(html.slice(html.indexOf("async function saveCheck("), html.indexOf('$("main").oninput=')), c);
  await c.saveCheck("i1", true);
  assert.equal(c.itemsById.get("i1").done, true);
  assert.equal(c.pendingChecks.size, 0);
  assert.ok(!calls.includes("items"));
});

test("a conflicting checkbox event triggers a table-only reconciliation after save", async () => {
  const { context: c, calls } = tracker();
  let finish;
  c.refreshChecks = () => {};
  c.updateItem = (row, fields) => Object.assign(row, fields);
  c.sb = { from: () => ({ update: fields => ({ eq: () => ({ select: () => ({
    maybeSingle: () => new Promise(resolve => { finish = () => resolve({ data: { id: "i1", ...fields }, error: null }); }),
  }) }) }) }) };
  c.fail = error => { throw error; };
  vm.runInContext(html.slice(html.indexOf("async function saveCheck("), html.indexOf('$("main").oninput=')), c);
  const save = c.saveCheck("i1", true);
  c.scheduleSync({ table: "items", eventType: "UPDATE", new: item("i1") });
  finish();
  await save;
  assert.ok(calls.includes("items"));
  assert.ok(!calls.includes("all"));
});

test("the complete inline tracker script parses", () => {
  const script = html.slice(html.indexOf("const SUPABASE_URL="), html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new vm.Script(script));
});

test("reconnect schedules a full reconciliation", () => {
  const calls = [], listeners = {}, channel = {
    on() { return this; },
    subscribe(callback) { callback("SUBSCRIBED"); },
  };
  const context = vm.createContext({
    document: { hidden: false, addEventListener: (event, fn) => { listeners[event] = fn; } },
    window: { addEventListener: (event, fn) => { listeners[event] = fn; } },
    me: "me@example.com", chan: null, presenceConnected: false, presenceEpoch: 0,
    presenceReady: false, presenceError: false, presenceRunning: false, presenceSent: "", presenceRetry: null,
    sb: { channel: () => channel, removeChannel() {} },
    $: () => ({}), clearTimeout() {}, setInterval() {}, renderPresence() {}, publishPresence() {},
    scheduleSync: change => calls.push(change.table), receiveChange() {},
    checkRefreshRevision: async () => calls.push("refresh check"), reportRefreshError() {},
  });
  vm.runInContext(connection, context);
  context.connectLive();
  assert.deepEqual(calls, ["all", "refresh check"]);
});

test("fallback polling and focus avoid frequent full reloads while retaining recovery", () => {
  let now = 0, poll;
  const calls = [], listeners = {};
  const context = vm.createContext({
    Date: { now: () => now },
    document: { hidden: false, addEventListener: (event, fn) => { listeners[event] = fn; } },
    window: { addEventListener: (event, fn) => { listeners[event] = fn; } },
    me: "member@example.com", presenceConnected: true,
    setInterval: (fn, delay) => { poll = fn; assert.ok(delay <= 30000); },
    scheduleSync: change => calls.push(change.table), checkRefreshRevision: async () => calls.push("refresh check"),
    reportRefreshError() {},
  });
  vm.runInContext(connection, context);
  now = 20000;
  poll(); listeners.focus(); listeners.visibilitychange();
  assert.deepEqual(calls, []);
  now = 301000;
  context.document.hidden = true;
  poll(); listeners.visibilitychange();
  assert.deepEqual(calls, []);
  context.document.hidden = false;
  listeners.visibilitychange();
  assert.deepEqual(calls, ["all", "refresh check"]);
  calls.length = 0;
  poll();
  assert.deepEqual(calls, ["all", "refresh check"]);
});

function refreshTracker() {
  const saved = new Map(), calls = [], timers = [];
  const elements = {
    refreshStatus: {}, refreshMembers: {}, q: { value: "chapter" },
    sidePanel: { classList: { contains: () => false } }, lb: { style: {} },
    printArea: { hasChildNodes: () => false }, newIt: { value: "" }, mmE: { value: "" }, mmN: { value: "" },
    main: { scrollTop: 140 }, plist: { scrollTop: 90 },
  };
  const document = {
    activeElement: null, body: { classList: { contains: () => true } },
    querySelector: () => null, querySelectorAll: () => [],
  };
  const context = vm.createContext({
    refreshRevision: null, refreshPending: false, refreshSending: false, refreshActions: 0,
    refreshTimer: null, refreshActivity: 0, signedOut: false, me: "member@example.com",
    rec: null, recStarting: false, commentSending: false, pageSaving: false,
    pendingWrites: new Set(), pendingChecks: new Map(), pend: {}, itemsById: new Map(),
    cur: "page-1", filter: "open", presenceUser: "user-1", document, window: { scrollY: 210 },
    $: id => elements[id] || null, URL, Date: { now: () => 3000 }, console,
    sessionStorage: {
      getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value),
      removeItem: key => saved.delete(key),
    },
    location: { href: "https://example.test/tracker.html", replace: url => calls.push(url) },
    setTimeout: callback => { timers.push(callback); return timers.length; },
  });
  const start = html.indexOf("function restoreRefreshView("), end = html.indexOf('$("refreshMembers").onclick=');
  vm.runInContext(html.slice(start, end), context);
  return { context, elements, document, saved, calls, timers };
}

test("refresh revisions reload once and preserve the current workspace", () => {
  const { context: c, calls, timers } = refreshTracker();
  c.observeRefreshRevision(4);
  assert.equal(timers.length, 0);
  c.observeRefreshRevision(5, true);
  c.observeRefreshRevision(5, true);
  c.observeRefreshRevision(4);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get("tracker_refresh"), "5");
  const view = c.restoreRefreshView("user-1");
  assert.equal(view.page, "page-1");
  assert.equal(view.filter, "open");
  assert.equal(view.search, "chapter");
  assert.equal(view.mainScroll, 140);
  assert.equal(view.listScroll, 90);
  assert.equal(view.windowScroll, 210);
  assert.equal(c.restoreRefreshView("user-1"), null);
});

test("refresh waits for drafts, recordings, edits, dialogs and in-flight writes", () => {
  const { context: c, document, elements, calls } = refreshTracker();
  c.observeRefreshRevision(1, true);
  const draft = { text: "unsent", files: [], voices: [] };
  c.pend.x = draft;
  c.tryMemberRefresh();
  assert.equal(calls.length, 0);
  draft.text = ""; draft.voices.push({});
  assert.equal(c.refreshIsBusy(), true);
  draft.voices.length = 0;
  c.rec = {};
  assert.equal(c.refreshIsBusy(), true);
  c.rec = null;
  c.pendingWrites.add({});
  assert.equal(c.refreshIsBusy(), true);
  c.pendingWrites.clear();
  c.refreshActions = 1;
  assert.equal(c.refreshIsBusy(), true);
  c.refreshActions = 0;
  elements.newIt.value = "unsaved";
  assert.equal(c.refreshIsBusy(), true);
  elements.newIt.value = "";
  document.querySelector = () => ({});
  assert.equal(c.refreshIsBusy(), true);
  document.querySelector = () => null;
  document.querySelectorAll = selector => selector === "textarea[data-t]" ?
    [{ dataset: { t: "i1" }, value: "edited" }] : [];
  c.itemsById.set("i1", { text: "saved" });
  assert.equal(c.refreshIsBusy(), true);
  c.itemsById.get("i1").text = "edited";
  assert.equal(c.refreshIsBusy(), false);
  c.tryMemberRefresh();
  assert.equal(calls.length, 1);
});

test("reconnect catches missed refreshes without reloading on the initial baseline", async () => {
  const { context: c, timers } = refreshTracker();
  let revision = 2;
  c.sb = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { revision }, error: null }) }) }) }) };
  await c.checkRefreshRevision();
  assert.equal(timers.length, 0);
  revision = 3;
  await c.checkRefreshRevision();
  assert.equal(timers.length, 1);
  assert.equal(c.refreshPending, true);
});

test("refresh does not reload if workspace storage fails", () => {
  const { context: c, elements, calls } = refreshTracker();
  c.sessionStorage.setItem = () => { throw new Error("storage unavailable"); };
  c.console = { error() {} };
  c.observeRefreshRevision(1, true);
  c.tryMemberRefresh();
  assert.equal(calls.length, 0);
  assert.match(elements.refreshStatus.textContent, /reload manually/);
});

test("adding a point with Enter keeps refresh blocked until the save finishes", async () => {
  const { context: c, elements } = refreshTracker();
  let finish;
  c.addOne = () => new Promise(resolve => { finish = resolve; });
  c.window.addEventListener = () => {};
  for (const id of ["main", "migrateMedia", "commentThread", "commentSend", "mOk", "impF", "exp", "memL", "memAdd", "notificationList"]) {
    elements[id] = {};
  }
  elements.main.onkeydown = async () => {};
  elements.main.onchange = async () => {};
  elements.main.onclick = async () => {};
  const keyStart = html.indexOf('$("main").onkeydown='), keyEnd = html.indexOf("async function addOne()", keyStart);
  vm.runInContext(html.slice(keyStart, keyEnd), c);
  const wrapStart = html.indexOf('for(const [id,event] of [["main","onclick"]');
  vm.runInContext(html.slice(wrapStart, html.indexOf("</script>", wrapStart)), c);
  const action = elements.main.onkeydown({ target: { id: "newIt" }, key: "Enter" });
  assert.equal(c.refreshIsBusy(), true);
  finish();
  await action;
  assert.equal(c.refreshIsBusy(), false);
});

test("admin refresh checks authorization and reports request failures", async () => {
  const { context: c, elements, calls } = refreshTracker();
  const messages = [];
  c.isAdmin = false; c.confirm = () => true; c.toast = message => messages.push(message);
  c.setSideOpen = () => calls.push("closed");
  c.sb = { rpc: async () => ({ data: null, error: new Error("offline") }) };
  const start = html.indexOf('$("refreshMembers").onclick='), end = html.indexOf('for(const event of ["pointerdown"', start);
  vm.runInContext(html.slice(start, end), c);
  await elements.refreshMembers.onclick();
  assert.match(messages.pop(), /Only admins/);
  c.isAdmin = true;
  await elements.refreshMembers.onclick();
  assert.match(messages.pop(), /offline/);
  assert.equal(c.refreshPending, false);
  c.sb.rpc = async () => ({ data: 6, error: null });
  await elements.refreshMembers.onclick();
  assert.equal(c.refreshPending, true);
  assert.equal(c.refreshSending, false);
  assert.ok(calls.includes("closed"));
});
