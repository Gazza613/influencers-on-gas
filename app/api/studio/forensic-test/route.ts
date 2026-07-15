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

  // No reference chosen: show the gallery so Gary can pick an index and see what he is working with.
  if (refIdx === null) {
    const cards = refs.map((r, i) =>
      `<figure><img src="${r.url}" loading="lazy"><figcaption>#${i} ${(r.name || "").slice(0, 40)}</figcaption></figure>`,
    ).join("");
    return page(
      `<h1>Forensic swap test - ${client.name}</h1>` +
      `<p>Pick a reference below, then load: <code>?ref=NUMBER&person=WHAT YOU WANT</code><br>` +
      `e.g. <a href="?ref=0&person=a smiling middle-aged South African woman in a mustard jumper">?ref=0&person=a smiling middle-aged South African woman in a mustard jumper</a></p>` +
      `<p style="color:#9aa4b2">Each run spends one image. It changes only the person and should leave every other pixel of the design where it is.</p>` +
      `<div class="grid">${cards}</div>`,
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
    `<p style="margin-top:16px"><a href="?ref=${idx}&person=${encodeURIComponent(person)}">Rerun</a> &nbsp;·&nbsp; <a href="?">Back to the gallery</a></p>`,
  );
}
