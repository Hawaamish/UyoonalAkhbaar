const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
function section(start, end) {
  return html.slice(html.indexOf(start), html.indexOf(end));
}

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
