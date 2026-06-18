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
    // Pull the full model catalog (list) — search returned empty. Collect all items.
    const items: Record<string, unknown>[] = [];
    for (const args of [{ action: "list", limit: 500 }, { action: "list" }, { action: "list", kind: "image" }]) {
      try {
        const r = await callMcp("models_explore", args) as { structuredContent?: { items?: Record<string, unknown>[] } };
        const got = r?.structuredContent?.items;
        if (Array.isArray(got) && got.length) { items.push(...got); break; }
      } catch { /* try next shape */ }
    }
    // Each item likely carries an id/slug + a name; surface a compact id->name map and the nano ones.
    const idOf = (it: Record<string, unknown>) => String(it.id ?? it.model ?? it.slug ?? it.key ?? "");
    const nameOf = (it: Record<string, unknown>) => String(it.name ?? it.title ?? it.label ?? "");
    const allModels = items.map((it) => ({ id: idOf(it), name: nameOf(it) })).filter((m) => m.id || m.name);
    const nano = allModels.filter((m) => /nano|banana/i.test(m.id + " " + m.name));
    return NextResponse.json({
      ok: true,
      generate_image_found: !!gen,
      aspect_ratio_schema: pickEnum(paramsSchema, "aspect_ratio"),
      count: allModels.length,
      nano_models: nano,
      all_models: allModels,
      sample_raw_item: items[0] ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 300) }, { status: 500 });
  }
}
