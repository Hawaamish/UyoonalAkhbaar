const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { optimizeTrackerMedia } = require("../scripts/tracker-optimize-media.js");

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

test("page thumbnails use stable sibling paths and can fall back for unsupported images", () => {
  const context = vm.createContext({ thumbnailUnavailable: new Set() });
  vm.runInContext(html.slice(html.indexOf("function pageThumbnailStoragePath("), html.indexOf("async function makePageThumbnail(")), context);
  assert.equal(context.pageThumbnailPath("pages/p1/image.webp"), "pages/p1/image.webp.thumb-240-v1");
  assert.equal(context.pageThumbnailPath("b2:pages/p1/image.jpg"), "b2:pages/p1/image.jpg.thumb-240-v1");
  assert.equal(context.pageThumbnailPath("pages/p1/image.svg"), "pages/p1/image.svg");
  context.thumbnailUnavailable.add("pages/p1/image.webp");
  assert.equal(context.pageThumbnailPath("pages/p1/image.webp"), "pages/p1/image.webp");
});

test("existing page thumbnails are created only when their preview approaches the viewport", async () => {
  let observer, repairs = 0, signed = 0;
  class IntersectionObserver {
    constructor(callback, options) { observer = this; this.callback = callback; this.options = options; this.targets = new Set(); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
  }
  const image = {
    tagName: "IMG", dataset: { p: "pages/p1/image.webp.thumb-240-v1", original: "pages/p1/image.webp" },
    isConnected: true, getAttribute: () => null, setAttribute() {}, addEventListener() {},
  };
  const context = vm.createContext({
    IntersectionObserver, thumbnailObserver: null, thumbnailFallbackInstalled: false, urlC: {},
    document: { querySelectorAll: () => [image] },
    loadedImage: () => false,
    getCachedImage: async () => null, watchImageCache() {},
    repairPageThumbnail: () => { repairs++; },
    signMediaPaths: async () => { signed++; },
  });
  vm.runInContext(html.slice(html.indexOf("function pageThumbnailNearViewport("), html.indexOf("async function hydrate(")), context);
  vm.runInContext(html.slice(html.indexOf("async function hydrate("), html.indexOf("async function up(")), context);
  await context.hydrate();
  assert.equal(observer.targets.has(image), true);
  assert.equal(observer.options.rootMargin, "200px");
  assert.equal(repairs, 0);
  assert.equal(signed, 0);
  observer.callback([{ target: image, isIntersecting: true }]);
  assert.equal(repairs, 1);
});

test("page thumbnails are resized to 240 pixels and encoded as WebP", async () => {
  let encoded, revoked;
  const canvas = {
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback, type, quality) => {
      encoded = { type, quality };
      callback(new Blob(["thumb"], { type: "image/webp" }));
    },
  };
  class Image {
    constructor() { this.naturalWidth = 1200; this.naturalHeight = 600; }
    set src(_url) { this.onload(); }
  }
  const context = vm.createContext({
    Image, URL: { createObjectURL: () => "blob:source", revokeObjectURL: url => { revoked = url; } },
    document: { createElement: () => canvas },
  });
  vm.runInContext(html.slice(html.indexOf("async function makePageThumbnail("), html.indexOf("async function fetchImageBlob(")), context);
  const result = await context.makePageThumbnail({ type: "image/jpeg" });
  assert.equal(canvas.width, 240);
  assert.equal(canvas.height, 120);
  assert.deepEqual(encoded, { type: "image/webp", quality: 0.62 });
  assert.equal(result.type, "image/webp");
  assert.equal(revoked, "blob:source");
});

