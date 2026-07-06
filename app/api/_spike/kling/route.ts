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
    const text = (await r.text()).slice(0, 400).replace(/\s+/g, " ");
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

  // 3) ?go=1 → ONE real timed Kling generation on the first endpoint that accepts a valid submit.
  if (new URL(req.url).searchParams.get("go") === "1") {
    const exists = (out.endpoints as { path: string; status: number }[]).filter((e) => e.status !== 404 && e.status !== 0 && /kling|jobs/.test(e.path)).map((e) => e.path);
    const prompt = "A calm, candid cinematic scene with gentle natural motion; slow subtle push-in.";
    const shapes = (img: string) => [
      { model: "kling3_0", prompt, input_images: [{ type: "image_url", image_url: img }], duration: 5 },
      { model: "kling3_0", prompt, medias: [{ value: img, role: "start_image" }], duration: 5 },
    ];
    const gen: Record<string, unknown> = { tried: [] };
    let jobSetId: string | null = null; let usedPath = ""; let usedShape = -1;
    for (const path of exists) {
      for (let s = 0; s < shapes(TEST_IMG).length && !jobSetId; s++) {
        const r = await probe("POST", path, { params: shapes(TEST_IMG)[s] });
        (gen.tried as unknown[]).push({ path, shape: s, status: r.status, body: r.body });
        try { const j = JSON.parse((await fetch(BASE + path, { method: "POST", headers: H(), body: JSON.stringify({ params: shapes(TEST_IMG)[s] }) }).then((x) => x.text()))); if (j?.id) { jobSetId = j.id; usedPath = path; usedShape = s; } } catch { /* keep trying */ }
      }
      if (jobSetId) break;
    }
    gen.submitted = { jobSetId, usedPath, usedShape };
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
