async function migrateTrackerMediaToBackblaze({
  sb, bucket, allRows, isAdmin, onProgress = () => {}, fetchImpl = fetch,
}) {
  if (!isAdmin) throw new Error("Only tracker admins can migrate media");
  if (!sb || typeof allRows !== "function") throw new Error("Tracker migration is not configured");

  const storage = sb.storage.from(bucket);
  const paths = [];
  async function listFolder(prefix = "") {
    let offset = 0;
    while (true) {
      const { data, error } = await storage.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Couldn’t list ${prefix || "Storage"}: ${error.message}`);
      for (const entry of data || []) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id == null) await listFolder(path);
        else paths.push(path);
      }
      if (!data || data.length < 100) break;
      offset += data.length;
    }
  }
  await listFolder();

  let copied = 0, alreadyPresent = 0;
  async function sha256(blob) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    onProgress({ stage: "copy", completed: index, total: paths.length, path });
    const { data: blob, error } = await storage.download(path);
    if (error) throw new Error(`Couldn’t download ${path}: ${error.message}`);
    if (!blob) throw new Error(`Storage returned no file for ${path}`);
    const contentType = (blob.type || "application/octet-stream").split(";")[0];
    const checksum = await sha256(blob);
    const { data, error: signError } = await sb.functions.invoke("tracker-media", {
      body: { action: "sign-migration-upload", path, contentType, size: blob.size, sha256: checksum },
    });
    if (signError) throw new Error(`Couldn’t prepare ${path} for Backblaze: ${signError.message}`);
    if (data?.exists) {
      if (data.size !== blob.size) throw new Error(`An existing Backblaze copy of ${path} has a different size`);
      alreadyPresent++;
      continue;
    }
    if (typeof data?.url !== "string") throw new Error(`Backblaze returned no upload URL for ${path}`);
    const response = await fetchImpl(data.url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "x-amz-meta-sourcesha256": checksum,
      },
      body: blob,
    });
    if (!response.ok) throw new Error(`Couldn’t copy ${path} to Backblaze (HTTP ${response.status})`);
    copied++;
  }

  const { data: pages, error: pagesError } = await allRows(count => sb.from("pages")
    .select("id,image_path", count ? { count: "exact" } : undefined).order("id"));
  if (pagesError) throw pagesError;
  const { data: notes, error: notesError } = await allRows(count => sb.from("notes")
    .select("id,voice_path,attachments", count ? { count: "exact" } : undefined).order("id"));
  if (notesError) throw notesError;
  const copiedPaths = new Set(paths);
  for (const page of pages || []) {
    if (page.image_path && !page.image_path.startsWith("b2:") && !copiedPaths.has(page.image_path)) {
      throw new Error(`Referenced page image is missing from Storage: ${page.image_path}`);
    }
  }
  for (const note of notes || []) {
    const referenced = [note.voice_path, ...(Array.isArray(note.attachments) ? note.attachments.map(item => item?.path) : [])];
    for (const path of referenced) {
      if (path && !path.startsWith("b2:") && !copiedPaths.has(path)) {
        throw new Error(`Referenced comment media is missing from Storage: ${path}`);
      }
    }
  }

  let updated = 0;
  for (let index = 0; index < (pages || []).length; index++) {
    const page = pages[index];
    onProgress({ stage: "references", completed: index, total: pages.length + (notes || []).length });
    const path = page.image_path;
    if (!path || path.startsWith("b2:")) continue;
    const { data, error } = await sb.from("pages").update({ image_path: `b2:${path}` })
      .eq("id", page.id).eq("image_path", path).select("id").maybeSingle();
    if (error) throw new Error(`Couldn’t update page ${page.id}: ${error.message}`);
    if (!data) throw new Error(`Page ${page.id} changed during migration; its original remains in Supabase`);
    updated++;
  }
  for (let index = 0; index < (notes || []).length; index++) {
    const note = notes[index];
    onProgress({ stage: "references", completed: (pages || []).length + index, total: pages.length + notes.length });
    const originalVoice = note.voice_path;
    const originalAttachments = Array.isArray(note.attachments) ? note.attachments : [];
    const voicePath = originalVoice && !originalVoice.startsWith("b2:") ? `b2:${originalVoice}` : originalVoice;
    const attachments = originalAttachments.map(attachment =>
      attachment?.path && !attachment.path.startsWith("b2:")
        ? { ...attachment, path: `b2:${attachment.path}` }
        : attachment);
    if (voicePath === originalVoice &&
        JSON.stringify(attachments) === JSON.stringify(originalAttachments)) continue;
    let query = sb.from("notes").update({ voice_path: voicePath, attachments }).eq("id", note.id);
    query = originalVoice == null ? query.is("voice_path", null) : query.eq("voice_path", originalVoice);
    query = query.eq("attachments", JSON.stringify(originalAttachments));
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(`Couldn’t update comment ${note.id}: ${error.message}`);
    if (!data) throw new Error(`Comment ${note.id} changed during migration; its originals remain in Supabase`);
    updated++;
  }
  onProgress({ stage: "complete", completed: paths.length, total: paths.length, copied, alreadyPresent, updated });
  return { files: paths.length, copied, alreadyPresent, updated };
}

if (typeof window !== "undefined") window.migrateTrackerMediaToBackblaze = migrateTrackerMediaToBackblaze;
if (typeof module !== "undefined") module.exports = { migrateTrackerMediaToBackblaze };
