import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTools } from "@/lib/vendors/higgsfield";

// Super-admin diagnostic: dump the input schemas for the identity-relevant Higgsfield
// tools so we can wire true Soul/character-locked generation. Temporary.
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  try {
    const tools = await listTools();
    const want = ["generate_image", "show_characters", "show_reference_elements", "models_explore"];
    const picked = tools.filter((t) => want.includes(t.name)).map((t) => ({ name: t.name, description: (t.description || "").slice(0, 300), inputSchema: t.inputSchema }));
    return NextResponse.json({ tools: picked }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
