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
    { id: 1, read_at: null },
    { id: 2, read_at: null },
    { id: 3, read_at: "2026-01-01" },
  ];
  const context = vm.createContext({
    me: "me@example.com", notificationsReady: true, notifications: [{ id: 1 }], notificationsVersion: 0,
    notificationsError: "",
    allRows: async () => ({ data: incoming, error: null }),
    announceNotification: row => announced.push(row.id),
    renderNotifications() {},
    toast(message) { throw new Error(message); },
  });
  vm.runInContext(section("async function loadNotifications(", "function receiveNotification("), context);
  await context.loadNotifications();
  assert.deepEqual(announced, [2]);
  assert.equal(context.notifications.length, 3);
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
    notificationsReady: true, commentSending: false,
    notes: [
      { id: "1", item_id: "item", author: "alice@example.com", body: "Hi @[BOB@example.com]", created_at: "2026-01-01" },
      { id: "2", item_id: "item", author: "alice@example.com", body: "No tag", created_at: "2026-01-01", reply_to: "missing" },
      { id: "3", item_id: "item", author: "bob@example.com", body: "@[bob@example.com]", created_at: "2026-01-01" },
    ],
    $: () => thread, nm: email => email, esc: value => String(value),
    renderMentionText: value => value,
  });
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
  const sent = [], messages = [], elements = { commentSend: {}, commentText: { value: "" } };
  const draft = { text: "Thanks", files: [], voices: [], replyTo: "original" };
  const context = vm.createContext({
    commentSending: false, recStarting: false, rec: null, commentItem: "item", commentPage: "page",
    notificationsReady: true, notes: [{ id: "original", item_id: "item" }],
    pend: { item: draft }, pd: () => draft, $: id => elements[id],
    canReplyToTaggedComment: () => true,
    renderCommentDraft() {}, toast: message => messages.push(message),
    sb: { from: () => ({ insert: async note => { sent.push(note); return { error: null }; } }) },
    loadNotes: async () => {}, draw() {}, fail: error => { throw error; },
  });
  vm.runInContext(section('$("commentSend").onclick=async()=>{', '$("commentRec").onclick='), context);
  await elements.commentSend.onclick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].reply_to, "original");
  assert.equal(sent[0].body, "Thanks");
  assert.equal(context.pend.item, undefined);
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

test("reply alerts identify the response rather than a mention", () => {
  const alerts = [], messages = [];
  function Notification(title, options) { alerts.push({ title, ...options }); }
  Notification.permission = "granted";
  const context = vm.createContext({
    window: { Notification }, Notification, nm: () => "Bob", toast: message => messages.push(message),
  });
  vm.runInContext(section("function announceNotification(", "function renderNotifications("), context);
  context.announceNotification({ id: 1, sender: "bob@example.com", kind: "reply" });
  assert.match(messages[0], /Bob replied to your tagged comment/);
  assert.match(alerts[0].title, /Reply/);
  context.announceNotification({ id: 2, sender: "bob@example.com", kind: "mention" });
  assert.match(alerts[1].title, /mentioned/);
});
