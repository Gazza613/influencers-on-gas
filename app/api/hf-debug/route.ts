import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTools } from "@/lib/vendors/higgsfield";

// Super-admin diagnostic: dump input schemas for the tools we want to wire next
// (native 4K upscaling, aspect reframe, video). Temporary.
export const maxDuration = 30;
const WANT = ["upscale_image", "reframe", "outpaint_image", "remove_background", "generate_video"];

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  try {
    const tools = await listTools();
    const picked = tools
      .filter((t) => WANT.includes(t.name))
      .map((t) => ({ name: t.name, description: (t.description || "").slice(0, 240), inputSchema: t.inputSchema }));
    return NextResponse.json({ tools: picked });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
