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

// THE CEO CREATIVE - the client's real CEO, forensically THEM, in every newsletter push (Gary).
//
// The face is never generated. We cut their REAL photo out of its background and composite it onto a BRANDED
// field, with the article's line as the message, the client's logo, a name plate, and a compliance line.
// Everything typeset or composited by us; the only AI step is the BACKGROUND behind them, which carries no face
// and no text.
//
// BRAND-DRIVEN, not one-client. This began as a MoMo-only builder - navy field, white type - and would have
// put GAS's fintech look on a life insurer if pointed at BrightRock. The design now comes from a per-brand
// CeoDesign: MoMo keeps its exact navy-and-white, BrightRock gets a light editorial charcoal-and-gold, and the
// next client gets its own rather than borrowing MoMo's. Only the DESIGN changes; the plumbing - the forensic
// cut-out, the caching, the figure blend, the three-backdrop spread - is shared.

// The whole visual identity of a CEO creative, per brand. A light design and a dark design fail in opposite
// places, so nearly every value here has a light/dark consequence and the two brands set them differently.
type CeoDesign = {
  scheme: "light" | "dark";     // drives text colour, the scrim direction and the figure tone-match
  field: string;                // fallback field SVG gradient stops, used when a backdrop fails
  textColor: string;            // headline, nameplate
  subColor: string;             // title line
  accent: string;               // the hairline rules and the mark
  fspColor: string;             // the compliance line, quietest thing on the canvas
  backdrops: string[];          // three AI backdrop prompts, in the brand's own light/dark register
  logoPrefersLight: boolean;    // true = pick a light-reading logo (for a dark field), false = a dark one
  compliance: string;           // the exact regulated line, or "" for just the AI disclosure
};

const MOMO_DESIGN: CeoDesign = {
  scheme: "dark",
  field: "#0e4a68|#04263a",
  textColor: "#ffffff",
  subColor: "rgba(255,255,255,.82)",
  accent: "#F9CB0F",
  fspColor: "rgba(255,255,255,.78)",
  // The original three: a clean studio, a corporate HQ, a dusk skyline - all deep navy so white type reads.
  backdrops: [
    "a premium deep navy studio backdrop with a soft top-lit gradient, clean, formal, corporate portrait lighting",
    "the interior of a modern corporate headquarters office in Johannesburg: glass partitions, warm downlighting, " +
    "dark tones, softly out of focus at a shallow depth of field so it reads as a real place behind the subject",
    "a modern executive office at dusk with floor-to-ceiling windows and a softly blurred Johannesburg city " +
    "skyline glowing beyond the glass, deep blue evening tones, shallow depth of field",
  ],
  logoPrefersLight: true,
  compliance: "",   // MoMo carries only the AI disclosure - a point of view, not an FSP advertisement
};

// BrightRock: the light editorial look proven before this was built. Charcoal on a warm-white field, a single
// gold hairline drawn from the dot on their own "i", and the FSP licence line because they are a licensed
// insurer and a post showing their name may carry it. The opposite of MoMo at every turn, on purpose.
const BRIGHTROCK_DESIGN: CeoDesign = {
  scheme: "light",
  field: "#f7f6f4|#e4e1dc",
  textColor: "#2b2b2b",
  subColor: "#3a3a3a",
  accent: "#f0a818",
  fspColor: "#8a8781",
  // LIGHT and human, never navy - a calm, permanent, trustworthy register for a life insurer, not fintech energy.
  backdrops: [
    "a clean, bright, softly-lit studio backdrop in warm off-white and pale grey, a gentle top-light gradient, " +
    "calm and premium, corporate portrait lighting",
    "the interior of a bright modern insurance-company office in Cape Town: pale walls, warm natural daylight, " +
    "soft neutral tones, softly out of focus at a shallow depth of field so it reads as a real place",
    "a light, airy modern office with large windows and soft daylight, warm neutral and pale-grey tones, a hint " +
    "of warm gold in the light, shallow depth of field, calm and reassuring",
  ],
  logoPrefersLight: false,   // the charcoal wordmark, for a light field
  compliance: "BrightRock Life Ltd is a licensed financial services provider and life insurer. FSP 11643.",
};

