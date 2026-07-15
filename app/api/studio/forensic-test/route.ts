import { auth } from "@/auth";
import { listStudioClients, listAssets } from "@/lib/studio";
import { forensicPersonSwap } from "@/lib/vendors/higgsfield";
import { recordUsage } from "@/lib/usage";

// STEP 1 OF THE REFERENCE-MATCH STUDIO: a viewable fidelity gate, before any UI is built on top.
//
// This is deliberately a throwaway test surface. It exists to answer ONE question with your own eyes: when
// nano_banana_pro swaps the person in a finished MoMo advert, does the rest of the design - logo, legal,
// disc, type, layout - stay put? Gary judges that from a side-by-side, not me from a claim.
//
//   GET /api/studio/forensic-test
//       -> lists the client's references with an index, so you can see what is available.
//   GET /api/studio/forensic-test?ref=3&person=a smiling young woman in a yellow top
//       -> runs ONE swap on reference #3 and shows reference | result side by side. THIS SPENDS (1 image).
//
// It renders plain HTML with two <img> tags - no Chromium, so it cannot fail for a rendering reason. If the
// swap fails, the failure is printed, not swallowed.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function page(body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Forensic swap test</title>` +
    `<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0b0f14;color:#e5e7eb;padding:24px}` +
    `h1{font-size:18px}h2{font-size:14px;color:#9aa4b2;font-weight:600;margin:0 0 8px}a{color:#8ab4ff}` +
    `.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:16px}` +
    `.grid figure{margin:0}.grid img{width:100%;border-radius:8px;border:1px solid #1f2937;display:block}` +
    `.grid figcaption{font-size:11px;color:#9aa4b2;margin-top:4px}` +
    `.cmp{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}` +
    `.cmp img{width:100%;border-radius:10px;border:1px solid #1f2937}` +
    `.err{background:#3f1d1d;border:1px solid #7f1d1d;border-radius:8px;padding:12px;color:#fecaca;white-space:pre-wrap}` +
    `code{background:#111827;padding:1px 5px;border-radius:4px}</style>${body}`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return page(`<h1>Sign in first.</h1>`);

  const u = new URL(req.url);
  const clients = await listStudioClients().catch(() => []);
  const client = clients.find((c) => /momo/i.test(c.name)) || clients[0];
  if (!client) return page(`<h1>No client with a brand kit.</h1>`);

  const refs = (await listAssets(client.id, "reference").catch(() => []));
  if (!refs.length) return page(`<h1>${client.name} has no reference images uploaded.</h1>`);

  const refIdx = u.searchParams.get("ref");
  const person = (u.searchParams.get("person") || "").trim();

  // No reference chosen: show the gallery. CLICK a reference to run the swap - Gary should never have to hand-
  // edit a URL. The person box carries whatever he types straight into the click.
  if (refIdx === null) {
    const cards = refs.map((r, i) =>
      `<button class="card" onclick="run(${i})">` +
      `<img src="${r.url}" loading="lazy"><span>#${i} ${(r.name || "").slice(0, 40)}</span></button>`,
    ).join("");
    return page(
      `<h1>Forensic swap test - ${client.name}</h1>` +
      `<p style="color:#9aa4b2">Type who you want in the picture, then CLICK a design to swap the person into it. ` +
      `Each click spends one image. Everything except the person should stay exactly where it is.</p>` +
      `<label style="display:block;margin:14px 0 6px;font-size:13px;color:#9aa4b2">Who should be in the picture?</label>` +
      `<input id="person" value="a smiling middle-aged South African woman in a mustard jumper" ` +
      `style="width:100%;max-width:640px;padding:11px 13px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:15px">` +
      `<div class="grid">${cards}</div>` +
      `<script>function run(i){var p=encodeURIComponent(document.getElementById('person').value||'a smiling person');` +
      `document.body.style.opacity=.5;location.href='?ref='+i+'&person='+p;}</script>` +
      `<style>.card{all:unset;cursor:pointer;display:block}.card img{width:100%;border-radius:8px;border:1px solid #1f2937;transition:border-color .12s}` +
      `.card:hover img{border-color:#8ab4ff}.card span{display:block;font-size:11px;color:#9aa4b2;margin-top:4px}</style>`,
    );
  }

  const idx = Number(refIdx);
  const ref = refs[idx];
  if (!ref) return page(`<h1>No reference #${refIdx}.</h1><p><a href="?">Back to the gallery</a></p>`);
  if (!person) return page(`<h1>Add a person.</h1><p><code>?ref=${idx}&person=a smiling young woman</code></p>`);

  const t0 = Date.now();
  const { url, error } = await forensicPersonSwap(ref.url, person, { ratio: "1:1", resolution: "2k" });
  await recordUsage({ clientId: client.id, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "forensic-swap-test", count: 1 }).catch(() => {});
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  if (!url) {
    return page(`<h1>The swap failed (${secs}s)</h1><div class="err">${(error || "no url and no error").replace(/</g, "&lt;")}</div>` +
      `<p><a href="?">Back to the gallery</a></p>`);
  }

  return page(
    `<h1>Forensic swap - reference #${idx} - ${secs}s</h1>` +
    `<p style="color:#9aa4b2">Person: "${person.replace(/</g, "&lt;")}". The right image should differ from the left ONLY in the person. ` +
    `Check the logo, the legal strip, the disc and any text are unchanged.</p>` +
    `<div class="cmp">` +
    `<figure style="margin:0"><h2>REFERENCE (your design)</h2><img src="${ref.url}"></figure>` +
    `<figure style="margin:0"><h2>RESULT (person swapped)</h2><img src="${url}"></figure>` +
    `</div>` +
    `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">` +
    `<input id="person" value="${person.replace(/"/g, "&quot;")}" style="flex:1;min-width:280px;padding:10px 12px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:14px">` +
    `<button onclick="go()" style="padding:10px 18px;border-radius:9px;border:0;background:#8ab4ff;color:#0b0f14;font-weight:700;cursor:pointer">Run again</button>` +
    `<a href="?" style="padding:10px 4px">Back to the gallery</a></div>` +
    `<script>function go(){var p=encodeURIComponent(document.getElementById('person').value||'a person');document.body.style.opacity=.5;location.href='?ref=${idx}&person='+p;}</script>`,
  );
}