test("the first missing page thumbnail is generated from the source and uploaded once", async () => {
  const uploaded = [], messages = [], source = "b2:pages/p1/image.webp", thumbPath = source + ".thumb-240-v1";
  const urls = { [thumbPath]: "https://signed.test/thumb", [source]: "https://signed.test/source" };
  const context = vm.createContext({
    B2_PREFIX: "b2:", imageCacheUser: "user-1", imageBlobCache: new Map(), imageObjectUrls: new Map(),
    thumbnailPending: new Map(), thumbnailUnavailable: new Set(), thumbnailWarningShown: false, urlC: {},
    pageThumbnailStoragePath: path => path + ".thumb-240-v1",
    getCachedImage: async () => null,
    optionalCachedImage: async () => null,
    signMediaPaths: async paths => paths.forEach(path => { context.urlC[path] = { u: urls[path], t: Date.now() + 1000 }; }),
    fetch: async url => url === urls[thumbPath]
      ? { ok: false, status: 404 }
      : { ok: true, status: 200, blob: async () => new Blob(["source"], { type: "image/webp" }) },
    fetchImageBlob: async () => new Blob(["source"], { type: "image/webp" }),
    makePageThumbnail: async () => new Blob(["thumbnail"], { type: "image/webp" }),
    uploadThumbnail: async (path, blob) => uploaded.push({ path, blob }),
    cacheImage: async () => {},
    optionalCacheImage: async () => {},
    cachedImageUrl: path => "blob:" + path,
    URL: { createObjectURL: () => "blob:image", revokeObjectURL() {} },
    toast: message => messages.push(message),
  });
  vm.runInContext(html.slice(html.indexOf("async function pageThumbnailBlob("), html.indexOf("async function addItems(")), context);
  const image = {
    dataset: { original: source }, isConnected: true,
    setAttribute(name, value) { this[name] = value; },
  };
  await context.repairPageThumbnail(image);
  assert.equal(uploaded.length, 1, messages.join("; "));
  assert.equal(uploaded[0].path, thumbPath);
  assert.equal(image.src, "blob:" + thumbPath);
  assert.equal(context.thumbnailUnavailable.has(source), false);
});

test("new page image uploads include the thumbnail beside the full image", async () => {
  const uploads = [];
  const context = vm.createContext({
    uuid: () => "image-id", imageExtension: () => "webp", thumbnailUnavailable: new Set(),
    pageThumbnailStoragePath: path => path + ".thumb-240-v1",
    up: async (path, blob, type) => { uploads.push({ path, blob, type }); return "b2:" + path; },
    makePageThumbnail: async () => new Blob(["small"], { type: "image/webp" }),
    optionalCacheImage: async () => {},
    rmFiles: async () => {},
  });
  vm.runInContext(html.slice(html.indexOf("async function uploadPageImage("), html.indexOf("async function addItems(")), context);
  const result = await context.uploadPageImage("p1", { type: "image/webp", size: 100 });
  assert.equal(result, "b2:pages/p1/image-id.webp");
  assert.deepEqual(uploads.map(upload => upload.path), [
    "pages/p1/image-id.webp", "pages/p1/image-id.webp.thumb-240-v1",
  ]);
});

test("local image cache persists by signed-in user across reloads", async () => {
  const records = new Map(), storeName = "images";
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: name => name === storeName },
          createObjectStore() {},
          transaction() {
            const transaction = {
              objectStore() {
                return {
                  get: id => {
                    const item = {};
                    queueMicrotask(() => { item.result = records.get(id); item.onsuccess?.(); });
                    return item;
                  },
                  getAll: () => {
                    const item = {};
                    queueMicrotask(() => {
                      item.result = [...records.values()];
                      item.onsuccess?.();
                      queueMicrotask(() => transaction.oncomplete?.());
                    });
                    return item;
                  },
                  put: entry => records.set(entry.id, entry),
                  delete: id => records.delete(id),
                };
              },
            };
            return transaction;
          },
        };
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  let downloadRequests = 0;
  const createContext = () => {
    const attributes = {}, image = {
      tagName: "IMG", dataset: { p: "pages/p1/image.webp" }, isConnected: true,
      getAttribute: name => attributes[name], setAttribute: (name, value) => { attributes[name] = value; },
      addEventListener() {},
    };
    const context = vm.createContext({
      indexedDB, Date, URL: { createObjectURL: () => "blob:cached", revokeObjectURL() {} },
      SUPABASE_URL: "https://example.test", B: "tracker-files", B2_PREFIX: "b2:",
      urlC: {}, urlPending: new Map(), document: { querySelectorAll: () => [image] },
      sb: { storage: { from: () => ({ createSignedUrls: async () => {
        downloadRequests++; return { data: [], error: null };
      } }) } },
      toast() {},
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console,
    });
    vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("async function up(")), context);
    return { context, image };
  };
  const blob = new Blob(["image-bytes"], { type: "image/webp" });
  const first = createContext();
  first.context.restoreMediaUrls("user-1");
  await first.context.cacheImage("pages/p1/image.webp", blob);
  const reloaded = createContext();
  reloaded.context.restoreMediaUrls("user-1");
  assert.equal(await reloaded.context.getCachedImage("pages/p1/image.webp"), blob);
  await reloaded.context.hydrate();
  assert.equal(reloaded.image.getAttribute("src"), "blob:cached");
  assert.equal(downloadRequests, 0);
  reloaded.context.restoreMediaUrls("user-2");
  assert.equal(await reloaded.context.getCachedImage("pages/p1/image.webp"), null);
});

