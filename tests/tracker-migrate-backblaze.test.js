const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateTrackerMediaToBackblaze } = require("../scripts/tracker-migrate-backblaze.js");

function migrationFixture({ missing = false, functionError = null } = {}) {
  const uploaded = [], updates = [], deleted = [];
  const tree = {
    "": [{ id: null, name: "pages" }, { id: null, name: "notes" }, { id: null, name: "voice" },
      { id: "orphan", name: "unused.wav" }],
    pages: [{ id: null, name: "p1" }],
    "pages/p1": [{ id: "image", name: "image.webp" }],
    notes: [{ id: null, name: "p1" }],
    "notes/p1": [{ id: "comment", name: "comment.webp" }],
    voice: [{ id: "voice", name: "v1.wav" }],
  };
  const storage = {
    list: async prefix => ({ data: tree[prefix] || [], error: null }),
    download: async path => ({ data: new Blob([path], { type: path.endsWith(".wav") ? "audio/wav" : "image/webp" }), error: null }),
  };
  const sb = {
    storage: { from: () => storage },
    functions: { invoke: async (_name, { body }) => {
      uploaded.push(body);
      return functionError
        ? { data: null, error: functionError }
        : { data: { url: "https://signed.test/" + body.path, exists: false }, error: null };
    } },
    from: table => ({
      select: () => ({ table, order() { return this; } }),
      update: values => {
        const conditions = [];
        return {
          eq(key, value) { conditions.push([key, value]); return this; },
          is(key, value) { conditions.push([key, value]); return this; },
          select() { return this; },
          async maybeSingle() { updates.push({ table, values, conditions }); return { data: { id: "updated" }, error: null }; },
        };
      },
    }),
  };
  const rows = {
    pages: [{ id: "p1", image_path: missing ? "pages/p1/missing.webp" : "pages/p1/image.webp" }],
    notes: [{ id: "n1", voice_path: "voice/v1.wav", attachments: [{ path: "notes/p1/comment.webp", name: "comment.webp" }] }],
  };
  const allRows = async query => ({ data: rows[query(true).table], error: null });
  return { sb, uploaded, updates, deleted, allRows, fetchImpl: async (url, options) => {
    deleted.push({ url, options }); return { ok: true };
  } };
}

test("migration copies nested and orphaned files before switching database references", async () => {
  const fixture = migrationFixture();
  const result = await migrateTrackerMediaToBackblaze({
    ...fixture, bucket: "tracker-files", isAdmin: true,
  });
  assert.deepEqual(fixture.uploaded.map(body => body.path), ["pages/p1/image.webp", "notes/p1/comment.webp", "voice/v1.wav", "unused.wav"]);
  assert.ok(fixture.uploaded.every(body => body.action === "sign-migration-upload" && /^[A-Za-z0-9+/]{43}=$/.test(body.sha256)));
  assert.equal(fixture.deleted.length, 4);
  assert.ok(fixture.deleted.every(entry => entry.options.method === "PUT"));
  assert.ok(fixture.deleted.every(entry => entry.options.headers["x-amz-meta-sourcesha256"]));
  assert.equal(result.files, 4);
  assert.equal(result.copied, 4);
  assert.equal(result.updated, 2);
  assert.deepEqual(fixture.updates.map(update => update.values.image_path || update.values.attachments?.[0]?.path), [
    "b2:pages/p1/image.webp", "b2:notes/p1/comment.webp",
  ]);
  assert.equal(fixture.updates[1].values.voice_path, "b2:voice/v1.wav");
});

test("migration refuses to switch references if a referenced source file is missing", async () => {
  const fixture = migrationFixture({ missing: true });
  await assert.rejects(migrateTrackerMediaToBackblaze({
    ...fixture, bucket: "tracker-files", isAdmin: true,
  }), /missing from Storage/);
  assert.equal(fixture.updates.length, 0);
});

test("migration requires an admin", async () => {
  await assert.rejects(migrateTrackerMediaToBackblaze({ isAdmin: false }), /Only tracker admins/);
});

test("migration displays the safe error returned by the Edge Function", async () => {
  const fixture = migrationFixture({
    functionError: {
      message: "Edge Function returned a non-2xx status code",
      context: { clone: () => ({ json: async () => ({ error: "B2 access denied" }) }) },
    },
  });
  await assert.rejects(migrateTrackerMediaToBackblaze({
    ...fixture, bucket: "tracker-files", isAdmin: true,
  }), /B2 access denied/);
});
