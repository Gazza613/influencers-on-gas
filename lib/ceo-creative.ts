import sharp from "sharp";
import { generateBatchDetailed } from "./vendors/higgsfield";
import { removeBackground } from "./vendors/fal";
import { cutoutToTransparent } from "./studio-cutout";
import { compositeLogo, tidyCallout } from "./studio-slider";
import { renderPng, fontFaceCss } from "./studio-render";
import { nameplateCss, nameplateHtml } from "./templates/momo-nameplate";
import { getBrandKit, listAssets, addAsset } from "./studio";
import { putBytes } from "./blob";
import { recordUsage } from "./usage";

// THE CEO CREATIVE - Kagiso Mothibi, forensically HIM, in every newsletter push (Gary).
//
// The face is never generated. We cut his REAL photo out of its studio background and composite it onto a MoMo
// navy field, with the article's line as the message, the MoMo logo, his name plate, and the compliance line.
// Everything typeset or composited by us; the only AI step is the BACKGROUND behind him, which carries no face
// and no text.
//
// THREE OUTPUTS (Gary: "give 3 output images, we will select the best"). Same forensic cut-out and layout on
// three different MoMo backdrops, so the team picks the strongest without spending three separate runs.

// Three backdrop directions. Abstract and branded, never a busy human scene - a clean studio cut-out sits
// naturally on a simple MoMo field and looks pasted on a crowded street. This is also how his real exec cards
// are built.
// THREE GENUINELY DIFFERENT PLACES (Gary: the first set were all much the same). One studio, one corporate
// interior, one with a view - so the choice is a real choice.
//
// NOTE ON BRANDING: we describe a modern corporate headquarters, never "the MTN building" with signage. An AI
// drawing MTN branding would be inventing a brand asset, which is the one thing we never do - the real logo is
// composited on afterwards.
const BACKDROPS = [
  // 1. Corporate studio - the clean, formal option that already works.
  "a premium deep navy studio backdrop with a soft top-lit gradient, clean, formal, corporate portrait lighting",
  // 2. Inside a modern corporate HQ.
  "the interior of a modern corporate headquarters office in Johannesburg: glass partitions, warm downlighting, " +
  "dark tones, softly out of focus at a shallow depth of field so it reads as a real place behind the subject",
  // 3. A skyline view, evening.
  "a modern executive office at dusk with floor-to-ceiling windows and a softly blurred Johannesburg city " +
  "skyline glowing beyond the glass, deep blue evening tones, shallow depth of field",
];

export type CeoCreative = { url: string; error?: string };

