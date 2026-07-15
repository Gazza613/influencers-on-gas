import { auth } from "@/auth";
import { listStudioClients } from "@/lib/studio";
import { produceRefMatch } from "@/lib/studio-refmatch";

// THE FULL SET. GET this to produce a complete reference-match funnel for the given brief - 1 masthead,
// 1 section-1, 3 sliders - and see them all with the copy, the deals and the SMS. THIS SPENDS (5 swaps +
// humaniser passes). Default brief is Mother's Day, per Gary.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const DEFAULT_BRIEF =
  "Mother's Day. Celebrate the mothers who hold families together. The emotional frame is sending love and " +
  "support to your mother through MoMo - money, airtime or data that reaches her safely, with zero transaction " +
  "fees. Warm, dignified, real South African mothers and their adult children. Not a giveaway, a considered act " +
  "of care.";

function esc(s: string) { return String(s).replace(/</g, "&lt;"); }

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("<h1>Sign in first.</h1>", { headers: { "content-type": "text/html" } });

  const brief = new URL(req.url).searchParams.get("brief") || DEFAULT_BRIEF;
  const clients = await listStudioClients().catch(() => []);
  const client = clients.find((c) => /momo/i.test(c.name)) || clients[0];
  if (!client) return new Response("<h1>No client.</h1>", { headers: { "content-type": "text/html" } });

  const t0 = Date.now();
  let out;
  try { out = await produceRefMatch(client.id, brief); }
  catch (e) { return html(`<h1>Failed</h1><pre style="color:#fca5a5;white-space:pre-wrap">${esc(String((e as Error)?.message || e))}</pre>`); }
  const secs = Math.round((Date.now() - t0) / 1000);
  const p = out.plan;

  const card = (c: typeof out.creatives[number]) => `
    <figure style="margin:0;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px">
      <figcaption style="font-size:12px;color:#9aa4b2;margin-bottom:8px">
        <b style="color:#e5e7eb;text-transform:uppercase">${c.kind}${c.kind === "slider" ? " " + (c.index + 1) : ""}</b>
        ${c.refName ? ` · from ${esc(c.refName)}` : ""}${c.headline ? ` · "${esc(c.headline)}"` : ""}
      </figcaption>
      ${c.url ? `<img src="${c.url}" style="width:100%;border-radius:8px;background:#000">` : `<p style="color:#fca5a5;font-size:13px">${esc(c.error || "no image")}</p>`}
    </figure>`;

  const mh = out.creatives.filter((c) => c.kind !== "slider");
  const sl = out.creatives.filter((c) => c.kind === "slider");

  return html(`
    <h1 style="font-size:20px">MoMo funnel set · ${secs}s</h1>
    <p style="color:#9aa4b2;margin-top:2px">Theme: <b style="color:#e5e7eb">${esc(p.theme)}</b></p>
    ${out.warnings.length ? `<div style="background:#3f2d1d;border:1px solid #7f5f1d;border-radius:8px;padding:10px;margin:10px 0;color:#fde68a;font-size:13px">${out.warnings.map(esc).join("<br>")}</div>` : ""}
    <h2 style="font-size:14px;color:#9aa4b2;margin:20px 0 8px">Masthead + Section 1 (transparent PNG, on black)</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${mh.map(card).join("")}</div>
    <h2 style="font-size:14px;color:#9aa4b2;margin:24px 0 8px">Sliders</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">${sl.map(card).join("")}</div>
    <h2 style="font-size:14px;color:#9aa4b2;margin:24px 0 8px">Copy</h2>
    <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:16px;font-size:14px;line-height:1.6">
      <p><b>Hero:</b> ${esc(p.webflow?.heroHeadline || "")}</p>
      <p><b>Section 1:</b> ${esc(p.webflow?.section1Headline || "")}<br><span style="color:#9aa4b2">${esc(p.webflow?.section1Body || "")}</span></p>
      <p style="margin-top:10px"><b>SMS:</b> <span style="font-family:monospace;font-size:13px">${esc(p.sms?.assembled || "")}</span> <span style="color:#9aa4b2">(${p.sms?.chars || 0} chars)</span></p>
      <p style="margin-top:10px"><b>Deals used:</b> ${sl.map((s, i) => `${i + 1}. ${esc(p.sliders?.[i]?.deal?.label || "")} ${esc(p.sliders?.[i]?.deal?.amount || "")}${esc(p.sliders?.[i]?.deal?.amountSuffix || "")} ${esc(p.sliders?.[i]?.deal?.price || "")}`).join(" &nbsp; ")}</p>
    </div>
    <p style="color:#64748b;font-size:12px;margin-top:16px">Reload to regenerate (this spends again). Change the brief with ?brief=...</p>
  `);
}

function html(body: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoMo set</title>` +
    `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f14;color:#e5e7eb;margin:0;padding:24px;max-width:1100px;margin:0 auto">${body}</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
