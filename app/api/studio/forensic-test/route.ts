import sharp from "sharp";
import { auth } from "@/auth";
import { listStudioClients, listAssets } from "@/lib/studio";
import { forensicSwap, stripPerson } from "@/lib/vendors/higgsfield";
import { applyReferenceAlpha, onBackground } from "@/lib/studio-cutout";
import { putBytes } from "@/lib/blob";
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

// Map a reference's real dimensions to the nearest aspect the image model accepts, so we generate at the
// masthead's 4:3 (1080x811) rather than square-then-squish. The final PNG is written at the exact reference
// pixel size regardless; this just avoids distorting the person to get there.
function nearestRatio(w: number, h: number): string {
  const t = w / h;
  const opts: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["2:3", 2 / 3], ["16:9", 16 / 9], ["9:16", 9 / 16]];
  return opts.reduce((best, o) => (Math.abs(o[1] - t) < Math.abs(best[1] - t) ? o : best))[0];
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
  const scene = (u.searchParams.get("scene") || "").trim();
  // "disc" keeps the yellow disc + dark background (masthead / section 1); "scene" changes the setting (slider).
  const construction = u.searchParams.get("disc") === "1" ? "disc" : "scene";
  const strip = u.searchParams.get("strip") === "1";  // remove the person, show the empty set

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
      `<label style="display:block;margin:14px 0 6px;font-size:13px;color:#9aa4b2">Who should be in the picture? (lifestyle)</label>` +
      `<input id="person" value="a smiling middle-aged South African woman in a mustard jumper" ` +
      `style="width:100%;max-width:640px;padding:11px 13px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:15px">` +
      `<label style="display:block;margin:12px 0 6px;font-size:13px;color:#9aa4b2">Where are they? (scenery - leave blank to keep it natural)</label>` +
      `<input id="scene" placeholder="e.g. a warm township kitchen on a winter morning" ` +
      `style="width:100%;max-width:640px;padding:11px 13px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:15px">` +
      `<label style="display:flex;gap:8px;align-items:center;margin:12px 0 2px;font-size:14px;color:#e5e7eb;cursor:pointer">` +
      `<input type="checkbox" id="disc" style="width:17px;height:17px"> This is a Masthead / Section 1 - keep the yellow disc and dark background, do not change the scene</label>` +
      `<label style="display:flex;gap:8px;align-items:center;margin:8px 0 2px;font-size:14px;color:#facc15;cursor:pointer">` +
      `<input type="checkbox" id="strip" style="width:17px;height:17px"> Just REMOVE the person and show me the empty set (the furniture-only design)</label>` +
      `<div class="grid">${cards}</div>` +
      `<script>function run(i){var p=encodeURIComponent(document.getElementById('person').value||'a smiling person');` +
      `var s=encodeURIComponent(document.getElementById('scene').value||'');` +
      `var d=document.getElementById('disc').checked?'1':'0';var st=document.getElementById('strip').checked?'1':'0';` +
      `document.body.style.opacity=.5;location.href='?ref='+i+'&person='+p+'&scene='+s+'&disc='+d+'&strip='+st;}</script>` +
      `<style>.card{all:unset;cursor:pointer;display:block}.card img{width:100%;border-radius:8px;border:1px solid #1f2937;transition:border-color .12s}` +
      `.card:hover img{border-color:#8ab4ff}.card span{display:block;font-size:11px;color:#9aa4b2;margin-top:4px}</style>`,
    );
  }

  const idx = Number(refIdx);
  const ref = refs[idx];
  if (!ref) return page(`<h1>No reference #${refIdx}.</h1><p><a href="?">Back to the gallery</a></p>`);
  if (!person) return page(`<h1>Add a person.</h1><p><code>?ref=${idx}&person=a smiling young woman</code></p>`);

  // STRIP MODE: remove the person and show the empty set, to prove we can derive the furniture-only design
  // from a finished reference ourselves.
  if (strip) {
    const t = Date.now();
    const { url: empty, error: e } = await stripPerson(ref.url, { ratio: "1:1", resolution: "4k" });
    await recordUsage({ clientId: client.id, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "strip-person-test", count: 1 }).catch(() => {});
    const s2 = ((Date.now() - t) / 1000).toFixed(0);
    if (!empty) return page(`<h1>Strip failed (${s2}s)</h1><div class="err">${(e || "no url").replace(/</g, "&lt;")}</div><p><a href="?">Back</a></p>`);
    return page(
      `<h1>Empty set - person removed from #${idx} - ${s2}s</h1>` +
      `<p style="color:#9aa4b2">This is me deriving the furniture-only design MYSELF from your reference. ` +
      `Judge whether the disc rebuilt cleanly and the bubbles / swish / callout stayed put. If yes, we never ` +
      `need a person-hidden export from your team.</p>` +
      `<div class="cmp">` +
      `<figure style="margin:0"><h2>REFERENCE (with person)</h2><img src="${ref.url}"></figure>` +
      `<figure style="margin:0"><h2>EMPTY SET (person removed by me)</h2><img src="${empty}"></figure>` +
      `</div><p style="margin-top:14px"><a href="?">Back to the gallery</a></p>`,
    );
  }

  // IS THE REFERENCE A TRANSPARENT PNG? If so it is a masthead/section-1 and the output MUST end up transparent,
  // regardless of any checkbox. This is detected, not left to the user - the last run failed precisely because
  // the checkbox was off, so it ran the slider path and skipped the mask. A transparent reference also forces
  // the disc construction (keep the disc, don't invent a scene).
  const refBuf = await fetch(ref.url).then((x) => x.arrayBuffer()).then((b) => Buffer.from(b)).catch(() => null);
  let refTransparent = false, refW = 1080, refH = 1080;
  if (refBuf) {
    const m = await sharp(refBuf).metadata().catch(() => null);
    if (m) {
      refW = m.width || refW; refH = m.height || refH;
      if (m.hasAlpha) {
        const { data, info } = await sharp(refBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 3; i < data.length; i += info.channels) { if (data[i] < 250) { refTransparent = true; break; } }
      }
    }
  }
  const effective = refTransparent ? "disc" : construction;
  // Generate at the reference's OWN aspect, not always square. A masthead is 1080x811 (4:3); generating 1:1 and
  // fitting it squished the person and changed the size. The final PNG is then written at the reference's exact
  // pixel dimensions.
  const ratio = nearestRatio(refW, refH);

  const t0 = Date.now();
  // 4K + humaniser pass, per Gary: clarity must match the reference and the skin must read real. The humanise
  // pass is a second image, so this run meters 2.
  const { url, rawUrl, error, humanised } = await forensicSwap(ref.url, { person, scene, construction: effective, ratio, resolution: "4k", humanise: true });
  await recordUsage({ clientId: client.id, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "forensic-swap-test", count: humanised ? 2 : 1 }).catch(() => {});
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  if (!url) {
    return page(`<h1>The swap failed (${secs}s)</h1><div class="err">${(error || "no url and no error").replace(/</g, "&lt;")}</div>` +
      `<p><a href="?">Back to the gallery</a></p>`);
  }

  // MASTHEAD/SECTION-1 must be TRANSPARENT. The swap comes back opaque (an invented surround); stamp the
  // reference's own alpha onto it so the surround becomes transparent again, then preview on the funnel navy.
  // Failures are SHOWN, not swallowed - a silent fallback to the opaque result is exactly why the last run
  // looked like nothing had happened.
  let shown = url;
  let transparentUrl: string | null = null;
  let maskNote = refTransparent ? "" : "reference is opaque (a slider) - left full-bleed, no transparency needed";
  if (refTransparent && refBuf) {
    try {
      const resBuf = await fetch(url).then((x) => x.arrayBuffer()).then((b) => Buffer.from(b));
      const transparent = await applyReferenceAlpha(resBuf, refBuf);
      // Verify the surround actually became transparent - if not, say so loudly.
      const { data, info } = await sharp(transparent).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let transp = 0, tot = 0;
      for (let i = 3; i < data.length; i += info.channels) { tot++; if (data[i] < 20) transp++; }
      const pct = Math.round((transp / tot) * 100);
      transparentUrl = await putBytes(transparent, `studio/${client.id}/masthead`, "png", "image/png");
      // Show the transparent PNG on BLACK, per Gary - so any edge bleed on the transparent surround is visible,
      // rather than hidden against the navy preview.
      const black = await onBackground(transparent, "#000000");
      shown = await putBytes(black, `studio/${client.id}/masthead-preview`, "png", "image/png");
      maskNote = `masked to transparent using the reference's own alpha (${pct}% of the frame is now transparent) · shown on black so bleeds are visible`;
    } catch (e) {
      maskNote = `TRANSPARENCY STEP FAILED: ${String((e as Error)?.message || e).slice(0, 160)}`;
    }
  }
  const sceneLine = refTransparent ? " · masthead, on funnel navy" : (scene ? ` · scene: "${scene.replace(/</g, "&lt;")}"` : " · scene kept natural");
  return page(
    `<h1>Forensic swap - reference #${idx} - ${secs}s${humanised ? " · humanised" : ""}</h1>` +
    `<p style="color:#9aa4b2">Lifestyle: "${person.replace(/</g, "&lt;")}"${sceneLine}. ` +
    `The swish, the logo and the callouts should be unchanged. The person and the scene are meant to differ. ` +
    `Judge the skin, the clarity, and whether the brand furniture held.</p>` +
    (maskNote ? `<p style="color:${maskNote.startsWith("TRANSPARENCY STEP FAILED")?"#fca5a5":"#86efac"};font-size:13px;margin:-4px 0 8px">${maskNote}</p>` : "") +
    `<div class="cmp">` +
    `<figure style="margin:0"><h2>REFERENCE (your design)</h2><img src="${ref.url}"></figure>` +
    `<figure style="margin:0"><h2>RESULT (4K${humanised ? " + humaniser" : ""})</h2><img src="${shown}"></figure>` +
    `</div>` +
    (transparentUrl ? `<p style="margin-top:8px;font-size:12px"><a href="${transparentUrl}" target="_blank">download the transparent PNG</a> (this is what embeds into the funnel column)</p>` : "") +
    (rawUrl && rawUrl !== url ? `<p style="margin-top:6px;font-size:12px"><a href="${rawUrl}" target="_blank">view the pre-humaniser version</a></p>` : "") +
    `<div style="margin-top:16px;display:grid;gap:8px;max-width:680px">` +
    `<input id="person" value="${person.replace(/"/g, "&quot;")}" placeholder="lifestyle" style="padding:10px 12px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:14px">` +
    `<input id="scene" value="${scene.replace(/"/g, "&quot;")}" placeholder="scenery (blank = natural)" style="padding:10px 12px;border-radius:9px;border:1px solid #2b3646;background:#111827;color:#e5e7eb;font-size:14px">` +
    `<div style="display:flex;gap:8px;align-items:center"><button onclick="go()" style="padding:10px 18px;border-radius:9px;border:0;background:#8ab4ff;color:#0b0f14;font-weight:700;cursor:pointer">Run again</button>` +
    `<a href="?" style="padding:10px 4px">Back to the gallery</a></div></div>` +
    `<script>function go(){var p=encodeURIComponent(document.getElementById('person').value||'a person');` +
    `var s=encodeURIComponent(document.getElementById('scene').value||'');` +
    `document.body.style.opacity=.5;location.href='?ref=${idx}&person='+p+'&scene='+s+'&disc=${construction === 'disc' ? '1' : '0'}';}</script>`,
  );
}
