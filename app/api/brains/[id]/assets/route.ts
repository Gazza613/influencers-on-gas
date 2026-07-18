import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { listAssets } from "@/lib/studio";

// THE BRAND LIBRARY, SHOWN WHERE IT ALREADY LIVES (Gary: "those intake reference images ... should actually
// always sit in a well structured brain section").
//
// Nothing moves. studio_assets is ALREADY keyed by client_id, which is the same key as knowledge_chunks - so
// the reference designs, logos, deal cards and CEO photos uploaded through Intake have always been inside the
// client's brain, they were simply only ever rendered on the Intake screen. A brain that shows 159 chunks and
// hides 177 brand assets is telling you less than half of what it holds.
//
// So this is a read, grouped for display. No migration, no copy, no second source of truth to drift.

export const dynamic = "force-dynamic";

// Display order and human labels. Reference designs lead: they are the thing the forensic retheme works from.
const GROUPS: { kind: string; label: string; note: string }[] = [
  { kind: "reference", label: "Reference designs", note: "The live funnel designs every creative is forensically matched to" },
  { kind: "deal_card", label: "Deal cards", note: "Real artwork, composited never redrawn" },
  { kind: "logo", label: "Logos", note: "Stamped as real files, so no AI ever draws the mark" },
  { kind: "phone_screen", label: "Phone screens", note: "Real screenshots, never invented" },
  { kind: "brand_icon", label: "Brand icons", note: "" },
  { kind: "ceo_photo", label: "CEO photos", note: "Forensic source for the CEO creative" },
  { kind: "font", label: "Fonts", note: "" },
  { kind: "ci_doc", label: "CI documents", note: "" },
];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const all = await listAssets(id).catch(() => []);

  const groups = GROUPS.map((g) => ({
    ...g,
    assets: all.filter((a) => a.kind === g.kind).map((a) => ({ id: a.id, name: a.name, url: a.url })),
  })).filter((g) => g.assets.length > 0);

  // Anything with a kind nobody has grouped yet is still shown rather than silently dropped - the same
  // principle as the cost split's "Unattributed": a brain must not quietly hide what it is holding.
  const known = new Set(GROUPS.map((g) => g.kind));
  const other = all.filter((a) => !known.has(a.kind));
  if (other.length) {
    groups.push({ kind: "other", label: "Other", note: "", assets: other.map((a) => ({ id: a.id, name: a.name, url: a.url })) });
  }

  return NextResponse.json({ groups, total: all.length });
}
