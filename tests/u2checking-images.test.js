const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "u2checking.html"), "utf8");
const source = html.slice(html.indexOf("async function isAnimatedImage("), html.indexOf("async function shrink("));
const context = vm.createContext({ Uint8Array, DataView });
vm.runInContext(source, context);

test("GIF detection distinguishes still and animated images", async () => {
  const still = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const image = still.indexOf(0x2c);
  const animated = Buffer.concat([still.subarray(0, -1), still.subarray(image, -1), Buffer.from([0x3b])]);
  assert.equal(await context.isAnimatedImage(new Blob([still], { type: "image/gif" })), false);
  assert.equal(await context.isAnimatedImage(new Blob([animated], { type: "image/gif" })), true);
});

test("APNG and animated WebP are detected without treating still images as animated", async () => {
  const png = Buffer.from("89504e470d0a1a0a000000006163544c00000000", "hex");
  const stillPng = Buffer.from("89504e470d0a1a0a000000004944415400000000", "hex");
  const webp = Buffer.from("524946461600000057454250565038580a00000002000000000000000000", "hex");
  const stillWebp = Buffer.from(webp);
  stillWebp[20] = 0;
  assert.equal(await context.isAnimatedImage(new Blob([png], { type: "image/png" })), true);
  assert.equal(await context.isAnimatedImage(new Blob([png], { type: "image/apng" })), true);
  assert.equal(await context.isAnimatedImage(new Blob([stillPng], { type: "image/png" })), false);
  assert.equal(await context.isAnimatedImage(new Blob([webp], { type: "image/webp" })), true);
  assert.equal(await context.isAnimatedImage(new Blob([stillWebp], { type: "image/webp" })), false);
});

test("animated AVIF and potentially animated vector formats are preserved", async () => {
  const still = Buffer.from("0000001466747970617669660000000061766966", "hex");
  const animated = Buffer.from("0000001466747970617669660000000061766973", "hex");
  assert.equal(await context.isAnimatedImage(new Blob([still], { type: "image/avif" })), false);
  assert.equal(await context.isAnimatedImage(new Blob([animated], { type: "image/avif" })), true);
  assert.equal(await context.isAnimatedImage(new Blob(["<svg/>"], { type: "image/svg+xml" })), true);
});

test("corrupt supported image formats fail instead of silently bypassing optimization", async () => {
  await assert.rejects(context.isAnimatedImage(new Blob(["bad"], { type: "image/gif" })), /invalid or incomplete/);
  await assert.rejects(context.isAnimatedImage(new Blob(["bad"], { type: "image/png" })), /invalid or incomplete/);
});

test("new screenshots are resized to 1000 pixels and encoded at the requested quality", async () => {
  let encoded;
  const canvas = {
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback, type, quality) => { encoded = { type, quality }; callback({ type, size: 20 }); },
  };
  class Image {
    constructor() { this.naturalWidth = 2400; this.naturalHeight = 1200; }
    set src(_url) { this.onload(); }
  }
  const ctx = vm.createContext({
    isAnimatedImage: async () => false, Image,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    document: { createElement: () => canvas },
  });
  vm.runInContext(html.slice(html.indexOf("async function shrink("), html.indexOf("function imageExtension(")), ctx);
  const result = await ctx.shrink({ type: "image/jpeg", size: 1000 });
  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 500);
  assert.deepEqual(encoded, { type: "image/webp", quality: 0.68 });
  assert.equal(result.type, "image/webp");
});

test("new uploads use long-lived cache control and unique paths are not overwritten", async () => {
  let options;
  const ctx = vm.createContext({
    B: "tracker-files",
    sb: { storage: { from: () => ({ upload: async (_path, _blob, settings) => { options = settings; return { error: null }; } }) } },
  });
  vm.runInContext(html.slice(html.indexOf("async function up("), html.indexOf("async function rmFiles(")), ctx);
  await ctx.up("pages/new.webp", { type: "image/webp" });
  assert.equal(options.cacheControl, "31536000");
  assert.equal(options.upsert, false);
});

test("re-rendering media reuses the unexpired signed URL", async () => {
  let requests = 0;
  const attributes = {};
  const image = {
    dataset: { p: "pages/image.webp" }, isConnected: true, tagName: "IMG",
    getAttribute: name => attributes[name], setAttribute: (name, value) => { attributes[name] = value; },
  };
  const ctx = vm.createContext({
    B: "tracker-files", urlC: {}, urlPending: new Map(),
    document: { querySelectorAll: () => [image] },
    sb: { storage: { from: () => ({ createSignedUrls: async paths => {
      requests++; return { data: paths.map(path => ({ path, signedUrl: "https://example.test/signed" })), error: null };
    } }) } },
    toast: message => { throw new Error(message); },
  });
  vm.runInContext(html.slice(html.indexOf("async function hydrate("), html.indexOf("async function up(")), ctx);
  await ctx.hydrate();
  await ctx.hydrate();
  assert.equal(requests, 1);
  assert.equal(attributes.src, "https://example.test/signed");
});