export async function buildCeoCreatives(
  clientId: string,
  opts: { message: string; name?: string; title?: string },
): Promise<{ creatives: CeoCreative[]; error: string | null }> {
  // 1. His real photo - THE LARGEST ONE ON FILE, not the most recent.
  //    listAssets returns newest-first, so taking photos[0] grabbed whichever was uploaded last. That picked a
  //    500x534 shot over a 1022x1533 one and scaled it ~1.9x to fill the frame, which is exactly why he came
  //    back pixelated (Gary). Resolution is the whole game for a CEO's face, so we choose on pixels.
  const photos = await listAssets(clientId, "ceo_photo");
  if (!photos.length) return { creatives: [], error: "No CEO photo on file. Upload one on the intake page first." };
  const sized = await Promise.all(photos.map(async (p) => {
    try {
      const m = await sharp(Buffer.from(new Uint8Array(await (await fetch(p.url)).arrayBuffer()))).metadata();
      return { p, h: m.height || 0, area: (m.width || 0) * (m.height || 0) };
    } catch { return { p, h: 0, area: 0 }; }
  }));
  const photo = sized.sort((a, b) => b.area - a.area)[0].p;

  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  // THE CEO POST CARRIES ONLY A SHORT AI DISCLOSURE, not the FSP compliance strip (Gary). This is a point of
  // view, not an advertisement, so FAIS s14 does not require the strip here - and a three-line legal band was
  // dominating a portrait. One short honest line, on the photograph, no bar.
  const legal = "AI-generated image";
  const name = (opts.name || "Kagiso Mothibi").trim();
  const title = (opts.title || "CEO, Fintech, MTN SA").trim();
  const message = tidyCallout(opts.message).split("/")[0].replace(/[,;]\s*$/, "").trim();
  const W = 1200, H = 1200;

  // 2. Cut him out ONCE with a PROPER matting model - fal BiRefNet - not luminance keying. A CEO cut-out has to
  //    be flawless (Gary: "not good, CEO will not approve"), and flood-fill left a ragged, haloed edge on his
  //    suit because his studio background is a grey gradient, not pure white. BiRefNet cuts hair and soft edges
  //    cleanly. Falls back to the flood-fill only if fal is unreachable, so a creative still comes back.
  //    CACHED. The matte is identical every time for a given photo, but re-running it cost up to 120s on EVERY
  //    render - a big part of why Gary watched a spinner for ten minutes. Cut once, store it, reuse forever.
  const cacheName = `cutout:${photo.id}`;
  const cached = (await listAssets(clientId, "ceo_cutout").catch(() => [])).find((a) => a.name === cacheName);
  let cut: Buffer;
  if (cached) {
    cut = Buffer.from(new Uint8Array(await (await fetch(cached.url)).arrayBuffer()));
  } else {
    const matted = await removeBackground(photo.url).catch(() => ({ url: null as string | null, error: "matting failed" }));
    if (matted.url) {
      cut = Buffer.from(new Uint8Array(await (await fetch(matted.url)).arrayBuffer()));
    } else {
      const raw = Buffer.from(new Uint8Array(await (await fetch(photo.url)).arrayBuffer()));
      const fb = await cutoutToTransparent(raw).catch(() => null);
      if (!fb) return { creatives: [], error: `Could not cut the CEO photo out (${matted.error || "no matting"}).` };
      cut = fb;
    }
    cut = await sharp(cut).trim().png().toBuffer(); // tighten to the subject before caching
    // Store it so every future render skips the matting entirely. Best effort: a failed cache write must never
    // fail the creative.
    try {
      const cutUrl = await putBytes(cut, `studio/${clientId}/ceo-cutout`, "png", "image/png");
      await addAsset(clientId, "ceo_cutout", cutUrl, cacheName, { source_photo: photo.id });
    } catch (e) { console.error("[ceo-creative] could not cache the cut-out:", e); }
  }

  // Size him to sit on the RIGHT, bottom-anchored. Right-aligned with a small right bleed so his left edge lands
  // clear of the message column, whatever his shoulder width.
  const cm = await sharp(cut).metadata();
  // NEVER UPSCALE HARD. Enlarging a small cut-out cannot add detail, it only softens his face - the pixelation
  // Gary saw. Allow a mild 1.15x at most, otherwise render him at his native size and let him sit slightly
  // smaller in frame. Crisp and smaller beats big and mushy on a CEO.
  const nativeH = cm.height || 0;
  const figH = Math.min(Math.round(H * 0.96), Math.round((nativeH || H) * 1.15)); // bigger presence (Gary)
  const figW = Math.round((cm.width || 800) * (figH / (nativeH || 1000)));
  const figureRaw = await sharp(cut).resize({ height: figH, kernel: "lanczos3" }).png().toBuffer();

  // BLEND HIM INTO THE SCENE. A hard cut-out on a generated backdrop reads as two separate pictures (Gary:
  // "looks detached"). Two cheap, physical fixes do most of the work:
  //   1. a CONTACT SHADOW - his own silhouette, blurred and dimmed, sitting behind and just off him. Without a
  //      shadow the eye reads a sticker; with one it reads a person standing in a room.
  //   2. a TONE MATCH - pull his saturation and brightness down a touch so he shares the backdrop's cooler,
  //      dimmer grade instead of popping like a brighter layer pasted on top.
  const figure = await sharp(figureRaw).modulate({ brightness: 0.94, saturation: 0.88 }).png().toBuffer();
  const shadowAlpha = await sharp(figureRaw).extractChannel(3).blur(30).linear(0.5, 0).toColourspace("b-w").toBuffer();
  const shadowBlack = await sharp({ create: { width: figW, height: figH, channels: 3, background: "#000000" } }).png().toBuffer();
  const shadow = await sharp(shadowBlack).joinChannel(shadowAlpha).png().toBuffer();
  // He sits a little further LEFT now (Gary), while his leftmost point still clears the message column so the
  // headline can never reach him. If he is wide, he bleeds further off the right edge instead.
  const figLeft = Math.max(Math.round(W * 0.45), W - figW);
  const figTop = H - figH;

  // 3. The foreground overlay - message (left), name plate (bottom-left), compliance (footer) - one render.
  const overlay = await renderCeoOverlay(W, H, message, name, title, legal, fonts);

  // 4. Three backdrops, then composite each: bg -> figure -> overlay -> logo.
  const prompts = BACKDROPS.map((d) =>
    `${d}. NO people, NO faces, NO text, NO lettering, NO numbers, NO logo, NO graphics of any kind - it is a ` +
    `plain branded BACKGROUND only. Leave the LEFT and LOWER-LEFT darker and calmer for a headline and a name ` +
    `plate; the RIGHT side can carry the light. Sharp, high resolution.`);
  const shots = await generateBatchDetailed(prompts, "nano_banana_pro", "1:1", { resolution: "2k" }, null);
  await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-backdrop", count: shots.length }).catch(() => {});

  // THE YELLOW LOGO for a dark field (Gary). The CEO backdrop is always deep navy, so pick the light-reading
  // lockup - yellow / white / reversed - not the navy-on-navy one that vanishes.
  const logos = (kit?.logos || []) as { name: string | null; url: string }[];
  const logoScore = (n: string) => {
    const s = (n || "").toLowerCase(); let v = 0;
    if (/yellow|white|reverse|reversed|light|mono.?white|on.?dark/.test(s)) v += 6;
    if (/navy|blue|black|dark|on.?light/.test(s)) v -= 5;
    if (/horiz|primary|full/.test(s)) v += 2;
    if (/stack|vert|icon|mark/.test(s)) v -= 2;
    return v;
  };
  const logo = [...logos].sort((a, b) => logoScore(b.name || "") - logoScore(a.name || ""))[0];
  const logoBuf = logo ? Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer())) : null;

  const creatives: CeoCreative[] = [];
  for (let i = 0; i < shots.length; i++) {
    try {
      const bgUrl = shots[i]?.url;
      // A generated backdrop is ideal; if one failed, fall back to a solid MoMo navy so we still return three.
      const bg = bgUrl
        ? await sharp(Buffer.from(new Uint8Array(await (await fetch(bgUrl)).arrayBuffer()))).resize(W, H, { fit: "cover" }).png().toBuffer()
        : await navyField(W, H);

      const x = Math.max(0, Math.min(figLeft, W - Math.round(figW * 0.5)));
      let out = await sharp(bg)
        .composite([
          // The contact shadow goes down FIRST, offset slightly left and down, so he sits IN the scene.
          { input: shadow, left: Math.max(0, x - Math.round(figW * 0.03)), top: Math.max(0, figTop + Math.round(figH * 0.012)) },
          { input: figure, left: x, top: figTop },
          { input: overlay, left: 0, top: 0 },
        ])
        .png().toBuffer();
      if (logoBuf) out = (await compositeLogo(out, logoBuf, { xPct: 4, yPct: 4, wPct: 24 })) as Buffer;

      const url = await putBytes(out, `studio/${clientId}/ceo-creative`, "png", "image/png");
      creatives.push({ url });
    } catch (e) {
      creatives.push({ url: "", error: String((e as Error)?.message || e).slice(0, 120) });
    }
  }
  const ok = creatives.filter((c) => c.url);
  return { creatives: ok.length ? creatives : [], error: ok.length ? null : "All three renders failed. Try again." };
}

