const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
function section(start, end) {
  return html.slice(html.indexOf(start), html.indexOf(end));
}
const patchMarkup = (element, markup) => { element.innerHTML = markup; };

test("page search matches both labels and checklist text", () => {
  const context = vm.createContext({
    pages: [{ id: "1", label: "Page 1" }, { id: "2", label: "Page 2" }],
    its: id => id === "2" ? [{ text: "A Special Point" }] : [],
  });
  vm.runInContext(section("function matchingPages(", "function renderList("), context);
  assert.deepEqual(Array.from(context.matchingPages("PAGE 1"), p => p.id), ["1"]);
  assert.deepEqual(Array.from(context.matchingPages("special"), p => p.id), ["2"]);
  assert.equal(context.matchingPages("missing").length, 0);
});

test("gallery identifies the selected page and escapes page labels", () => {
  const elements = { gallerySearch: { value: "" }, galleryCount: {}, galleryGrid: {} };
  const context = vm.createContext({
    $: id => elements[id], patchMarkup,
    pages: [{ id: "1", label: "<Page>", image_path: "page.webp" }], cur: "1",
    matchingPages: () => [{ id: "1", label: "<Page>", image_path: "page.webp" }],
    pageThumbnailPath: path => path + ".thumb-240-v1",
    stat: () => ({ d: 1, n: 2, pc: 50 }),
    esc: value => String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]),
  });
  vm.runInContext(section("function renderGallery(", "const commentIcon="), context);
  context.renderGallery();
  assert.match(elements.galleryGrid.innerHTML, /aria-current="page"/);
  assert.match(elements.galleryGrid.innerHTML, /&lt;Page&gt;/);
  assert.match(elements.galleryGrid.innerHTML, /<img data-p="page\.webp\.thumb-240-v1" data-original="page\.webp"/);
  assert.equal(elements.galleryCount.textContent, "1 of 1 pages");
});

test("selecting a gallery page keeps mobile detail history when already open", async () => {
  const calls = [], main = { scrollTop: 200 };
  const context = vm.createContext({
    cur: "1", notes: [{ id: "note" }], notesFor: "1",
    mobile: { matches: true },
    document: { body: { classList: { contains: () => true } } },
    $: () => main,
    showMobileDetail: () => calls.push("detail"),
    draw: () => calls.push("draw"),
    loadNotes: async () => calls.push("notes"),
  });
  vm.runInContext(section("async function selectPage(", '$("plist").onclick='), context);
  await context.selectPage("2");
  assert.equal(context.cur, "2");
  assert.equal(context.notes.length, 0);
  assert.equal(context.notesFor, null);
  assert.equal(main.scrollTop, 0);
  assert.deepEqual(calls, ["draw", "notes", "draw"]);
});

