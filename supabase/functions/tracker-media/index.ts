import { createClient } from "npm:@supabase/supabase-js@2";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

const allowedOrigins = new Set([
  "https://hawaamish.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", "application/json");
  if (origin && allowedOrigins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "Media request failed";
  const value = error as Record<string, unknown>;
  const fields = [
    typeof value.name === "string" ? value.name : "",
    typeof value.code === "string" ? value.code : typeof value.Code === "string" ? value.Code : "",
    typeof value.message === "string" ? value.message : typeof value.Message === "string" ? value.Message : "",
    value.$metadata && typeof value.$metadata === "object" &&
        typeof (value.$metadata as Record<string, unknown>).httpStatusCode === "number"
      ? `HTTP ${(value.$metadata as Record<string, unknown>).httpStatusCode}`
      : "",
  ].filter(Boolean);
  return fields.join(": ") || "Media request failed";
}

const supabaseUrl = requiredEnv("SUPABASE_URL");
function defaultKey(name: string, legacyName: string) {
  const encoded = Deno.env.get(name);
  if (encoded) {
    try {
      const keys = JSON.parse(encoded);
      if (typeof keys.default === "string" && keys.default) return keys.default;
    } catch {
      throw new Error(`Invalid Supabase key configuration: ${name}`);
    }
  }
  return requiredEnv(legacyName);
}
const supabaseAnonKey = defaultKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const serviceRoleKey = defaultKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const b2Bucket = requiredEnv("B2_BUCKET");
const endpoint = requiredEnv("B2_ENDPOINT");
const region = requiredEnv("B2_REGION");
const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requiredEnv("B2_KEY_ID"),
    secretAccessKey: requiredEnv("B2_APPLICATION_KEY"),
  },
});
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 &&
    !value.startsWith("/") && !value.includes("\\") && !value.includes("\0") &&
    value.split("/").every(part => part && part !== "." && part !== "..");
}

function memberClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authorize(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Sign in is required");
  const userClient = memberClient(authorization.slice(7));
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user?.email) throw new Error("Your session is invalid or expired");
  const email = user.email.toLowerCase();
  const { data: members, error: memberError } = await service.from("members")
    .select("email,role").range(0, 999);
  if (memberError) throw memberError;
  const member = (members || []).find((row: { email: string }) =>
    typeof row.email === "string" && row.email.toLowerCase() === email);
  if (!member) throw new Error("Only tracker members can access media");
  return { email, isAdmin: member.role === "admin" };
}

async function assertUnreferenced(keys: string[]) {
  const marked = keys.map(key => `b2:${key}`);
  const pages: Array<{ image_path: string | null }> = [];
  for (let index = 0; index < marked.length; index += 20) {
    const { data, error } = await service.from("pages").select("image_path")
      .in("image_path", marked.slice(index, index + 20));
    if (error) throw error;
    pages.push(...(data || []));
  }
  const notes: Array<{ voice_path: string | null; attachments: Array<{ path?: string }> | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await service.from("notes").select("voice_path,attachments")
      .order("id").range(offset, offset + 999);
    if (error) throw error;
    notes.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const used = new Set(pages.map(row => row.image_path));
  for (const note of notes || []) {
    if (note.voice_path) used.add(note.voice_path);
    for (const attachment of Array.isArray(note.attachments) ? note.attachments : []) {
      if (attachment?.path) used.add(attachment.path);
    }
  }
  const referenced = marked.filter(path => used.has(path));
  if (referenced.length) throw new Error("A file is still referenced by tracker data");
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
    const headers = new Headers(corsHeaders);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { headers });
  }
  if (origin && !allowedOrigins.has(origin)) return jsonResponse({ error: "Origin not allowed" }, 403, origin);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  try {
    const caller = await authorize(request);
    const body = await request.json();
    if (body.action === "sign-download") {
      if (!Array.isArray(body.paths) || body.paths.length < 1 || body.paths.length > 50 ||
          !body.paths.every(validKey)) {
        return jsonResponse({ error: "Invalid media paths" }, 400, origin);
      }
      const urls = await Promise.all(body.paths.map(async (path: string) => ({
        path,
        url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: b2Bucket, Key: path }), { expiresIn: 3600 }),
      })));
      return jsonResponse({ urls }, 200, origin);
    }

    if (body.action === "sign-upload" || body.action === "sign-migration-upload") {
      const migration = body.action === "sign-migration-upload";
      if (migration && !caller.isAdmin) return jsonResponse({ error: "Only tracker admins can migrate media" }, 403, origin);
      const { path, contentType, size } = body;
      if (!validKey(path) || !["pages/", "notes/", "voice/"].some(prefix => path.startsWith(prefix)) ||
          typeof contentType !== "string" || contentType.length > 150 ||
          !Number.isSafeInteger(size) || size < 1 || size > 50 * 1024 * 1024 ||
          (migration && body.sha256 === undefined) ||
          (body.sha256 !== undefined && (typeof body.sha256 !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(body.sha256)))) {
        return jsonResponse({ error: "Invalid upload" }, 400, origin);
      }
      try {
        const existing = await s3.send(new HeadObjectCommand({ Bucket: b2Bucket, Key: path }));
        if (body.sha256 && (existing.ContentLength !== size ||
            existing.Metadata?.sourcesha256 !== body.sha256)) {
          return jsonResponse({ error: "A Backblaze object already exists at this path with different content" }, 409, origin);
        }
        return jsonResponse({ exists: true, size: existing.ContentLength }, 200, origin);
      } catch (error) {
        const status = error && typeof error === "object" && "$metadata" in error
          ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
          : null;
        if (status !== 404) throw error;
      }
      const command = new PutObjectCommand({
        Bucket: b2Bucket,
        Key: path,
        ContentLength: size,
        ContentType: contentType,
        CacheControl: "private, max-age=31536000, immutable",
        ...(body.sha256 ? { Metadata: { sourcesha256: body.sha256 } } : {}),
      });
      const url = await getSignedUrl(s3, command, {
        expiresIn: 300,
        ...(body.sha256 ? { unhoistableHeaders: new Set(["x-amz-meta-sourcesha256"]) } : {}),
      });
      return jsonResponse({ url, exists: false }, 200, origin);
    }

    if (body.action === "delete") {
      if (!Array.isArray(body.paths) || body.paths.length < 1 || body.paths.length > 100 ||
          !body.paths.every(validKey)) {
        return jsonResponse({ error: "Invalid media paths" }, 400, origin);
      }
      await assertUnreferenced(body.paths);
      for (const path of body.paths) {
        await s3.send(new DeleteObjectCommand({ Bucket: b2Bucket, Key: path }));
      }
      return jsonResponse({ deleted: body.paths.length }, 200, origin);
    }

    return jsonResponse({ error: "Unknown media operation" }, 400, origin);
  } catch (error) {
    const message = describeError(error);
    console.error("tracker-media request failed:", message);
    return jsonResponse({ error: message }, 400, origin);
  }
});
