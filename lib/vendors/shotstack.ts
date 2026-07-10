import { getSecret } from "../connections";

// Shotstack Edit API - submit a timeline JSON, poll until the mp4 is rendered.
// Host is env-configurable (production vs sandbox); key from the vault or env.
const BASE = process.env.SHOTSTACK_BASE || "https://api.shotstack.io/edit/v1";

async function key(): Promise<string> {
  const k = (await getSecret("shotstack")) || process.env.SHOTSTACK_API_KEY;
  if (!k) throw new Error("Shotstack is not connected");
  return k;
}

type AnyObj = Record<string, unknown>;

// Probe a hosted media URL for its REAL duration (seconds) via Shotstack's probe endpoint. Used to record
// the actual length of a rendered b-roll clip (the DoP engine may render longer or shorter than requested),
// so the stitch plays the full clip instead of assuming a fixed ~5s. Best-effort: returns null on any error.
export async function probeDuration(url: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/probe/${encodeURIComponent(url)}`, { headers: { "x-api-key": await key() }, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { response?: { metadata?: { format?: { duration?: number | string }; streams?: { codec_type?: string; duration?: number | string }[] } } } | null;
    const meta = data?.response?.metadata;
    const fmt = Number(meta?.format?.duration);
    if (fmt > 0) return fmt;
    for (const s of meta?.streams ?? []) { const d = Number(s?.duration); if (d > 0) return d; }
    return null;
  } catch { return null; }
}

// Submit an edit; returns the render id.
export async function renderEdit(edit: AnyObj): Promise<string> {
  const res = await fetch(`${BASE}/render`, {
    method: "POST",
    headers: { "x-api-key": await key(), "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Shotstack render failed (${res.status}): ${txt.slice(0, 200)}`);
  const data = JSON.parse(txt) as { response?: { id?: string }; id?: string };
  const id = data?.response?.id || data?.id;
  if (!id) throw new Error(`Shotstack render: no id in response: ${txt.slice(0, 160)}`);
  return id;
}

// Poll a render to completion; resolves to the final mp4 url (or null on failure/timeout).
export async function pollRender(id: string, rounds = 80): Promise<{ url: string | null; error: string | null }> {
  for (let i = 0; i < rounds; i++) {
    if (i) await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${BASE}/render/${id}`, { headers: { "x-api-key": await key() }, cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { response?: { status?: string; url?: string; error?: string } };
      const status = String(data?.response?.status || "").toLowerCase();
      if (status === "done" && data.response?.url) return { url: data.response.url, error: null };
      if (status === "failed") return { url: null, error: data.response?.error || "render failed" };
    } catch { /* transient - retry */ }
  }
  return { url: null, error: "render timed out" };
}

// ONE quick status check (returns fast) so the caller can poll across short durable steps with
// step.sleep - never blocking a single serverless invocation for minutes.
// Coerce whatever a vendor calls an "error" into a display-safe string.
function errorText(e: unknown): string {
  if (typeof e === "string" && e.trim()) return e.slice(0, 220);
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.slice(0, 220);
    try { return JSON.stringify(e).slice(0, 220); } catch { /* fall through */ }
  }
  return "render failed";
}

export async function pollRenderOnce(id: string): Promise<{ url: string | null; terminal: boolean; error: string | null }> {
  try {
    const res = await fetch(`${BASE}/render/${id}`, { headers: { "x-api-key": await key() }, cache: "no-store" });
    if (!res.ok) return { url: null, terminal: false, error: null };
    // Shotstack's `error` is NOT always a string: a failed render returns an object ({ name, message }).
    // Persisting that object put a non-string into production.assembly_error, which the UI renders directly -
    // React then threw "Objects are not valid as a React child" and the whole Producer page crashed. Always
    // hand callers a plain string.
    const data = (await res.json()) as { response?: { status?: string; url?: string; error?: unknown } };
    const status = String(data?.response?.status || "").toLowerCase();
    if (status === "done" && data.response?.url) return { url: data.response.url, terminal: true, error: null };
    if (status === "failed") return { url: null, terminal: true, error: errorText(data.response?.error) };
    return { url: null, terminal: false, error: null };
  } catch { return { url: null, terminal: false, error: null }; }
}
