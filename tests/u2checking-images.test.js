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