test("page list highlights general comments for each page independently", () => {
  const elements = {
    ovT: {}, ovB: { style: {} }, q: { value: "" }, plist: {},
    galleryM: { classList: { contains: () => false } },
  };
  const pages = [{ id: "1", label: "Page 1", image_path: "page.webp" }, { id: "2", label: "Page 2" }];
  const context = vm.createContext({
    $: id => elements[id], patchMarkup, pages, cur: "1", pageCommentCounts: new Map([["2", 2]]),
    pageCommentCountsError: false, matchingPages: () => pages, stat: () => ({ d: 0, n: 0, pc: 0 }),
    esc: value => String(value), commentIcon: "<svg></svg>",
  });
  vm.runInContext(section("function renderList(", "function renderGallery("), context);
  context.renderList();
  assert.match(elements.plist.innerHTML, /class="page-comment-btn" data-page-comments="1"[^>]*no comments/);
  assert.match(elements.plist.innerHTML, /class="page-comment-btn has" data-page-comments="2"[^>]*2 comments/);
  assert.match(elements.plist.innerHTML, /<\/button><button class="page-comment-btn/);
  assert.doesNotMatch(elements.plist.innerHTML, /<img\b/);
  assert.match(elements.plist.innerHTML, /Page 1/);
});

test("page comment counts discard stale results and report loading failures", async () => {
  const pending = [], messages = [];
  const context = vm.createContext({
    pageCommentCountsVersion: 0, pageCommentCounts: null, pageCommentCountsError: false,
    trackedLoad: (_table, request) => request,
    allRows: () => new Promise(resolve => pending.push(resolve)),
    toast: message => messages.push(message),
  });
  vm.runInContext(section("async function loadPageCommentCounts(", "async function loadNotifications("), context);
  const first = context.loadPageCommentCounts(), second = context.loadPageCommentCounts();
  pending[1]({ data: [{ page_id: "2" }, { page_id: "2" }], error: null });
  await second;
  pending[0]({ data: [{ page_id: "1" }], error: null });
  await first;
  assert.equal(context.pageCommentCounts.get("2"), 2);
  assert.equal(context.pageCommentCounts.has("1"), false);
  const failed = context.loadPageCommentCounts();
  pending[2]({ data: null, error: new Error("offline") });
  await failed;
  assert.equal(context.pageCommentCounts, null);
  assert.equal(context.pageCommentCountsError, true);
  assert.match(messages[0], /offline/);
});

test("comment media defers image and audio downloads", () => {
  const thread = { scrollHeight: 0, scrollTop: 0, clientHeight: 0 };
  const context = vm.createContext({
    notes: [{ id: "n", item_id: "item", author: "member@example.com", created_at: "2026-01-01",
      voice_path: "voice.webm", attachments: [{ type: "image/webp", path: "image.webp" },
        { type: "audio/webm", path: "audio.webm", name: "Audio" }] }],
    commentItem: "item", members: [], me: "member@example.com", isAdmin: false,
    $: () => thread, patchMarkup, threadItemId: id => id, nm: () => "Member", esc: String,
    canReplyToTaggedComment: () => false,
  });
  vm.runInContext(section("function renderCommentThread(", "function canReplyToTaggedComment("), context);
  context.renderCommentThread();
  assert.match(thread.innerHTML, /<img data-p="image.webp" loading="lazy"/);
  assert.equal((thread.innerHTML.match(/preload="none"/g) || []).length, 2);
});

test("background rendering preserves focused and unsaved checklist text", () => {
  const field = {
    nodeType: 1, tagName: "TEXTAREA", attributes: [], value: "My draft", defaultValue: "Original",
    hasAttribute: () => false, getAttribute: () => null, matches: () => true,
    selectionStart: 2, selectionEnd: 5,
  };
  const incoming = { attributes: [], value: "Remote text", hasAttribute: () => false, getAttribute: () => null };
  const context = vm.createContext({ document: { activeElement: field }, dirty: false, grow() {} });
  vm.runInContext(section("function renderKey(", "function busy("), context);
  context.patchNode(field, incoming);
  assert.equal(field.value, "My draft");
  assert.equal(field.selectionStart, 2);
  assert.equal(field.selectionEnd, 5);
  assert.equal(context.dirty, true);
  context.document.activeElement = null;
  context.patchNode(field, incoming);
  assert.equal(field.value, "My draft");
  context.patchNode(field, { ...incoming, value: "My draft" });
  assert.equal(field.defaultValue, "My draft");
  context.patchNode(field, incoming);
  assert.equal(field.value, "Remote text");
});

test("background rendering keeps the visible row in place when earlier rows change", () => {
  let position = 160;
  const anchor = { isConnected: true, getBoundingClientRect: () => ({ top: position, bottom: position + 40 }) };
  const element = {
    id: "main", scrollTop: 300, getBoundingClientRect: () => ({ top: 0, bottom: 400 }),
    querySelectorAll: () => [anchor],
  };
  const context = vm.createContext({
    document: { createElement: () => ({ content: {}, set innerHTML(_markup) {} }) },
    window: { innerHeight: 600 }, getComputedStyle: () => ({ overflowY: "auto" }),
  });
  vm.runInContext(section("function renderKey(", "function busy("), context);
  context.patchChildren = () => { position -= 60; };
  context.patchMarkup(element, "<div></div>");
  assert.equal(element.scrollTop, 240);
});

test("background rendering reuses existing rows when rows are inserted or removed", () => {
  const context = vm.createContext({ document: { activeElement: null } });
  vm.runInContext(section("function renderKey(", "function busy("), context);
  const row = id => ({
    nodeType: 1, tagName: "DIV", attributes: [], childNodes: [],
    hasAttribute: name => name === "data-item-row", getAttribute: () => id,
    matches: () => false, contains: () => false, cloneNode: () => row(id),
    get firstChild() { return null; },
    get nextSibling() { const i = this.parent.childNodes.indexOf(this); return this.parent.childNodes[i + 1] || null; },
  });
  const a = row("a"), b = row("b");
  const parent = {
    childNodes: [a, b], get firstChild() { return this.childNodes[0] || null; },
    insertBefore(node, before) {
      const old = this.childNodes.indexOf(node);
      if (old !== -1) this.childNodes.splice(old, 1);
      const i = before ? this.childNodes.indexOf(before) : this.childNodes.length;
      this.childNodes.splice(i, 0, node); node.parent = this;
    },
    removeChild(node) { this.childNodes.splice(this.childNodes.indexOf(node), 1); },
  };
  a.parent = parent; b.parent = parent;
  context.patchChildren(parent, { childNodes: [row("new"), row("b")] });
  assert.equal(parent.childNodes.length, 2);
  assert.equal(parent.childNodes[0].getAttribute("data-item-row"), "new");
  assert.equal(parent.childNodes[1], b);
});
