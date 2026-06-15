import { NextResponse } from "next/server";
import { generateBible } from "@/lib/vendors/anthropic";

// TEMPORARY — verify the Opus 4.8 Character Bible generation. DELETE after.
export const maxDuration = 120;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "bibleprobe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const t = Date.now();
  try {
    const bible = await generateBible(
      "SAMI",
      "Late-20s South African wellness creator, sun-warmed and approachable, mixes Cape Town beach life with honest mental-health talk, calm and a little playful.",
    );
    return NextResponse.json({ seconds: Math.round((Date.now() - t) / 1000), keys: Object.keys(bible), bible });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
