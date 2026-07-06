import { NextResponse } from "next/server";
import { auth } from "@/auth";

// TEMPORARY SPIKE (remove after): does Higgsfield's FIRST-PARTY REST expose an IMAGE-generation endpoint (with
// multiple reference images) we can call with our key, to replace the slow MCP generate_image for keyframes?
// Auth-gated, isolated (touches no render code); only spends credits on ONE generation when called with ?go=1.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BASE = "https://platform.higgsfield.ai";
const KEY = () => process.env.HIGGSFIELD_KEY_ID || "";
const SEC = () => process.env.HIGGSFIELD_KEY_SECRET || "";
const H = () => ({ "hf-api-key": KEY(), "hf-secret": SEC(), "Content-Type": "application/json" });
const IMG = "https://picsum.photos/1080/1920"; // public reference stand-in

async function probe(method: "GET" | "POST", path: string, body?: unknown) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + path, { method, headers: H(), ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
    const text = (await r.text()).slice(0, 900).replace(/\s+/g, " ");
    return { path, method, status: r.status, ms: Date.now() - t0, body: text };
  } catch (e) { return { path, method, status: 0, ms: Date.now() - t0, body: String((e as Error)?.message || e) }; }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  if (!KEY() || !SEC()) return NextResponse.json({ error: "HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET not set here" }, { status: 400 });

  const out: Record<string, unknown> = { keyPrefix: KEY().slice(0, 6) };
  // Endpoint existence: empty params -> 422 (exists + auth OK, reveals required fields), 404 = no such endpoint.
  const candidates = [
    "/v1/text2image/soul", "/v1/text2image", "/v1/text2image/nano_banana_pro", "/v1/text2image/nano-banana",
    "/v1/text2image/gpt_image_2", "/v1/text2image/seedream", "/v1/text2image/higgsfield",
    "/v1/image2image", "/v1/image2image/nano_banana_pro", "/v1/image2image/soul", "/v1/edit", "/v1/images",
  ];
  out.endpoints = [];
  for (const p of candidates) (out.endpoints as unknown[]).push(await probe("POST", p, { params: {} }));

  // ?go=1 → ONE real timed image generation on the first endpoint that exists, with a couple param shapes
  // (single ref + MULTIPLE refs, since keyframes composite the locked face + guide + wardrobe + world).
  if (new URL(req.url).searchParams.get("go") === "1") {
    const exists = (out.endpoints as { path: string; status: number }[]).filter((e) => e.status === 422).map((e) => e.path);
    const prompt = "A photorealistic portrait of a person at an outdoor cafe, natural light, sharp focus.";
    const gen: { tried: unknown[]; jobSetId?: string | null; usedPath?: string; timeline?: unknown; finalUrl?: string | null; totalSeconds?: number } = { tried: [] };
    let jobSetId: string | null = null; let usedPath = "";
    const shapes = [
      { model: "nano_banana_pro", prompt, input_images: [{ type: "image_url", image_url: IMG }] },
      { model: "nano_banana_pro", prompt, input_images: [{ type: "image_url", image_url: IMG }, { type: "image_url", image_url: IMG }] },
      { model: "soul", prompt, input_images: [{ type: "image_url", image_url: IMG }] },
      { prompt, input_images: [{ type: "image_url", image_url: IMG }] },
    ];
    for (const path of exists) {
      for (const shape of shapes) {
        if (jobSetId) break;
        const raw = await fetch(BASE + path, { method: "POST", headers: H(), body: JSON.stringify({ params: shape }) }).then((x) => x.text()).catch((e) => String(e));
        (gen.tried as unknown[]).push({ path, model: (shape as { model?: string }).model || "(none)", refs: (shape.input_images || []).length, body: raw.slice(0, 400) });
        try { const j = JSON.parse(raw); if (j?.id) { jobSetId = j.id; usedPath = path; } } catch { /* keep trying */ }
      }
      if (jobSetId) break;
    }
    gen.jobSetId = jobSetId; gen.usedPath = usedPath;
    if (jobSetId) {
      const t0 = Date.now(); const timeline: { s: number; status: string }[] = []; let url: string | null = null; let last = "";
      for (let n = 0; n < 40; n++) {
        await new Promise((res) => setTimeout(res, 4000));
        try {
          const d = await fetch(`${BASE}/v1/job-sets/${jobSetId}`, { headers: H(), cache: "no-store" }).then((x) => x.json()) as { jobs?: { status?: string; results?: { raw?: { url?: string }; min?: { url?: string } } }[] };
          const job = d.jobs?.[0]; const status = String(job?.status || "unknown").toLowerCase();
          if (status !== last) { timeline.push({ s: Math.round((Date.now() - t0) / 1000), status }); last = status; }
          url = job?.results?.raw?.url || job?.results?.min?.url || null;
          if (url || ["completed", "failed", "nsfw", "canceled"].includes(status)) break;
        } catch { /* transient */ }
      }
      gen.timeline = timeline; gen.finalUrl = url; gen.totalSeconds = Math.round((Date.now() - t0) / 1000);
    }
    out.generation = gen;
  }

  return NextResponse.json(out, { status: 200 });
}
