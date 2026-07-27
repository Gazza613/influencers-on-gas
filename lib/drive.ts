import crypto from "node:crypto";

// GOOGLE DRIVE FILING (build spec 2, 3.9). Finished documents auto-file to the client's Drive folder under
// /Research. We do this with the GAS service account over the Drive REST API directly, signing a JWT with
// node:crypto - NOT the googleapis SDK. The SDK is ~100MB and this render lane already carries Chromium against
// a 250MB function limit (see lib/studio-render.ts); one more heavy dep would blow the budget for three REST
// calls we can make ourselves.
//
// GATED, never fatal. If the service account or the parent folder is not configured, filing is skipped and the
// caller falls back to the Blob copy - the document still exists and Gary is still emailed. To switch Drive on:
//   1. GOOGLE_SERVICE_ACCOUNT_JSON  - the service account key (raw JSON or base64).
//   2. RESEARCH_DRIVE_FOLDER_ID     - a folder the service account can WRITE to. A service account has no
//      personal Drive quota, so this must be a SHARED DRIVE folder with the service account added as Content
//      Manager (or a My-Drive folder shared to it on a Workspace with delegation). /Research and per-client
//      subfolders are created inside it automatically.

const SCOPE = "https://www.googleapis.com/auth/drive";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FILES = "https://www.googleapis.com/drive/v3/files";

type Creds = { client_email: string; private_key: string };

export function driveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.RESEARCH_DRIVE_FOLDER_ID);
}

function readCreds(): Creds | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let text = raw.trim();
  // Accept raw JSON or base64-encoded JSON.
  if (!text.startsWith("{")) {
    try { text = Buffer.from(text, "base64").toString("utf8"); } catch { return null; }
  }
  try {
    const j = JSON.parse(text) as { client_email?: string; private_key?: string };
    if (!j.client_email || !j.private_key) return null;
    // Env round-trips often escape the newlines in the PEM key; restore them.
    return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, "\n") };
  } catch { return null; }
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Mint an access token from the service account: sign a JWT and exchange it at Google's token endpoint. iat/exp
// are seconds; a 1-hour window is the maximum Google allows.
async function accessToken(creds: Creds): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(Buffer.from(JSON.stringify({
    iss: creds.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })));
  const signed = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(creds.private_key);
  const jwt = `${header}.${claim}.${b64url(signed)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`Drive auth failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("Drive auth returned no token");
  return j.access_token;
}

// Find a subfolder by exact name under a parent, or create it. supportsAllDrives + includeItemsFromAllDrives so
// this works inside a Shared Drive (the only place a service account can write).
async function ensureFolder(token: string, parentId: string, name: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name = '${safe}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
  const found = await fetch(`${FILES}?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (found.ok) {
    const j = (await found.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) return j.files[0].id;
  }
  const made = await fetch(`${FILES}?supportsAllDrives=true`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!made.ok) throw new Error(`Could not create Drive folder '${name}' (${made.status})`);
  return ((await made.json()) as { id: string }).id;
}

/**
 * File a document into the client's Drive folder under <parent>/<Client>/<subfolder>. Returns the web link, or
 * a skip reason when Drive is not configured (never throws for the unconfigured case - the caller falls back to
 * the Blob copy).
 */
export async function fileToClientDrive(opts: {
  clientName: string; subfolder?: string; filename: string; bytes: Buffer; contentType: string;
}): Promise<{ filed: boolean; url?: string; reason?: string }> {
  if (!driveConfigured()) return { filed: false, reason: "Drive not configured (GOOGLE_SERVICE_ACCOUNT_JSON / RESEARCH_DRIVE_FOLDER_ID)" };
  const creds = readCreds();
  if (!creds) return { filed: false, reason: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid service-account JSON" };
  const parent = process.env.RESEARCH_DRIVE_FOLDER_ID!;
  try {
    const token = await accessToken(creds);
    const clientFolder = await ensureFolder(token, parent, opts.clientName.slice(0, 120) || "Client");
    const target = await ensureFolder(token, clientFolder, opts.subfolder || "Research");

    // Multipart upload: metadata part, then the media part, in one request.
    const boundary = `gasb${b64url(crypto.randomBytes(12))}`;
    const meta = JSON.stringify({ name: opts.filename, parents: [target] });
    const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${opts.contentType}\r\n\r\n`, "utf8");
    const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([head, opts.bytes, tail]);
    const up = await fetch(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!up.ok) return { filed: false, reason: `Drive upload failed (${up.status}): ${(await up.text()).slice(0, 200)}` };
    const j = (await up.json()) as { id: string; webViewLink?: string };
    return { filed: true, url: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
  } catch (e) {
    return { filed: false, reason: String((e as Error)?.message || e).slice(0, 240) };
  }
}