test("new media uploads use short-lived authorized Backblaze upload URLs", async () => {
  let call, request;
  const ctx = vm.createContext({
    B2_PREFIX: "b2:",
    sb: { functions: { invoke: async (name, options) => {
      call = { name, options }; return { data: { url: "https://s3.us-west-004.backblazeb2.com/upload" }, error: null };
    } } },
    fetch: async (url, options) => { request = { url, options }; return { ok: true }; },
  });
  vm.runInContext(html.slice(html.indexOf("async function up("), html.indexOf("async function rmFiles(")), ctx);
  const result = await ctx.up("pages/new.webp", { type: "image/webp", size: 20 }, "image/webp");
  assert.equal(call.name, "tracker-media");
  assert.deepEqual(JSON.parse(JSON.stringify(call.options.body)), {
    action: "sign-upload", path: "pages/new.webp", contentType: "image/webp", size: 20,
  });
  assert.equal(request.url, "https://s3.us-west-004.backblazeb2.com/upload");
  assert.equal(request.options.method, "PUT");
  assert.equal(request.options.headers["Cache-Control"], "private, max-age=31536000, immutable");
  assert.equal(result, "b2:pages/new.webp");
});

test("re-rendering media reuses the unexpired signed URL", async () => {
  let requests = 0;
  const attributes = {};
  const image = {
    dataset: { p: "pages/image.webp" }, isConnected: true, tagName: "IMG",
    getAttribute: name => attributes[name], setAttribute: (name, value) => { attributes[name] = value; },
  };
  const ctx = vm.createContext({
    B: "tracker-files", B2_PREFIX: "b2:", urlC: {}, urlPending: new Map(),
    document: { querySelectorAll: () => [image] },
    sb: { storage: { from: () => ({ createSignedUrls: async paths => {
      requests++; return { data: paths.map(path => ({ path, signedUrl: "https://example.test/signed" })), error: null };
    } }) } },
    toast: message => { throw new Error(message); },
  });
  vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("async function up(")), ctx);
  await ctx.hydrate();
  await ctx.hydrate();
  assert.equal(requests, 1);
  assert.equal(attributes.src, "https://example.test/signed");
});

test("Backblaze media uses signed URLs and reuses them on redraw", async () => {
  let requests = 0;
  const attributes = {};
  const image = {
    dataset: { p: "b2:pages/image.webp" }, isConnected: true, tagName: "IMG",
    getAttribute: name => attributes[name], setAttribute: (name, value) => { attributes[name] = value; },
  };
  const ctx = vm.createContext({
    B2_PREFIX: "b2:", urlC: {}, urlPending: new Map(), Date,
    loadedImage: element => element.tagName === "IMG" && element.complete && element.naturalWidth > 0 && element.getAttribute("src"),
    document: { querySelectorAll: () => [image] },
    sb: { functions: { invoke: async (name, options) => {
      requests++;
      assert.equal(name, "tracker-media");
      assert.deepEqual(JSON.parse(JSON.stringify(options.body)), { action: "sign-download", paths: ["pages/image.webp"] });
      return { data: { urls: [{ path: "pages/image.webp", url: "https://s3.us-west-004.backblazeb2.com/bucket/pages/image.webp?signature=x" }] }, error: null };
    } } },
    saveMediaUrls() {},
    toast: message => { throw new Error(message); },
  });
  vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("async function up(")), ctx);
  await ctx.hydrate();
  await ctx.hydrate();
  assert.equal(requests, 1);
  assert.equal(attributes.src, "https://s3.us-west-004.backblazeb2.com/bucket/pages/image.webp?signature=x");
});

test("cached Backblaze URLs must match the Backblaze host and object key", () => {
  const saved = new Map([["tracker-media-urls:user-1", JSON.stringify({
    "b2:pages/ok.webp": { u: "https://s3.us-west-004.backblazeb2.com/bucket/pages/ok.webp?sig=x", t: Date.now() + 10000 },
    "b2:pages/wrong.webp": { u: "https://s3.us-west-004.backblazeb2.com/bucket/pages/other.webp?sig=x", t: Date.now() + 10000 },
    "b2:pages/evil.webp": { u: "https://evil.example/bucket/pages/evil.webp?sig=x", t: Date.now() + 10000 },
  })]]);
  const ctx = vm.createContext({
    SUPABASE_URL: "https://example.test", B: "tracker-files", B2_PREFIX: "b2:",
    urlC: {}, urlPending: new Map(), sessionStorage: {
      getItem: key => saved.get(key), setItem() {}, removeItem() {},
    }, console, URL,
  });
  vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("function saveMediaUrls()")), ctx);
  ctx.restoreMediaUrls("user-1");
  assert.deepEqual(Object.keys(ctx.urlC), ["b2:pages/ok.webp"]);
});

