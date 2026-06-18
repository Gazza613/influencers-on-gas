import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listTools, callMcp } from "@/lib/vendors/higgsfield";

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
    const schema = gen?.inputSchema as { properties?: { params?: unknown } } | undefined;
    const paramsSchema = schema?.properties?.params ?? schema;
    // model/aspect are free-form strings validated against a server catalog → query it.
    let catalog: unknown = null;
    for (const args of [{ action: "search", query: "nano banana" }, { action: "list", category: "image" }, { action: "list" }]) {
      try { const r = await callMcp("models_explore", args); if (r && !String(JSON.stringify(r)).includes("validation error")) { catalog = r; break; } } catch { /* try next shape */ }
    }
    const catStr = typeof catalog === "string" ? catalog : JSON.stringify(catalog ?? "");
    // Surface anything that looks like a nano-banana model id for convenience.
    const nanoIds = [...new Set((catStr.match(/[a-z0-9_.-]*nano[a-z0-9_.-]*/gi) || []))];
    return NextResponse.json({
      ok: true,
      generate_image_found: !!gen,
      aspect_ratio_schema: pickEnum(paramsSchema, "aspect_ratio"),
      nano_model_ids_found: nanoIds,
      models_catalog: catalog,
      tools: tools.map((t) => t.name),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
