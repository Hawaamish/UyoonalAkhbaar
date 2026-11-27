const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
function section(start, end) {
  return html.slice(html.indexOf(start), html.indexOf(end));
}

test("typing a mention detects its query at the caret without matching email addresses", () => {
  const context = vm.createContext({});
  vm.runInContext(section("function findMentionQuery(", "function hideMentionPicker("), context);
  const mention = context.findMentionQuery("Hello @Al, please check", 9, 9);
  assert.equal(mention.start, 6);
  assert.equal(mention.end, 9);
  assert.equal(mention.query, "Al");
  assert.equal(context.findMentionQuery("alice@example.com", 6, 6), null);
  assert.equal(context.findMentionQuery("@[alice@example.com]", 20, 20), null);
  assert.equal(context.findMentionQuery("@Ali", 1, 4), null);
  assert.equal(context.findMentionQuery("مرحبا @علي", 10, 10).query, "علي");
});

test("mention rendering escapes names and ordinary comment text", () => {
  const context = vm.createContext({
    members: [{ email: "alice@example.com", name: "<Alice>" }],
    nm: () => "<Alice>",
    esc: value => String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]),
  });
  vm.runInContext(section("function renderMentionText(", "function renderCommentThread("), context);
  assert.equal(
    context.renderMentionText('<script> @[alice@example.com] @[unknown@example.com]'),
    '&lt;script&gt; <span class="mention">@&lt;Alice&gt;</span> @[unknown@example.com]',
  );
});

test("member labels use display names, including for the signed-in member", () => {
  const context = vm.createContext({
    members: [{ email: "alice@example.com", name: "Alice Example" }],
  });
  vm.runInContext(section("const nm=e=>", "const pageCollator="), context);
  assert.equal(vm.runInContext('nm("ALICE@example.com")', context), "Alice Example");
  assert.equal(vm.runInContext('nm("unknown@example.com")', context), "unknown");
});

test("realtime notification accepts only new mentions for the signed-in member", () => {
  const calls = [];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: true, notifications: [], notificationsVersion: 0,
    renderNotifications: () => calls.push("render"),
    announceNotification: row => calls.push(row.id),
  });
  vm.runInContext(section("function receiveNotification(", "function announceNotification("), context);
  context.receiveNotification({ id: 1, recipient: "other@example.com" });
  context.receiveNotification({ id: 2, recipient: "me@example.com" });
  context.receiveNotification({ id: 2, recipient: "me@example.com" });
  assert.deepEqual(calls, ["render", 2]);
  assert.equal(context.notifications.length, 1);
  assert.equal(context.notificationsVersion, 1);
});

test("notification refresh announces only newly discovered unread mentions", async () => {
  const announced = [];
  const incoming = [
    { id: 1, note_id: "note-1", read_at: null },
    { id: 2, note_id: "note-2", read_at: null },
    { id: 3, note_id: "note-3", read_at: "2026-01-01" },
  ];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: true, notifications: [{ id: 1 }], notificationsVersion: 0,
    notificationsError: "",
    allRows: async () => ({ data: incoming, error: null }),
    sb: { from: () => ({ select: () => ({ in: async (_column, ids) => ({
      data: ids.map(id => ({ id, body: "Please review this point" })), error: null,
    }) }) }) },
    announceNotification: row => announced.push(row.id),
    renderNotifications() {},
    toast(message) { throw new Error(message); },
  });
  vm.runInContext(section("async function loadNotifications(", "function receiveNotification("), context);
  await context.loadNotifications();
  assert.deepEqual(announced, [2]);
  assert.equal(context.notifications.length, 3);
  assert.equal(context.notifications[1].comment_preview, "Please review this point");
});

test("notification loading failure disables mentions and reports the error", async () => {
  const messages = [];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: true, notifications: [], notificationsVersion: 0,
    notificationsError: "",
    allRows: async () => ({ data: null, error: new Error("database unavailable") }),
    renderNotifications() {},
    toast: message => messages.push(message),
  });
  vm.runInContext(section("async function loadNotifications(", "function receiveNotification("), context);
  await context.loadNotifications();
  assert.equal(context.notificationsReady, false);
  assert.match(messages[0], /database unavailable/);
});

