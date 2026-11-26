const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
function section(start, end) {
  return html.slice(html.indexOf(start), html.indexOf(end));
}

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
    $: id => elements[id],
    pages: [{ id: "1", label: "<Page>", image_path: null }], cur: "1",
    matchingPages: () => [{ id: "1", label: "<Page>", image_path: null }],
    stat: () => ({ d: 1, n: 2, pc: 50 }),
    esc: value => String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]),
  });
  vm.runInContext(section("function renderGallery(", "const commentIcon="), context);
  context.renderGallery();
  assert.match(elements.galleryGrid.innerHTML, /aria-current="page"/);
  assert.match(elements.galleryGrid.innerHTML, /&lt;Page&gt;/);
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