test("cleanup deletes Backblaze paths through the function and legacy paths through Supabase", async () => {
  const calls = [];
  const ctx = vm.createContext({
    B: "tracker-files", B2_PREFIX: "b2:",
    sb: {
      functions: { invoke: async (name, options) => { calls.push([name, options.body]); return { error: null }; } },
      storage: { from: bucket => ({ remove: async paths => {
        calls.push([bucket, paths]); return { error: null };
      } }) },
    },
  });
  vm.runInContext(html.slice(html.indexOf("async function rmFiles("), html.indexOf("const notePaths=")), ctx);
  await ctx.rmFiles(["b2:pages/one.webp", "pages/old.webp", "b2:notes/two.wav"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["tracker-media", { action: "delete", paths: ["pages/one.webp", "notes/two.wav"] }],
    ["tracker-files", ["pages/old.webp"]],
  ]);
});

test("media URLs survive a reload in the same tab but stay scoped to the signed-in user", async () => {
  const saved = new Map(), storage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key),
  };
  const base = "https://example.test", signed = base + "/storage/v1/object/sign/tracker-files/pages/image.webp?token=test";
  let requests = 0;
  const createContext = image => {
    const ctx = vm.createContext({
      SUPABASE_URL: base, B: "tracker-files", B2_PREFIX: "b2:", urlC: {}, urlPending: new Map(), sessionStorage: storage, console, URL,
      document: { querySelectorAll: () => [image] },
      sb: { storage: { from: () => ({ createSignedUrls: async paths => {
        requests++; return { data: paths.map(path => ({ path, signedUrl: signed })), error: null };
      } }) } },
      toast: message => { throw new Error(message); },
    });
    vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("async function up(")), ctx);
    return ctx;
  };
  const image = () => {
    const attrs = {};
    return { dataset: { p: "pages/image.webp" }, isConnected: true, tagName: "IMG",
      getAttribute: name => attrs[name], setAttribute: (name, value) => { attrs[name] = value; } };
  };
  const first = createContext(image());
  first.restoreMediaUrls("user-1");
  await first.hydrate();
  const reloaded = createContext(image());
  reloaded.restoreMediaUrls("user-1");
  await reloaded.hydrate();
  assert.equal(requests, 1);
  const other = createContext(image());
  other.restoreMediaUrls("user-2");
  await other.hydrate();
  assert.equal(requests, 2);
  reloaded.clearMediaUrls();
  assert.equal(saved.has("tracker-media-urls:user-1"), false);
  saved.set("tracker-media-urls:user-1", JSON.stringify({
    expired: { u: signed, t: 0 },
    untrusted: { u: "https://other.example/image", t: Date.now() + 3000000 },
  }));
  const invalid = createContext(image());
  invalid.restoreMediaUrls("user-1");
  assert.equal(Object.keys(invalid.urlC).length, 0);
});

test("expired cached URLs are not reused, but loaded images are not replaced during redraw", async () => {
  const old = "https://example.test/old", fresh = "https://example.test/new";
  const attrs = { src: old };
  const loaded = { dataset: { p: "page.webp" }, isConnected: true, tagName: "IMG", complete: true, naturalWidth: 100,
    getAttribute: name => attrs[name], setAttribute: (name, value) => { attrs[name] = value; } };
  const newAttrs = {};
  const unloaded = { dataset: { p: "page.webp" }, isConnected: true, tagName: "IMG",
    getAttribute: name => newAttrs[name], setAttribute: (name, value) => { newAttrs[name] = value; } };
  let requests = 0, elements = [loaded];
  const ctx = vm.createContext({
    B: "tracker-files", B2_PREFIX: "b2:", urlC: { "page.webp": { u: old, t: 0 } }, urlPending: new Map(),
    document: { querySelectorAll: () => elements },
    sb: { storage: { from: () => ({ createSignedUrls: async paths => {
      requests++; return { data: paths.map(path => ({ path, signedUrl: fresh })), error: null };
    } }) } },
    toast: message => { throw new Error(message); },
  });
  vm.runInContext(html.slice(html.indexOf("let mediaCacheKey="), html.indexOf("async function up(")), ctx);
  await ctx.hydrate();
  assert.equal(requests, 0);
  elements = [loaded, unloaded];
  await ctx.hydrate();
  assert.equal(requests, 1);
  assert.equal(attrs.src, old);
  assert.equal(newAttrs.src, fresh);
});