test("a rejected notification request reports the error without breaking the tracker", async () => {
  const messages = [];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: false, notifications: [], notificationsVersion: 0,
    notificationsError: "",
    allRows: async () => { throw new Error("network unavailable"); },
    renderNotifications() {},
    toast: message => messages.push(message),
  });
  vm.runInContext(section("async function loadNotifications(", "function receiveNotification("), context);
  await context.loadNotifications();
  assert.equal(context.notificationsReady, false);
  assert.match(messages[0], /network unavailable/);
});

test("an outdated notification schema prompts the database upgrade", async () => {
  const messages = [];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: true, notifications: [], notificationsVersion: 0,
    notificationsError: "",
    allRows: async () => ({ data: null, error: { code: "42703", message: "column kind does not exist" } }),
    renderNotifications() {}, toast: message => messages.push(message),
  });
  vm.runInContext(section("async function loadNotifications(", "function receiveNotification("), context);
  await context.loadNotifications();
  assert.equal(context.notificationsReady, false);
  assert.match(messages[0], /updated tracker-mentions\.sql/);
});

test("reply controls appear only for comments that tag the signed-in member", () => {
  const thread = { innerHTML: "" };
  const context = vm.createContext({
    commentItem: "item", me: "bob@example.com", isAdmin: false,
    members: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
    notificationsReady: true, commentSending: false,
    notes: [
      { id: "1", item_id: "item", author: "alice@example.com", body: "Hi @[BOB@example.com]", created_at: "2026-01-01" },
      { id: "2", item_id: "item", author: "alice@example.com", body: "No tag", created_at: "2026-01-01", reply_to: "missing" },
      { id: "3", item_id: "item", author: "bob@example.com", body: "@[bob@example.com]", created_at: "2026-01-01" },
    ],
    $: () => thread, nm: email => email, esc: value => String(value),
    renderMentionText: value => value,
  });
  vm.runInContext(section("const pageThreadKey=", "function commentLabel("), context);
  vm.runInContext(section("function renderCommentThread(", "function renderMain("), context);
  context.renderCommentThread();
  assert.match(thread.innerHTML, /data-reply="1"/);
  assert.doesNotMatch(thread.innerHTML, /data-reply="2"|data-reply="3"/);
  assert.match(thread.innerHTML, /Reply to a deleted comment/);
  context.notificationsReady = false;
  context.renderCommentThread();
  assert.match(thread.innerHTML, /data-reply="1" disabled/);
});

test("sending a tagged reply links it to the original and refuses unavailable targets", async () => {
  const sent = [], messages = [], elements = { commentSend: {}, commentText: { value: "" }, commentThread: { scrollHeight: 300 } };
  const draft = { text: "Thanks", files: [], voices: [], replyTo: "original" };
  const context = vm.createContext({
    commentSending: false, recStarting: false, rec: null, commentItem: "item", commentPage: "page",
    notificationsReady: true, notes: [{ id: "original", item_id: "item" }],
    pend: { item: draft }, pd: () => draft, $: id => elements[id],
    canReplyToTaggedComment: () => true,
    renderCommentDraft() {}, toast: message => messages.push(message),
    sb: { from: () => ({ insert: async note => { sent.push(note); return { error: null }; } }) },
    loadNotes: async () => {}, loadPageCommentCounts: async () => {}, draw() {}, fail: error => { throw error; },
  });
  vm.runInContext(section("const pageThreadKey=", "function commentLabel("), context);
  vm.runInContext(section('$("commentSend").onclick=async()=>{', '$("commentRec").onclick='), context);
  await elements.commentSend.onclick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].reply_to, "original");
  assert.equal(sent[0].body, "Thanks");
  assert.equal(context.pend.item, undefined);
  assert.equal(elements.commentThread.scrollTop, 300);
  assert.doesNotMatch(messages.join(" "), /couldn’t refresh/i);
  context.notificationsReady = false;
  await elements.commentSend.onclick();
  assert.equal(sent.length, 1);
  assert.match(messages.at(-1), /Notifications are unavailable/);
  context.notificationsReady = true;
  context.notes = [];
  await elements.commentSend.onclick();
  assert.equal(sent.length, 1);
  assert.match(messages.at(-1), /tagged comment is unavailable/i);
});

