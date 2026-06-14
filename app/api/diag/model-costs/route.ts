import { NextResponse } from "next/server";
import { previewImageCost } from "@/lib/vendors/higgsfield";

// TEMPORARY — preflight image-model credit costs on this plan. DELETE after checking.
export const maxDuration = 120;

const MODELS = [
  "gpt_image_2",
  "nano_banana_flash",
  "nano_banana_2",
  "seedream_v4_5",
  "seedream_v5_lite",
  "cinematic_studio_2_5",
];

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "costprobe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const out: Record<string, unknown> = {};
  for (const m of MODELS) {
    try {
      out[m] = await previewImageCost(m);
    } catch (e) {
      out[m] = { error: String((e as Error)?.message || e).slice(0, 200) };
    }
  }
  return NextResponse.json(out);
}