test("print media is removed after printing so redraws cannot reload it", () => {
  const handlers = {}, printArea = { innerHTML: "printed images" };
  const ctx = vm.createContext({
    window: { addEventListener: (event, handler) => { handlers[event] = handler; } },
    $: () => printArea,
  });
  vm.runInContext(html.slice(html.indexOf("window.addEventListener(\"afterprint\""), html.indexOf('$("printAll").onclick=')), ctx);
  handlers.afterprint();
  assert.equal(printArea.innerHTML, "");
});

test("existing image optimization preserves original paths and conditionally updates references", async () => {
  const updates = [], uploads = [];
  const tables = {
    pages: [{ id: "p1", image_path: "pages/p1/original.jpg" }],
    notes: [{ id: "n1", attachments: [{ path: "notes/p1/original.png", type: "image/png", name: "original.png" }] }],
  };
  const sb = {
    storage: { from: () => ({
      download: async () => ({ data: new Blob(["0123456789"], { type: "application/octet-stream" }), error: null }),
      upload: async (name, blob, options) => { uploads.push({ name, blob, options }); return { error: null }; },
    }) },
    from: table => ({
      select: () => ({ table, order() { return this; } }),
      update: values => {
        const conditions = [];
        return { eq(key, value) { conditions.push([key, value]); return this; },
          select() { return this; },
          async maybeSingle() { updates.push({ table, values, conditions }); return { data: { id: "ok" }, error: null }; } };
      },
    }),
  };
  const result = await optimizeTrackerMedia({
    sb, bucket: "tracker-files", isAdmin: true, uuid: () => "new",
    shrink: async (_blob, max) => { assert.equal(max, Infinity); return new Blob(["123"], { type: "image/webp" }); },
    imageExtension: () => "webp",
    allRows: async query => ({ data: tables[query(true).table], error: null }),
  });
  assert.equal(result.pages, 1);
  assert.equal(result.attachments, 1);
  assert.equal(result.originalBytes, 20);
  assert.equal(result.optimizedBytes, 6);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].options.upsert, false);
  assert.deepEqual(updates[0].conditions, [["id", "p1"], ["image_path", "pages/p1/original.jpg"]]);
  assert.match(updates[0].values.image_path, /^pages\/p1\/optimized-v1-b3JpZ2luYWwuanBn\.new\.webp$/);
  assert.equal(updates[1].values.attachments[0].original_path, "notes/p1/original.png");
  assert.equal(updates[1].conditions[1][1], JSON.stringify(tables.notes[0].attachments));
});

test("existing media optimization skips larger copies and stops on concurrent edits", async () => {
  let uploads = 0, updates = 0;
  const sb = {
    storage: { from: () => ({
      download: async () => ({ data: new Blob(["small"], { type: "image/jpeg" }), error: null }),
      upload: async () => { uploads++; return { error: null }; },
    }) },
    from: () => ({
      select: () => ({ order() { return this; } }),
      update: () => ({ eq() { return this; }, select() { return this; },
        async maybeSingle() { updates++; return { data: null, error: null }; } }),
    }),
  };
  const options = {
    sb, bucket: "tracker-files", isAdmin: true, uuid: () => "new", imageExtension: () => "webp",
    allRows: async query => { query(true); return { data: [{ id: "p1", image_path: "pages/p1/image.jpg" }], error: null }; },
  };
  await assert.rejects(optimizeTrackerMedia({ ...options, isAdmin: false }), /Only tracker admins/);
  const skipped = await optimizeTrackerMedia({ ...options, shrink: async () => new Blob(["not smaller"], { type: "image/webp" }) });
  assert.equal(skipped.skipped, 1);
  assert.equal(uploads, 0);
  await assert.rejects(optimizeTrackerMedia({ ...options, shrink: async () => new Blob(["x"], { type: "image/webp" }) }), /changed during optimization/);
  assert.equal(uploads, 1);
  assert.equal(updates, 1);
});
