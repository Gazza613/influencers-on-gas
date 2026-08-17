import { auth } from "@/auth";
import { renderProposalHtml, renderProposalHtmlSharp } from "@/lib/proposal-render";
import { deriveCiTokens } from "@/lib/proposal-ci";
import { SAMPLE_BOSTON } from "@/lib/proposal-sample";

// TEMPLATE PREVIEW (the 24-page proposal). Renders the SAMPLE proposal (Boston City Campus) as a scrollable HTML
// page so the deck can be reviewed on the live deploy - real Poppins, true A4 geometry - BEFORE it is wired to the
// strategist engine. This is a template preview, not a real client proposal: the data is the verified fixture.
//   ?accent=%23C41230 &dark=%230A1830   test any client CI recolour (hex, url-encoded '#').
//   with no colours it uses the Boston crimson/navy set.
export const dynamic = "force-dynamic";

function hex(v: string | null): string | null {
  if (!v) return null;
  const h = v.trim().replace(/^#?/, "#");
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h) ? h : null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const accent = hex(url.searchParams.get("accent")) || "#C41230";   // Boston crimson by default
  const dark = hex(url.searchParams.get("dark")) || "#0A1830";        // Boston navy by default
  // THE DATE IS ALWAYS THE CURRENT DATE (Gary): the document renders on demand, so the issue date is today (SA time)
  // and validity is 14 days from it. Stamp it across every date mention in the sample fixture.
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
  const doc = JSON.parse(JSON.stringify(SAMPLE_BOSTON).split("7 August 2026").join(today)) as typeof SAMPLE_BOSTON;
  // ?mode=sharp renders the shorter, more visual 13-page "sharpened" deck; default is the full 23-page deck.
  const ci = deriveCiTokens(accent, dark);
  const html = url.searchParams.get("mode") === "sharp" ? renderProposalHtmlSharp(doc, ci) : renderProposalHtml(doc, ci);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