// Which design a brain gets. Keyed by client_id, defaulting to MoMo's scheme so nothing that predates this
// changes. A future client is added here with its own CeoDesign.
const MOMO_ID = "e44295d7-dc10-4422-bede-4e9ddcad7b2d";
const BRIGHTROCK_ID = "dfc2efbf-7949-428b-a34d-1c5e92b88875";
function designFor(clientId: string): CeoDesign {
  if (clientId === BRIGHTROCK_ID) return BRIGHTROCK_DESIGN;
  return MOMO_DESIGN;
}

export type CeoCreative = { url: string; error?: string };

export async function buildCeoCreatives(
  clientId: string,
  opts: { message: string; name?: string; title?: string },
): Promise<{ creatives: CeoCreative[]; error: string | null }> {
  const design = designFor(clientId);
  // 1. His real photo. VARIED, not always the same one (Gary: "does Kagiso always have to be wearing the same
  //    clothes - this will make the post very stale").
  //
  //    The wardrobe can only vary as far as the PHOTOS vary: we composite his real cut-out, so changing his
  //    jacket or shirt would mean an AI altering a real executive's appearance, which forfeits the whole
  //    forensic guarantee. So variety comes from real photographs - upload him in a few outfits and the system
  //    rotates through them.
  //
  //    Resolution still gates the choice, because a soft face is worse than a repeated jacket: only photos
  //    within reach of the largest are eligible, then we rotate among those so successive posts differ.
  const photos = await listAssets(clientId, "ceo_photo");
  if (!photos.length) return { creatives: [], error: "No CEO photo on file. Upload one on the intake page first." };
  const sized = await Promise.all(photos.map(async (p) => {
    try {
      const m = await sharp(Buffer.from(new Uint8Array(await (await fetch(p.url)).arrayBuffer()))).metadata();
      return { p, h: m.height || 0, area: (m.width || 0) * (m.height || 0) };
    } catch { return { p, h: 0, area: 0 }; }
  }));
  const ranked = sized.sort((a, b) => b.area - a.area);
  const best = ranked[0];
  // Anything at least 70% of the best photo's area is good enough to use, so a decent second outfit is not
  // discarded just for being slightly smaller.
  const eligible = ranked.filter((r) => r.area >= best.area * 0.7);
  const photo = eligible[Math.floor(Date.now() / 60000) % eligible.length].p;

  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  // THE CEO POST CARRIES ONLY A SHORT AI DISCLOSURE, not the FSP compliance strip (Gary). This is a point of
  // view, not an advertisement, so FAIS s14 does not require the strip here - and a three-line legal band was
  // dominating a portrait. One short honest line, on the photograph, no bar.
  const legal = "AI-generated image";
  // NO DEFAULT IDENTITY. These used to fall back to "Kagiso Mothibi" and "CEO, Fintech, MTN SA", so any brain
  // that did not pass a name got MoMo's CEO printed on its nameplate - and the creative route never passed one.
  // A missing name is now a refusal, because a creative published under the wrong person's name is worse than
  // no creative at all.
  const name = (opts.name || "").trim();
  const title = (opts.title || "").trim();
  if (!name || !title) {
    return { creatives: [], error: "This brain has no CEO name and title set, so there is nobody to attribute the creative to." };
  }
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
    // ALREADY CUT OUT? Use it as-is. A photo supplied on a clean background is often already a proper matte
    // (Suzanne's was 57% transparent), and re-matting an already-transparent image through BiRefNet FRAYS the
    // edge it should have left alone - the ragged outline Gary saw. If a good alpha channel is already present,
    // the best cut-out is the one we were given.
    const rawPhoto = Buffer.from(new Uint8Array(await (await fetch(photo.url)).arrayBuffer()));
    const meta = await sharp(rawPhoto).metadata();
    let transparentFrac = 0;
    if (meta.hasAlpha) {
      const { data, info } = await sharp(rawPhoto).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
      let clear = 0; for (let i = 0; i < data.length; i++) if (data[i] < 16) clear++;
      transparentFrac = clear / (info.width * info.height);
    }
    if (transparentFrac > 0.12) {
      // Genuinely pre-cut. Skip fal entirely - no spend, no fraying.
      cut = rawPhoto;
    } else {
    const matted = await removeBackground(photo.url).catch(() => ({ url: null as string | null, error: "matting failed" }));
    // METER IT. This is a paid fal call and it was going unrecorded, so the Journalist's desk under-reported
    // every CEO creative it produced. Recorded INSIDE the cache miss, never on a cache hit, because a hit
    // spends nothing. Best effort - a cost write must not fail the creative.
    await recordUsage({ clientId, provider: "fal", model: "fal-ai/birefnet/v2", unit: "image", action: "ceo-cutout", count: 1 }).catch(() => {});
    if (matted.url) {
      cut = Buffer.from(new Uint8Array(await (await fetch(matted.url)).arrayBuffer()));
    } else {
      const raw = Buffer.from(new Uint8Array(await (await fetch(photo.url)).arrayBuffer()));
      const fb = await cutoutToTransparent(raw).catch(() => null);
      if (!fb) return { creatives: [], error: `Could not cut the CEO photo out (${matted.error || "no matting"}).` };
      cut = fb;
    }
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
  // A LIGHT design needs the figure a touch smaller and pushed further right: on a light field the message and
  // the nameplate live in the negative space, and a figure at MoMo's near-full-bleed size would crowd them.
  const figScale = design.scheme === "light" ? 0.82 : 0.96;
  const figH = Math.min(Math.round(H * figScale), Math.round((nativeH || H) * 1.15));
  const figW = Math.round((cm.width || 800) * (figH / (nativeH || 1000)));
  const figureRaw = await sharp(cut).resize({ height: figH, kernel: "lanczos3" }).png().toBuffer();

  // BLEND HIM INTO THE SCENE. A hard cut-out on a generated backdrop reads as two separate pictures (Gary:
  // "looks detached"). Two cheap, physical fixes do most of the work:
  //   1. a CONTACT SHADOW - their own silhouette, blurred and dimmed, sitting behind and just off them.
  //   2. a TONE MATCH - pull saturation and brightness so they share the backdrop's grade. On a LIGHT field a
  //      near-black grade would over-darken the figure and a heavy shadow would smudge; both are lightened.
  const tone = design.scheme === "light" ? { brightness: 1.0, saturation: 1.0 } : { brightness: 0.94, saturation: 0.88 };
  const shadowGain = design.scheme === "light" ? 0.42 : 0.5;
  const figure = await sharp(figureRaw).modulate(tone).png().toBuffer();
  const shadowAlpha = await sharp(figureRaw).extractChannel(3).blur(design.scheme === "light" ? 26 : 30).linear(shadowGain, 0).toColourspace("b-w").toBuffer();
  const shadowBlack = await sharp({ create: { width: figW, height: figH, channels: 3, background: "#000000" } }).png().toBuffer();
  const shadow = await sharp(shadowBlack).joinChannel(shadowAlpha).png().toBuffer();
  // WHERE THE FIGURE SITS, bottom-anchored, leftmost point clearing the message column so the headline never
  // reaches it.
  //   - DARK (MoMo): a small RIGHT BLEED - the figure runs off the right edge, which suits a full-bleed navy
  //     composition. Floor 45%.
  //   - LIGHT (BrightRock): she must sit WHOLE, not cut off (Gary). Right-align her against a small right
  //     margin so the whole person is in frame, and only fall back to the 48% floor if she is so wide that
  //     keeping her whole would cross into the text column - in which case the figure was over-scaled upstream.
  let figLeft: number;
  if (design.scheme === "light") {
    const rightMargin = Math.round(W * 0.03);
    figLeft = Math.max(Math.round(W * 0.48), W - figW - rightMargin);
  } else {
    figLeft = Math.max(Math.round(W * 0.45), W - figW);
  }
  const figTop = H - figH;

  // 3. The foreground overlay - message, name plate, compliance, logo, mark - one render, in the brand's design.
  const overlay = await renderCeoOverlay(W, H, message, name, title, legal, fonts, design);

  // 4. The three fields.
  //
  //   - DARK (MoMo): AI-generated navy backdrops - studio, HQ, dusk - which give a rich, real depth behind him.
  //   - LIGHT (BrightRock): DESIGNED gradient fields, NOT AI. Gary asked for "no background, corporate", and an
  //     AI office for a light insurer came back flat and cheap while WASHING HER OUT - a light figure on a
  //     light AI field with no tonal control disappears. A designed field guarantees the one thing that fixes
  //     that: a soft deepening behind and below her so she always separates from the background. It is also
  //     cleaner, more corporate, and costs no generation. Three subtle variants so the team still picks from
  //     three.
  let shots: { url: string | null }[];
  if (design.scheme === "light") {
    shots = [{ url: null }, { url: null }, { url: null }]; // designed per-index in the composite loop
  } else {
    const prompts = design.backdrops.map((d) =>
      `${d}. NO people, NO faces, NO text, NO lettering, NO numbers, NO logo, NO graphics of any kind - it is a ` +
      `plain branded BACKGROUND only. Leave the LEFT and LOWER-LEFT calmer for a headline and a name plate; the ` +
      `RIGHT side can carry the light. Sharp, high resolution.`);
    shots = await generateBatchDetailed(prompts, "nano_banana_pro", "1:1", { resolution: "2k" }, null);
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-backdrop", count: shots.length }).catch(() => {});
  }

  // The logo lockup that reads on THIS field. A dark field wants the light/reversed mark; a light field wants
  // the dark one. logoPrefersLight flips the whole score, so the same picker serves both.
  const logos = (kit?.logos || []) as { name: string | null; url: string }[];
  const logoScore = (n: string) => {
    const s = (n || "").toLowerCase(); let v = 0;
    const light = /yellow|white|reverse|reversed|light|mono.?white|on.?dark/.test(s);
    const dark = /navy|blue|black|charcoal|dark|mono.?black|on.?light/.test(s);
    if (light) v += design.logoPrefersLight ? 6 : -5;
    if (dark) v += design.logoPrefersLight ? -5 : 6;
    if (/horiz|primary|full|wordmark/.test(s)) v += 2;
    if (/stack|vert|icon|mark/.test(s)) v -= 2;
    return v;
  };
  const logo = [...logos].sort((a, b) => logoScore(b.name || "") - logoScore(a.name || ""))[0];
  const logoBuf = logo ? Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer())) : null;

  const creatives: CeoCreative[] = [];
  for (let i = 0; i < shots.length; i++) {
    try {
      const bgUrl = shots[i]?.url;
      // LIGHT: a designed field with a soft deepening where she stands, so she separates. Three subtle variants.
      // DARK: the AI backdrop, or the brand field as a fallback.
      const bg = design.scheme === "light"
        ? await lightField(W, H, i)
        : bgUrl
          ? await sharp(Buffer.from(new Uint8Array(await (await fetch(bgUrl)).arrayBuffer()))).resize(W, H, { fit: "cover" }).png().toBuffer()
          : await brandField(W, H, design.field);

      // DARK allows up to a 50% right bleed; LIGHT keeps her whole - clamp so her right edge stays on-canvas.
      const x = design.scheme === "light"
        ? Math.max(0, Math.min(figLeft, W - figW))
        : Math.max(0, Math.min(figLeft, W - Math.round(figW * 0.5)));
      let out = await sharp(bg)
        .composite([
          // The contact shadow goes down FIRST, offset slightly left and down, so he sits IN the scene.
          { input: shadow, left: Math.max(0, x - Math.round(figW * 0.03)), top: Math.max(0, figTop + Math.round(figH * 0.012)) },
          { input: figure, left: x, top: figTop },
          { input: overlay, left: 0, top: 0 },
        ])
        .png().toBuffer();
      if (logoBuf) out = (await compositeLogo(out, logoBuf, { xPct: 5, yPct: 5, wPct: design.scheme === "light" ? 20 : 24 })) as Buffer;

      const url = await putBytes(out, `studio/${clientId}/ceo-creative`, "png", "image/png");
      creatives.push({ url });
    } catch (e) {
      creatives.push({ url: "", error: String((e as Error)?.message || e).slice(0, 120) });
    }
  }
  const ok = creatives.filter((c) => c.url);
  return { creatives: ok.length ? creatives : [], error: ok.length ? null : "All three renders failed. Try again." };
}

