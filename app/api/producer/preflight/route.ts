import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTools, callMcp } from "@/lib/vendors/higgsfield";

// VERIFICATION SPIKE, step 1 — PRE-FLIGHT (read-only, no spend). Pull the REAL Higgsfield video
// model ids + each model's accepted params (media roles, durations, ratios, soul_id, audio) so we
// can wire Veo / Kling / Cinema Studio exactly instead of guessing. Super-admin only.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnyObj = Record<string, unknown>;
function unwrap(r: unknown): unknown {
  const o = r as AnyObj;
  if (o?.structuredContent) return o.structuredContent;
  if (Array.isArray(o?.content)) { const t = (o.content as AnyObj[]).find((c) => c.text); if (t) { try { return JSON.parse(t.text as string); } catch { return t.text; } } }
  return r;
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  try {
    const tools = await listTools();
    const genVideo = tools.find((t) => t.name === "generate_video");

    // 1) List the video model catalog.
    const videoModels: { id: string; name: string; raw: AnyObj }[] = [];
    for (const args of [{ action: "list", kind: "video" }, { action: "list" }]) {
      try {
        const data = unwrap(await callMcp("models_explore", args)) as AnyObj;
        const items = (Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []) as AnyObj[];
        for (const it of items) {
          const id = String(it?.id ?? it?.model ?? it?.slug ?? it?.key ?? "");
          const name = String(it?.name ?? it?.title ?? "");
          const kind = String(it?.kind ?? it?.type ?? "");
          if (id && /kling|veo|seedance|sora|wan|hailuo|cinema|video|i2v/i.test(`${id} ${name} ${kind}`)) videoModels.push({ id, name, raw: it });
        }
        if (videoModels.length) break;
      } catch { /* try next */ }
    }

    // 2) For the key models, fetch the per-model spec via models_explore "get" (the action the
    //    error told us to use). Try a few arg shapes since the exact one isn't documented.
    const wanted = [...new Set(videoModels.map((m) => m.id).filter((id) => /kling|veo|cinema|seedance/i.test(id)))].slice(0, 8);
    const specs: AnyObj = {};
    for (const id of wanted) {
      for (const args of [{ action: "get", model: id }, { action: "get", id }, { action: "get", slug: id }, { action: "search", query: id }]) {
        try {
          const r = unwrap(await callMcp("models_explore", args));
          const s = JSON.stringify(r);
          if (r && s !== "{}" && s !== "[]" && !/unknown|invalid|error/i.test(s.slice(0, 80))) { specs[id] = r; break; }
        } catch { /* try next shape */ }
      }
    }

    return NextResponse.json({
      ok: true,
      generate_video_schema: genVideo?.inputSchema ?? null,
      video_models: videoModels.map((m) => ({ id: m.id, name: m.name })),
      video_model_specs: specs,
      audio_tools: tools.filter((t) => /audio|music|sound|voice|tts|lipsync/i.test(`${t.name} ${t.description || ""}`)).map((t) => ({ name: t.name, description: t.description })),
      all_tools: tools.map((t) => t.name),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 400) }, { status: 500 });
  }
}
