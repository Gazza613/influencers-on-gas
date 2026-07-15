import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { produceRefMatch } from "@/lib/studio-refmatch";

// THE EXPERTS BUILD THE WHOLE STACK. Gary: "the experts must do the work - my team is co-pilots not pilots."
// One call: the Producer plans (concept, subjects, callouts, deals, story), the creative expert auto-picks a
// reference per section, generates all five, and finishes them (slider headline typeset + real logo). The team
// then co-pilots - rerun, edit, accept. THIS SPENDS (the full set).
export const maxDuration = 800;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; brief?: string };
  const clientId = String(b.clientId || "");
  const brief = String(b.brief || "").trim();
  if (!clientId || brief.length < 6) return NextResponse.json({ error: "Give the experts a brief to work from." }, { status: 400 });
  try {
    const out = await produceRefMatch(clientId, brief);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 220) }, { status: 500 });
  }
}