test("chat bubbles use consistent member colors and preserve reading position", () => {
  const thread = { innerHTML: "", scrollTop: 100, scrollHeight: 600, clientHeight: 200 };
  const context = vm.createContext({
    commentItem: "item", me: "bob@example.com", isAdmin: false,
    members: [{ email: "bob@example.com" }, { email: "alice@example.com" }],
    notificationsReady: true, commentSending: false,
    notes: [
      { id: "1", item_id: "item", author: "alice@example.com", body: "First", created_at: "2026-01-01" },
      { id: "2", item_id: "item", author: "BOB@example.com", body: "Mine", created_at: "2026-01-01" },
      { id: "3", item_id: "item", author: "alice@example.com", body: "Again", created_at: "2026-01-01" },
    ],
    $: () => thread, nm: email => email, esc: value => String(value),
    renderMentionText: value => value,
  });
  vm.runInContext(section("const pageThreadKey=", "function commentLabel("), context);
  vm.runInContext(section("function renderCommentThread(", "function renderMain("), context);
  context.renderCommentThread();
  const bubbles = [...thread.innerHTML.matchAll(/class="nt( mine)?" style="--chat-hue:([\d.]+)" data-note="(\d)"/g)];
  assert.equal(bubbles.length, 3);
  assert.equal(bubbles[0][2], bubbles[2][2]);
  assert.notEqual(bubbles[0][2], bubbles[1][2]);
  assert.equal(bubbles[1][1], " mine");
  assert.equal(thread.scrollTop, 100);
  thread.scrollTop = 390;
  context.renderCommentThread();
  assert.equal(thread.scrollTop, 600);
  thread.scrollTop = 100;
  context.renderCommentThread(true);
  assert.equal(thread.scrollTop, 600);
});

test("reply alerts identify the response rather than a mention", () => {
  const alerts = [], messages = [];
  function Notification(title, options) { alerts.push({ title, ...options }); }
  Notification.permission = "granted";
  const context = vm.createContext({
    window: { Notification }, Notification, nm: () => "Bob", toast: message => messages.push(message),
    pages: [],
  });
  vm.runInContext(section("function announceNotification(", "function renderNotifications("), context);
  context.announceNotification({ id: 1, sender: "bob@example.com", kind: "reply" });
  assert.match(messages[0], /Bob replied to your tagged comment/);
  assert.match(alerts[0].title, /Reply/);
  context.announceNotification({ id: 2, sender: "bob@example.com", kind: "mention" });
  assert.match(alerts[1].title, /mentioned/);
});

test("notification cards highlight the page number and show an escaped comment preview", () => {
  const elements = {
    notificationBadge: {},
    notificationsBtn: { setAttribute() {} },
    notificationStatus: {},
    mentionBtn: {},
    commentThread: { querySelectorAll: () => [] },
    notificationPermission: {},
    notificationList: {},
  };
  const context = vm.createContext({
    notifications: [{
      id: 1, page_id: "page-1", item_id: "item-1", sender: "bob@example.com",
      kind: "mention", created_at: "2026-01-01T00:00:00Z", read_at: null,
      comment_preview: "<please review>",
    }],
    notificationsError: "", notificationsReady: true, commentSending: false,
    pages: [{ id: "page-1", label: "ص204" }],
    window: { isSecureContext: true },
    Notification: { permission: "granted" },
    nm: () => "Bob",
    esc: value => String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]),
    $: id => elements[id],
  });
  vm.runInContext(section("function renderNotifications(", "function hideNotifications("), context);
  context.renderNotifications();
  assert.match(elements.notificationList.innerHTML, /class="notification-page">Page ص204<\/span>/);
  assert.match(elements.notificationList.innerHTML, /class="notification-comment">&lt;please review&gt;<\/span>/);
  context.notifications.push({ id: 2, page_id: "page-1", item_id: null, sender: "bob@example.com",
    kind: "mention", created_at: "2026-01-01", read_at: null, comment_preview: "General discussion" });
  context.renderNotifications();
  assert.match(elements.notificationList.innerHTML, /notification-item unread page-discussion/);
  assert.match(elements.notificationList.innerHTML, />Page comment<\/span>/);
  assert.match(elements.notificationList.innerHTML, />Point comment<\/span>/);
});