// The message + name plate + compliance, as one transparent overlay. Left-aligned - the CEO sits on the right,
// so the words live in the calm negative space on the left.
async function renderCeoOverlay(W: number, H: number, message: string, name: string, title: string, legal: string, fonts: { family: string; url: string }[]): Promise<Buffer> {
  const esc = (t: string) => String(t || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // THE MESSAGE LIVES IN A LEFT COLUMN THAT NEVER REACHES HIM. His figure's leftmost is forced to >= 50% of the
  // width, so the column is capped at 42% and auto-sized so even the LONGEST WORD fits inside it - a long word
  // cannot break, so the type must shrink to the column rather than run under his shoulder (Gary).
  const colW = W * 0.37;
  const longestWord = Math.max(...message.split(/\s+/).map((w) => w.length), 1);
  const msgSize = Math.max(Math.round(H * 0.040), Math.min(Math.round(H * 0.072), Math.floor(colW / (longestWord * 0.60))));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* A soft dark wash on the left so white type reads whatever the backdrop does behind it. */
.wash{position:absolute;inset:0;background:linear-gradient(102deg, rgba(4,25,40,.85) 0%, rgba(4,25,40,.5) 30%, transparent 52%)}
/* No footer bar (Gary): the disclosure sits on the photograph itself. A soft bottom gradient keeps it
   readable over whatever the backdrop does, without becoming a band. */
.btm{position:absolute;left:0;right:0;bottom:0;height:16%;background:linear-gradient(to top, rgba(4,20,32,.72) 0%, transparent 100%)}
.msg{position:absolute;left:6%;top:17%;width:37%;color:#fff;font-family:'MTNBrighterSans',sans-serif;
  font-weight:800;font-size:${msgSize}px;line-height:1.06;letter-spacing:-1px;text-shadow:0 3px 18px rgba(0,0,0,.55)}
.plate{position:absolute;left:6.5%;bottom:12%}
${nameplateCss(0.42)}
/* One short line, small but readable, aligned under the name plate. */
.ai{position:absolute;left:6%;bottom:4.5%;font-family:'MTNBrighterSans',sans-serif;font-weight:600;
  letter-spacing:.4px;color:rgba(255,255,255,.78);font-size:${Math.round(H * 0.0155)}px;
  text-shadow:0 2px 8px rgba(0,0,0,.7)}
</style></head><body>
<div class="wash"></div>
<div class="btm"></div>
<div class="msg">${esc(message)}</div>
<div class="plate">${nameplateHtml(name, title)}</div>
<div class="ai">${esc(legal)}</div>
</body></html>`;
  const { png } = await renderPng({ html, width: W, height: H, scale: 1, transparent: true });
  return png;
}

// A plain MoMo navy gradient, used only as a fallback when a generated backdrop fails.
async function navyField(W: number, H: number): Promise<Buffer> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="#0e4a68"/><stop offset="1" stop-color="#04263a"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
