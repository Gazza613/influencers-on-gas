import { NextResponse } from "next/server";
import { auth } from "@/auth";

// TEMPORARY SPIKE (remove after): verify whether Higgsfield's FIRST-PARTY REST exposes a Kling image-to-video
// endpoint we can call with our own key (bypassing the slow MCP session), and how fast it is. Auth-gated,
// isolated (touches no render code), and it only spends credits on ONE generation when called with ?go=1.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BASE = "https://platform.higgsfield.ai";
const KEY = () => process.env.HIGGSFIELD_KEY_ID || "";
const SEC = () => process.env.HIGGSFIELD_KEY_SECRET || "";
const H = () => ({ "hf-api-key": KEY(), "hf-secret": SEC(), "Content-Type": "application/json" });
const TEST_IMG = "https://picsum.photos/1080/1920"; // public 9:16 stand-in

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
  if (!KEY() || !SEC()) return NextResponse.json({ error: "HIGGSFIELD_KEY_ID / HIGGSFIELD_KEY_SECRET not set in this environment" }, { status: 400 });

  const out: Record<string, unknown> = { keyPrefix: KEY().slice(0, 6) };

  // 1) API schema / model list (best case: the full map, zero cost)
  out.schema = [];
  for (const p of ["/openapi.json", "/v1/openapi.json", "/v1/models", "/v1/image2video", "/jobs/v2"]) {
    (out.schema as unknown[]).push(await probe("GET", p));
  }

  // 2) endpoint existence: empty params -> 422 validation = EXISTS + auth OK; 404 = no such endpoint; 401 = auth fail.
  const candidates = [
    "/v1/image2video/dop", "/v1/image2video/kling", "/v1/image2video/kling3_0", "/v1/image2video/kling-3.0",
    "/jobs/v2/kling3_0", "/v1/jobs/v2/kling3_0", "/v1/image2video/veo", "/v1/image2video/seedance", "/v1/image2video/wan",
  ];
  out.endpoints = [];
  for (const p of candidates) (out.endpoints as unknown[]).push(await probe("POST", p, { params: {} }));

  // 3) ?go=1 → ONE real timed Kling generation on the first-party REST endpoint /v1/image2video/kling.
  if (new URL(req.url).searchParams.get("go") === "1") {
    const path = "/v1/image2video/kling";
    const prompt = "A calm, candid cinematic scene with gentle natural motion; slow subtle push-in.";
    // First force the model-enum error so we capture EVERY valid model id (name discovery, zero real submit).
    const enumProbe = await probe("POST", path, { params: { model: "__list__", prompt, input_image: { type: "image_url", image_url: TEST_IMG } } });
    // Then try real submits: correct field (input_image, singular) + the REST model ids + a few image shapes.
    const shapes = (img: string) => [
      { model: "kling-v2-1", prompt, input_image: { type: "image_url", image_url: img }, duration: 5 },
      { model: "kling-v2-1-master", prompt, input_image: { type: "image_url", image_url: img }, duration: 5 },
      { model: "kling-v2-1", prompt, input_image: img, duration: 5 },
    ];
    const gen: Record<string, unknown> = { enumProbe, tried: [] };
    let jobSetId: string | null = null; let usedShape = -1;
    for (let s = 0; s < shapes(TEST_IMG).length && !jobSetId; s++) {
      const bodyParams = { params: shapes(TEST_IMG)[s] };
      const raw = await fetch(BASE + path, { method: "POST", headers: H(), body: JSON.stringify(bodyParams) }).then((x) => x.text()).catch((e) => String(e));
      (gen.tried as unknown[]).push({ shape: s, model: shapes(TEST_IMG)[s].model, body: raw.slice(0, 500) });
      try { const j = JSON.parse(raw); if (j?.id) { jobSetId = j.id; usedShape = s; } } catch { /* keep trying */ }
    }
    gen.submitted = { jobSetId, usedPath: path, usedShape };
    // 4) poll the job-set + time it (up to ~4 min so it fits the function window).
    if (jobSetId) {
      const t0 = Date.now(); const timeline: { s: number; status: string }[] = []; let url: string | null = null; let last = "";
      for (let n = 0; n < 55; n++) {
        await new Promise((res) => setTimeout(res, 5000));
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