// The message + name plate + compliance, as one transparent overlay, in the brand's design. Left-aligned - the
// CEO sits on the right, so the words live in the calm negative space on the left.
//
// A LIGHT design takes a different overlay entirely, not a recoloured MoMo one. On a light field, white type
// and a dark wash would be inverted nonsense, and the biggest lesson from the proof was that charcoal text
// vanishes wherever the dark suit sits - so the light overlay carries its OWN light scrim to guarantee a clean
// backing for the text, which the dark design gets for free.
async function renderCeoOverlay(W: number, H: number, message: string, name: string, title: string, legal: string, fonts: { family: string; url: string }[], design: CeoDesign): Promise<Buffer> {
  if (design.scheme === "light") return renderLightOverlay(W, H, message, name, title, legal, fonts, design);
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
/* THE AI MARK - bottom RIGHT, clear of the name plate, small but legible (Gary). An icon plus the words reads
   as a credential rather than a caption, which is the point: it should look deliberate and disclosed, not
   apologetic. */
.ai{position:absolute;right:5%;bottom:4.5%;display:inline-flex;align-items:center;gap:${Math.round(H * 0.006)}px;
  padding:${Math.round(H * 0.006)}px ${Math.round(H * 0.011)}px;border-radius:999px;
  border:1px solid rgba(255,255,255,.22);background:rgba(8,26,42,.42);
  font-family:'MTNBrighterSans',sans-serif;font-weight:600;letter-spacing:.3px;
  color:rgba(255,255,255,.82);font-size:${Math.round(H * 0.0125)}px}
.ai svg{width:${Math.round(H * 0.016)}px;height:${Math.round(H * 0.016)}px;flex:none}
</style></head><body>
<div class="wash"></div>
<div class="btm"></div>
<div class="msg">${esc(message)}</div>
<div class="plate">${nameplateHtml(name, title)}</div>
<div class="ai">
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.6l1.9 5.6 5.6 1.9-5.6 1.9L12 17.6l-1.9-5.6-5.6-1.9 5.6-1.9L12 2.6Z" fill="#F9CB0F"/>
    <path d="M18.6 15.2l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" fill="#F9CB0F" opacity=".75"/>
  </svg>
  <span>${esc(legal)}</span>
</div>
</body></html>`;
  const { png } = await renderPng({ html, width: W, height: H, scale: 1, transparent: true });
  return png;
}

// THE DESIGNED LIGHT FIELD - a clean corporate backdrop, no AI (Gary: "no background, corporate"). A warm-white
// base with a soft radial deepening on the right where she stands, so a light figure on a light field always
// separates instead of washing out. Three subtle variants by index so the team still picks from three: warm
// neutral, cooler grey, a faint warm-gold. The deepening is what carries the whole thing.
async function lightField(W: number, H: number, variant: number): Promise<Buffer> {
  const bases: [string, string, string][] = [
    ["#f8f7f5", "#eceae6", "#dcd9d3"], // warm neutral
    ["#f6f7f8", "#e9ebed", "#d6dade"], // cooler grey
    ["#faf7f1", "#f0ead9", "#e6ddcb"], // faint warm gold
  ];
  const [top, mid, edge] = bases[variant % bases.length];
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${edge}"/>
      </linearGradient>
      <radialGradient id="depth" cx="0.72" cy="0.62" r="0.6">
        <stop offset="0" stop-color="#c9c4ba" stop-opacity="0.55"/>
        <stop offset="0.55" stop-color="#c9c4ba" stop-opacity="0.20"/>
        <stop offset="1" stop-color="#c9c4ba" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#base)"/>
    <rect width="100%" height="100%" fill="url(#depth)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// The brand's own field, used only as a fallback when a generated backdrop fails. `stops` is "top|bottom".
async function brandField(W: number, H: number, stops: string): Promise<Buffer> {
  const [top, bottom] = stops.split("|");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// THE LIGHT OVERLAY (BrightRock and any future light brand). Charcoal type, a gold hairline drawn from the dot
// on their own wordmark, an understated nameplate and the FSP compliance line. Its own left scrim is the fix
// the proof forced: charcoal text over the dark suit disappeared, so the text zone always carries a light wash.
async function renderLightOverlay(W: number, H: number, message: string, name: string, title: string, legal: string, fonts: { family: string; url: string }[], design: CeoDesign): Promise<Buffer> {
  const esc = (t: string) => String(t || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colW = W * 0.42;
  const longestWord = Math.max(...message.split(/\s+/).map((w) => w.length), 1);
  const msgSize = Math.max(Math.round(H * 0.038), Math.min(Math.round(H * 0.052), Math.floor(colW / (longestWord * 0.58))));
  const fam = fonts[0]?.family || "Helvetica Neue";
  // The FSP line and the AI disclosure ride together, quietly, at the foot.
  const foot = [design.compliance, legal].filter(Boolean).join(" ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent;font-family:'${fam}','Helvetica Neue',Arial,sans-serif}
/* THE SCRIM. A light wash across the left, fading out before the figure, so charcoal text always has a clean
   backing - the single fix that made the nameplate legible where the dark suit sits. */
.scrim{position:absolute;inset:0;background:linear-gradient(90deg, #f4f2ef 0%, #f4f2ef 36%, rgba(244,242,239,.72) 50%, rgba(244,242,239,0) 62%)}
.rule{position:absolute;left:6%;top:33%;width:${Math.round(H * 0.043)}px;height:${Math.round(H * 0.004)}px;background:${design.accent};border-radius:3px}
.msg{position:absolute;left:6%;top:36%;width:42%;color:${design.textColor};font-weight:700;font-size:${msgSize}px;line-height:1.1;letter-spacing:-1.2px}
.plate{position:absolute;left:6%;bottom:12.5%}
.plate .nm{font-weight:800;font-size:${Math.round(H * 0.025)}px;color:${design.textColor};letter-spacing:-0.3px}
.plate .tl{margin-top:3px;font-weight:600;font-size:${Math.round(H * 0.016)}px;color:${design.subColor};letter-spacing:0.2px}
.plate .br{width:${Math.round(H * 0.032)}px;height:${Math.round(H * 0.0033)}px;background:${design.accent};margin-top:12px;border-radius:2px}
.fsp{position:absolute;left:6%;width:44%;bottom:5%;font-size:${Math.round(H * 0.0112)}px;line-height:1.5;color:${design.fspColor};font-weight:500}
.ai{position:absolute;right:5%;bottom:5%;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;
  border:1px solid rgba(43,43,43,.16);background:rgba(255,255,255,.55);font-weight:600;font-size:${Math.round(H * 0.0125)}px;color:#6b6862}
</style></head><body>
<div class="scrim"></div>
<div class="rule"></div>
<div class="msg">${esc(message)}</div>
<div class="plate"><div class="nm">${esc(name)}</div><div class="tl">${esc(title)}</div><div class="br"></div></div>
<div class="fsp">${esc(foot)}</div>
<div class="ai">✦ <span>${esc(legal)}</span></div>
</body></html>`;
  const { png } = await renderPng({ html, width: W, height: H, scale: 1, transparent: true });
  return png;
}
