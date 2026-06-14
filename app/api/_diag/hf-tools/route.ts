import { NextResponse } from "next/server";
import { listTools } from "@/lib/vendors/higgsfield";

// TEMPORARY discovery route (secret-gated). Returns Higgsfield's MCP tool list so
// we can find the Soul-training tool. DELETE after 3b-2b-ii.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "soul-probe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const tools = await listTools();
    return NextResponse.json({ count: tools.length, tools });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
