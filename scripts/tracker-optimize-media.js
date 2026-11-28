async function optimizeTrackerMedia({ sb, bucket, shrink, uuid, imageExtension, allRows, isAdmin, onProgress = () => {} }) {
  if (!isAdmin) throw new Error("Only tracker admins can optimize existing media");
  const { data: pages, error: pageError } = await allRows(count => sb.from("pages")
    .select("id,image_path", count ? { count: "exact" } : undefined).order("id"));
  if (pageError) throw pageError;
  const { data: notes, error: noteError } = await allRows(count => sb.from("notes")
    .select("id,attachments", count ? { count: "exact" } : undefined).order("id"));
  if (noteError) throw noteError;

  const result = { pages: 0, attachments: 0, skipped: 0, originalBytes: 0, optimizedBytes: 0 };
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", heic: "image/heic",
    heif: "image/heif", jxl: "image/jxl" };
  async function createCopy(path, declaredType) {
    const { data: blob, error } = await sb.storage.from(bucket).download(path);
    if (error) throw error;
    if (!blob) throw new Error("Storage returned no file");
    const ext = path.split(".").pop().toLowerCase();
    const type = (declaredType || (blob.type.startsWith("image/") ? blob.type : types[ext]) || "").split(";")[0].toLowerCase();
    if (!type.startsWith("image/")) throw new Error("Unknown image type for " + path);
    const source = blob.type === type ? blob : new Blob([blob], { type });
    const smaller = await shrink(source, Infinity);
    if (smaller.size >= source.size) { result.skipped++; return null; }
    const slash = path.lastIndexOf("/"), dir = path.slice(0, slash), name = path.slice(slash + 1);
    const encodedName = btoa(Array.from(new TextEncoder().encode(name), byte => String.fromCharCode(byte)).join(""))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const optimizedPath = dir + "/optimized-v1-" + encodedName + "." + uuid() + "." + imageExtension(smaller.type);
    const { error: uploadError } = await sb.storage.from(bucket).upload(optimizedPath, smaller, {
      contentType: smaller.type, cacheControl: "31536000", upsert: false,
    });
    if (uploadError) throw uploadError;
    return { path: optimizedPath, type: smaller.type, originalSize: source.size, size: smaller.size };
  }
  function record(copy) {
    result.originalBytes += copy.originalSize;
    result.optimizedBytes += copy.size;
  }

  for (const page of pages) {
    const path = page.image_path;
    if (!path || path.slice(path.lastIndexOf("/") + 1).startsWith("optimized-v1-")) continue;
    onProgress({ kind: "page", completed: result.pages + result.attachments + result.skipped });
    const copy = await createCopy(path);
    if (!copy) continue;
    const { data, error } = await sb.from("pages").update({ image_path: copy.path })
      .eq("id", page.id).eq("image_path", path).select("id").maybeSingle();
    if (error) throw new Error("Couldn’t update page " + page.id + ": " + error.message);
    if (!data) throw new Error("Page " + page.id + " changed during optimization; its original was kept");
    result.pages++; record(copy);
  }

  for (const note of notes) {
    const original = note.attachments || [];
    if (!Array.isArray(original)) throw new Error("Invalid attachments on note " + note.id);
    const attachments = original.map(attachment => ({ ...attachment }));
    const copies = [];
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      if (!attachment || !/^image\//.test(attachment.type || "") || !attachment.path || attachment.original_path) continue;
      onProgress({ kind: "attachment", completed: result.pages + result.attachments + result.skipped });
      const copy = await createCopy(attachment.path, attachment.type);
      if (!copy) continue;
      attachments[i] = { ...attachment, original_path: attachment.path, path: copy.path, type: copy.type };
      copies.push(copy);
    }
    if (!copies.length) continue;
    const { data, error } = await sb.from("notes").update({ attachments })
      .eq("id", note.id).eq("attachments", JSON.stringify(original)).select("id").maybeSingle();
    if (error) throw new Error("Couldn’t update note " + note.id + ": " + error.message);
    if (!data) throw new Error("Note " + note.id + " changed during optimization; its originals were kept");
    result.attachments += copies.length;
    copies.forEach(record);
  }
  return result;
}

if (typeof module !== "undefined") module.exports = { optimizeTrackerMedia };
