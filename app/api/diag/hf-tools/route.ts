import { NextResponse } from "next/server";
import { listTools } from "@/lib/vendors/higgsfield";

// TEMPORARY discovery route (secret-gated). DELETE after building hero-anchored gen.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "soul-probe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const want = (new URL(req.url).searchParams.get("tools") || "").split(",").filter(Boolean);
  try {
    const tools = await listTools();
    const pick = want.length ? tools.filter((t) => want.includes(t.name)) : tools;
    return NextResponse.json({ tools: pick });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