test("page comments stay separate from points and send replies with a null item", async () => {
  const sent = [], elements = { commentSend: {}, commentText: { value: "" }, commentThread: { innerHTML: "", scrollHeight: 0 } };
  const draft = { text: "Thanks @[alice@example.com]", files: [], voices: [], replyTo: "general" };
  const context = vm.createContext({
    commentItem: "page:p1", commentPage: "p1", commentSending: false, recStarting: false, rec: null,
    me: "bob@example.com", isAdmin: false, notificationsReady: true,
    members: [{ email: "alice@example.com" }, { email: "bob@example.com" }],
    notes: [
      { id: "general", page_id: "p1", item_id: null, author: "alice@example.com", body: "Hi @[bob@example.com]", created_at: "2026-01-01" },
      { id: "point", page_id: "p1", item_id: "i1", author: "alice@example.com", body: "Point comment", created_at: "2026-01-01" },
    ],
    pend: { "page:p1": draft }, pd: () => draft, $: id => elements[id],
    nm: email => email, esc: value => String(value), renderMentionText: value => value,
    renderCommentDraft() {}, toast() {}, loadNotes: async () => {}, loadPageCommentCounts: async () => {}, draw() {}, fail: error => { throw error; },
    sb: { from: () => ({ insert: async note => { sent.push(note); return { error: null }; } }) },
  });
  vm.runInContext(section("const pageThreadKey=", "function commentLabel("), context);
  vm.runInContext(section("function renderCommentThread(", "function renderMain("), context);
  vm.runInContext(section('$("commentSend").onclick=async()=>{', '$("commentRec").onclick='), context);
  context.renderCommentThread();
  assert.match(elements.commentThread.innerHTML, /data-note="general"/);
  assert.doesNotMatch(elements.commentThread.innerHTML, /data-note="point"/);
  await elements.commentSend.onclick();
  assert.equal(sent[0].item_id, null);
  assert.equal(sent[0].page_id, "p1");
  assert.equal(sent[0].reply_to, "general");
});

test("opening a page-comment notification navigates to its discussion", async () => {
  const opened = [], target = { classList: { add: name => opened.push(name) }, scrollIntoView: () => {} };
  const elements = {
    notificationsM: { classList: { contains: () => false } },
    commentThread: { querySelectorAll: () => [{ ...target, dataset: { note: "n1" } }] },
  };
  const context = vm.createContext({
    notifications: [{ id: 1, page_id: "p1", item_id: null, note_id: "n1", read_at: "already read" }],
    commentItem: null, pages: [{ id: "p1" }], itemsById: new Map(), cur: null, filter: "all",
    notes: [{ id: "n1", item_id: null }], mobile: { matches: false },
    $: id => elements[id], loadAll: async () => { throw new Error("unnecessary reload"); },
    loadNotes: async () => {}, draw() {}, openComments: id => opened.push(id),
    toast: message => { throw new Error(message); },
  });
  vm.runInContext(section("const pageThreadKey=", "function commentLabel("), context);
  vm.runInContext(section("async function openNotification(", "async function hydrate("), context);
  await context.openNotification(1);
  assert.deepEqual(opened, ["page:p1", "notification-target"]);
});
