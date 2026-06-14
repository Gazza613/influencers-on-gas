import { NextResponse } from "next/server";
import { getSecret } from "@/lib/connections";
import { getInfluencer } from "@/lib/influencers";

// TEMPORARY — probe the Magnific/Freepik upscaler API shape. DELETE after wiring.
export const maxDuration = 120;
const BASE = "https://api.freepik.com/v1/ai/image-upscaler";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "mgprobe-7f3a91") return NextResponse.json({ error: "not found" }, { status: 404 });
  const k = await getSecret("magnific");
  if (!k) return NextResponse.json({ error: "magnific not connected" }, { status: 400 });

  const id = url.searchParams.get("id");
  const inf = id ? await getInfluencer(id) : null;
  const refs = (inf?.look_refs as { url: string; hero?: boolean }[]) || [];
  const hero = (inf?.persona as { hero_url?: string })?.hero_url || refs.find((r) => r.hero)?.url || refs[0]?.url;

  const out: Record<string, unknown> = { hero };
  try {
    const b64 = hero ? Buffer.from(await (await fetch(hero)).arrayBuffer()).toString("base64") : "";
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "x-freepik-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify({ image: b64, scale_factor: "2x", optimized_for: "soft_portraits", creativity: 1, hdr: 2, resemblance: 5, fractality: 2, engine: "automatic" }),
    });
    out.start_status = res.status;
    out.start_body = await res.json().catch(() => ({}));
  } catch (e) {
    out.error = String((e as Error)?.message || e);
  }
  return NextResponse.json(out);
}
