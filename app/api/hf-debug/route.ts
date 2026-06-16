import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { callMcp } from "@/lib/vendors/higgsfield";

// Super-admin diagnostic: ask Higgsfield's model catalog how to generate with a trained
// Soul (model id + how the character is attached), so we can wire Soul-locked generation.
export const maxDuration = 30;
const clip = (x: unknown, n = 2200) => { const s = typeof x === "string" ? x : JSON.stringify(x ?? ""); return s.slice(0, n); };

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  try {
    const [soul2, soulCinematic, recommend] = await Promise.all([
      callMcp("models_explore", { action: "get", model_id: "soul_2" }).catch((e) => "ERR " + String(e)),
      callMcp("models_explore", { action: "get", model_id: "soul_cinematic" }).catch((e) => "ERR " + String(e)),
      callMcp("models_explore", { action: "recommend", query: "keep a consistent trained character / Soul identity, photoreal person in a scene", type: "image", input: "image", limit: 6 }).catch((e) => "ERR " + String(e)),
    ]);
    return NextResponse.json({ soul2: clip(soul2), soulCinematic: clip(soulCinematic), recommend: clip(recommend, 2600) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
