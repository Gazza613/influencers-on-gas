import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTools } from "@/lib/vendors/higgsfield";

// Super-admin: discover the live Higgsfield generate_image schema (accepted model ids +
// aspect_ratio values) so we wire the EXACT Nano Banana Pro id and the right 1:1 token,
// rather than guessing. Read-only, no spend.
export const maxDuration = 60;

function pickEnum(schema: unknown, key: string): unknown {
  const s = schema as { properties?: Record<string, { enum?: unknown[]; type?: string }> } | undefined;
  const node = s?.properties?.[key];
  return node?.enum ?? node?.type ?? null;
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  try {
    const tools = await listTools();
    const gen = tools.find((t) => t.name === "generate_image");
    // The model/aspect enums may live at the top level or nested under a "params" object.
    const schema = gen?.inputSchema as { properties?: { params?: unknown } } | undefined;
    const paramsSchema = schema?.properties?.params ?? schema;
    return NextResponse.json({
      ok: true,
      generate_image_found: !!gen,
      models: pickEnum(paramsSchema, "model"),
      aspect_ratio: pickEnum(paramsSchema, "aspect_ratio"),
      quality: pickEnum(paramsSchema, "quality"),
      tools: tools.map((t) => t.name),
      raw_generate_image_schema: gen?.inputSchema ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
