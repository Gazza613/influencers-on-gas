import sharp from "sharp";
import { generateBatchDetailed } from "./vendors/higgsfield";
import { removeBackground } from "./vendors/fal";
import { cutoutToTransparent } from "./studio-cutout";
import { compositeLogo, tidyCallout } from "./studio-slider";
import { renderPng, fontFaceCss } from "./studio-render";
import { nameplateCss, nameplateHtml, type NameplateColors } from "./templates/momo-nameplate";
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
  nameplate?: NameplateColors;  // per-brand name-plate colours (dark scheme); undefined keeps MoMo's navy + yellow
  washRgb?: string;             // "r,g,b" for the dark left wash + foot gradient + AI chip; default MoMo navy
  markColor?: string;           // the AI-mark glyph colour (dark scheme); default MoMo yellow
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
  // THREE SOPHISTICATED FINANCIAL-SERVICES INTERIORS (Gary: "more corporate and sophisticated, financial
  // services"). Not a generic meeting room - the executive floor of a wealth-and-insurance headquarters: glass,
  // stone, walnut, a moneyed skyline. Bright and neutral so charcoal type still reads over the left panel, shot
  // like high-end architectural photography and held at a shallow depth of field so she stays the subject.
  backdrops: [
    "the executive floor of a premium financial-services headquarters: floor-to-ceiling glass framing a soft " +
    "sunlit business-district skyline, a long boardroom table in warm walnut, sculptural designer chairs, a " +
    "polished stone floor, an understated palette of stone, ivory and charcoal, calm and moneyed, shot like " +
    "high-end architectural photography on medium format, softly out of focus at a shallow depth of field so it " +
    "reads as a real, sophisticated room",
    "a sophisticated boardroom high in a modern insurance headquarters, full-height windows framing a bright hazy " +
    "city skyline, pale marble and warm timber, brushed-brass detailing, soft diffused daylight, a refined " +
    "palette of stone, ivory and warm grey, deep and expensive, shallow depth of field, richly detailed yet " +
    "gently blurred behind the subject",
    "an elegant executive lounge on a high floor of a financial-services tower, floor-to-ceiling glass with a " +
    "warm out-of-focus city view, low walnut panelling, soft architectural lighting, calm neutral tones with a " +
    "faint gold warmth, refined and reassuring, shot on medium format with a shallow depth of field so the room " +
    "falls softly out of focus",
  ],
  logoPrefersLight: false,   // the charcoal wordmark, for a light field
  compliance: "BrightRock Life Ltd is a licensed financial services provider and life insurer. FSP 11643.",
};

// GAS MARKETING'S OWN DESIGN (Gary: a GAS piece was rendering in MoMo's fintech navy + yellow). Dark like MoMo,
// but in GAS's own register: a neutral warm-dark field, the GAS ORANGE mark as the accent (name plate + AI mark),
// and neutral-dark washes rather than navy. Its backdrops are dark modern SA offices with no fintech-navy cast.
const GAS_DESIGN: CeoDesign = {
  scheme: "dark",
  field: "#241a2e|#0d0a14",
  textColor: "#ffffff",
  subColor: "rgba(255,255,255,.82)",
  accent: "#FD7E43",
  fspColor: "rgba(255,255,255,.75)",
  backdrops: [
    "a premium modern office interior in warm neutral dark tones, soft top-lighting, graphite and charcoal with " +
    "warm wood accents, clean and corporate, shot as a real place at a shallow depth of field so it reads behind the subject",
    "the interior of a contemporary Johannesburg headquarters at dusk: floor-to-ceiling glass with a softly blurred " +
    "city skyline glowing warm beyond it, dark neutral tones, warm downlighting, shallow depth of field",
    "a sleek executive workspace in warm dark neutrals, matte black and walnut, subtle warm rim-lighting, a calm " +
    "out-of-focus modern interior, deep and expensive, shallow depth of field",
  ],
  logoPrefersLight: true,
  compliance: "",
  nameplate: { plate: "#1b1622", plate2: "#2b2233", accent: "#FD7E43", title: "#ffffff" },
  washRgb: "12,9,16",
  markColor: "#FD7E43",
};

// Which design a brain gets. Keyed by client_id, defaulting to MoMo's scheme so nothing that predates this
// changes. A future client is added here with its own CeoDesign.
const MOMO_ID = "e44295d7-dc10-4422-bede-4e9ddcad7b2d";
const BRIGHTROCK_ID = "dfc2efbf-7949-428b-a34d-1c5e92b88875";
const GAS_ID = "2da4eb14-f802-4af8-9fde-9de2a0a18cfb";
function designFor(clientId: string): CeoDesign {
  if (clientId === BRIGHTROCK_ID) return BRIGHTROCK_DESIGN;
  if (clientId === GAS_ID) return GAS_DESIGN;
  return MOMO_DESIGN;
}

// The creative comes in the shapes the team picks (Gary): a 1x1 square for the LinkedIn feed and a 16x9
// landscape. Each is a full render at its own canvas + backdrop aspect, tagged so the UI can group and the
// email can embed the 16x9 and attach the chosen shape(s).
export type Ratio = "1x1" | "16x9";
const RATIO_DIMS: Record<Ratio, { W: number; H: number; aspect: "1:1" | "16:9" }> = {
  "1x1": { W: 1200, H: 1200, aspect: "1:1" },
  "16x9": { W: 1920, H: 1080, aspect: "16:9" },
};

export type CeoCreative = { url: string; ratio: Ratio; error?: string };

export async function buildCeoCreatives(
  clientId: string,
  opts: { message: string; name?: string; title?: string; photoKind?: "ceo_photo" | "md_photo"; ratios?: Ratio[] },
): Promise<{ creatives: CeoCreative[]; error: string | null }> {
  const design = designFor(clientId);
  // WHO PUBLISHES (Gary): the CEO or the MD. Their real photo lives under the matching asset kind; a missing
  // photo for the chosen publisher is a refusal, never a fall-back to the other person's face.
  const photoKind = opts.photoKind === "md_photo" ? "md_photo" : "ceo_photo";
  const who = photoKind === "md_photo" ? "MD" : "CEO";
  const ratios: Ratio[] = (opts.ratios && opts.ratios.length ? opts.ratios : ["1x1"]).filter((r): r is Ratio => r === "1x1" || r === "16x9");
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
  const photos = await listAssets(clientId, photoKind);
  if (!photos.length) return { creatives: [], error: `No ${who} photo on file. Upload one on the intake page first.` };
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
    return { creatives: [], error: `This brain has no ${who} name and title set, so there is nobody to attribute the creative to.` };
  }
  // THE CREATIVE HEADLINE MUST BE SHORT (Gary: a run-on callout filled the whole column and ran under the logo).
  // Take the LEAD CLAUSE - up to the first slash or comma - so a sentence-long callout becomes a punchy line, and
  // hard-cap it at ~52 characters on a word boundary as a backstop. A genuinely short callout is left untouched.
  let message = tidyCallout(opts.message).split("/")[0].split(/,\s/)[0].replace(/[,;.]\s*$/, "").trim();
  if (message.length > 52) {
    const cut = message.slice(0, 52);
    message = cut.slice(0, Math.max(cut.lastIndexOf(" "), 30)).trim();
  }

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

  // The cut-out is ratio-independent, so it is done once above. Everything below - figure sizing, the backdrops,
  // the overlay - depends on the CANVAS, so it runs once PER RATIO. The logo pick is canvas-independent too.
  const cm = await sharp(cut).metadata();
  const nativeH = cm.height || 0;
  const nativeW = cm.width || 800;

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
  let logoBuf: Buffer | null = logo ? Buffer.from(new Uint8Array(await (await fetch(logo.url)).arrayBuffer())) : null;
  // NEVER A WHITE BOX (Gary): a logo supplied on a solid white background must not sit in a white square over the
  // creative. If its background is opaque (little/no transparency), flood-fill the CONNECTED background out from
  // the edges - that clears the surrounding white while KEEPING interior white elements (e.g. white letters
  // inside a coloured mark), which a naive white-to-alpha threshold would wrongly erase.
  if (logoBuf) {
    try {
      const lm = await sharp(logoBuf).metadata();
      let solid = true;
      if (lm.hasAlpha) {
        const { data, info } = await sharp(logoBuf).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
        let clear = 0; for (let k = 0; k < data.length; k++) if (data[k] < 16) clear++;
        solid = clear / (info.width * info.height) < 0.05;
      }
      if (solid) logoBuf = await cutoutToTransparent(logoBuf);
    } catch (e) { console.error("[ceo-creative] logo bg cut-out skipped:", e); }
  }

  // BOTH SHAPES RENDER IN PARALLEL (Gary: efficiency). The Higgsfield backdrop jobs are globally concurrency-capped
  // (MAX_CONCURRENT), so overlapping the two ratios feeds all their generations into that one budget at once
  // instead of running one shape fully and then the other - roughly halving the wall-clock for "both".
  const perRatio = await Promise.all(ratios.map(async (ratio): Promise<CeoCreative[]> => {
    const made: CeoCreative[] = [];
    const { W, H, aspect } = RATIO_DIMS[ratio];
    const wide = ratio === "16x9";

    // SIZE THE FIGURE FOR THIS CANVAS, bottom-anchored, never hard-upscaled (>1.15x only softens a face).
    // On 16x9 the figure is capped to the right ~half so it never crosses the text column, which is why a wide
    // landscape needs its own clamp the square never did.
    const figScale = design.scheme === "light" ? (wide ? 0.98 : 0.88) : 0.96;
    let figH = Math.min(Math.round(H * figScale), Math.round((nativeH || H) * 1.15));
    let figW = Math.round(nativeW * (figH / (nativeH || 1000)));
    if (wide && figW > Math.round(W * 0.52)) {
      // Too wide for a landscape: pull the height down so the figure fits the right half and the left stays clear.
      figW = Math.round(W * 0.52);
      figH = Math.round((nativeH || 1000) * (figW / (nativeW || 800)));
    }
    let figureRaw = await sharp(cut).resize({ height: figH, kernel: "lanczos3" }).png().toBuffer();

    // ALPHA PEDESTAL SAFETY NET. Some matte outputs leave a faint near-transparent haze across the bounding box,
    // which would composite as a rectangle behind the figure. We map anything below ~14% opacity to fully
    // transparent (rescaling the rest), so a hazy cutout can never paint a background rectangle. Measured clean on
    // the GAS cutout (background alpha 0%), so here it is a no-op, but it protects any future poorly-matted photo.
    // The dark halo Gary saw was the CONTACT SHADOW below, not a pedestal - fixed there. Dark scheme only.
    if (design.scheme !== "light") {
      const rgb = await sharp(figureRaw).removeAlpha().toBuffer();
      const a = await sharp(figureRaw).ensureAlpha().extractChannel(3).linear(1 / 0.86, -(0.14 / 0.86) * 255).toBuffer();
      figureRaw = await sharp(rgb).joinChannel(a).png().toBuffer();
    }

    // BLEND INTO THE SCENE (Gary: "looks pasted on, needs to fuse with the scenery"): a contact shadow (their own
    // silhouette, blurred), a tone match to the field, AND a slight edge feather so the cut-out sits IN the scene
    // rather than as a hard sticker. On dark the figure is graded a touch more muted so it belongs to the room.
    const tone = design.scheme === "light" ? { brightness: 1.0, saturation: 1.0 } : { brightness: 0.92, saturation: 0.85 };
    // THE CONTACT SHADOW, aspect-aware (Gary: 16x9 reads clean, 1x1 showed a dark halo behind him). On 16x9 the
    // figure sits flush-right, so the shadow hides almost entirely behind him and only a faint edge shows. On 1x1
    // the figure is much larger and more central, so the SAME shadow reads as a halo. So the square gets a far
    // lighter, tighter shadow - present enough to ground him, never a visible band. Wide is unchanged.
    const shadowGain = design.scheme === "light" ? 0.42 : (wide ? 0.5 : 0.2);
    const shadowBlur = design.scheme === "light" ? 26 : (wide ? 30 : 20);
    let figure = design.scheme === "light"
      ? await sharp(figureRaw).modulate(tone).sharpen({ sigma: 1.1 }).png().toBuffer()
      : await sharp(figureRaw).modulate(tone).png().toBuffer();
    // Feather the alpha edge by ~1px, so the hard matte line softens into the backdrop instead of reading as a
    // pasted cut-out. Kept subtle so the face and shoulders stay crisp.
    if (design.scheme !== "light") {
      const rgb = await sharp(figure).removeAlpha().toBuffer();
      const alpha = await sharp(figure).ensureAlpha().extractChannel(3).blur(1.1).toBuffer();
      figure = await sharp(rgb).joinChannel(alpha).png().toBuffer();
    }
    const shadowAlpha = await sharp(figureRaw).extractChannel(3).blur(shadowBlur).linear(shadowGain, 0).toColourspace("b-w").toBuffer();
    const shadowBlack = await sharp({ create: { width: figW, height: figH, channels: 3, background: "#000000" } }).png().toBuffer();
    const shadow = await sharp(shadowBlack).joinChannel(shadowAlpha).png().toBuffer();

    // WHERE THE FIGURE SITS. 16x9: right-anchored, the text living in the calm left half. Square: the tuned
    // per-scheme placement (dark bleeds off the right; light centres the head in the room).
    let figLeft: number;
    if (wide) {
      figLeft = W - figW;
    } else if (design.scheme === "light") {
      const headCentre = Math.round(W * 0.63);
      figLeft = Math.min(headCentre - Math.round(figW / 2), W - Math.round(figW * 0.94));
    } else {
      figLeft = Math.max(Math.round(W * 0.45), W - figW);
    }
    const figTop = H - figH;

    // The foreground overlay - message, name plate, compliance, logo, mark - one render per canvas.
    const overlay = await renderCeoOverlay(W, H, message, name, title, legal, fonts, design);

    // THE THREE FIELDS at this aspect (generated for both schemes; the light scheme uses its designed gradient
    // field when a generation comes back soft, via the composite fallback below - behaviour unchanged from 1x1).
    const prompts = design.backdrops.map((d) =>
      `${d}. NO people, NO faces, NO text, NO lettering, NO numbers, NO logo, NO graphics of any kind - it is a ` +
      `plain BACKGROUND only. Keep the LEFT third calmer and less busy so a headline can sit over it; the RIGHT ` +
      `side carries the room. Sharp, high resolution.`);
    const shots = await generateBatchDetailed(prompts, "nano_banana_pro", aspect, { resolution: "2k" }, null);
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: "ceo-backdrop", count: shots.length }).catch(() => {});

    for (let i = 0; i < shots.length; i++) {
      try {
        const bgUrl = shots[i]?.url;
        const bg = bgUrl
          ? await sharp(Buffer.from(new Uint8Array(await (await fetch(bgUrl)).arrayBuffer()))).resize(W, H, { fit: "cover" }).png().toBuffer()
          : design.scheme === "light" ? await lightField(W, H, i) : await brandField(W, H, design.field);

        const x = design.scheme === "light" || wide
          ? Math.max(0, figLeft)
          : Math.max(0, Math.min(figLeft, W - Math.round(figW * 0.5)));
        // No contact shadow on light (it smudges translucent hair/shoulders on a light field). Dark keeps it.
        const layers = design.scheme === "light"
          ? [{ input: figure, left: x, top: figTop }, { input: overlay, left: 0, top: 0 }]
          : [
              { input: shadow, left: Math.max(0, x - Math.round(figW * 0.03)), top: Math.max(0, figTop + Math.round(figH * 0.012)) },
              { input: figure, left: x, top: figTop },
              { input: overlay, left: 0, top: 0 },
            ];
        let out = await sharp(bg).composite(layers).png().toBuffer();
        // Logo top-left, small so it clears the headline below it. minWFrac drops the slider's 18% floor, and
        // maxHFrac caps the HEIGHT so a CIRCULAR logo (e.g. GAS) is never taller than the corner it sits in - the
        // width-only size is what let a round logo swallow the first headline line. A wide wordmark (e.g. MoMo)
        // stays short and is unaffected.
        if (logoBuf) out = (await compositeLogo(out, logoBuf, { xPct: 4, yPct: 4, wPct: design.scheme === "light" ? (wide ? 15 : 22) : (wide ? 12 : 16) }, { minWFrac: 0.05, maxHFrac: wide ? 0.14 : 0.15 })) as Buffer;

        const url = await putBytes(out, `studio/${clientId}/ceo-creative`, "png", "image/png");
        made.push({ url, ratio });
      } catch (e) {
        made.push({ url: "", ratio, error: String((e as Error)?.message || e).slice(0, 120) });
      }
    }
    return made;
  }));
  const creatives = perRatio.flat();
  const ok = creatives.filter((c) => c.url);
  return { creatives: ok.length ? ok : [], error: ok.length ? null : "All the renders failed. Try again." };
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
  const wide = W > H * 1.3;
  // The message starts BELOW the top-left logo so the two never collide (Gary). The logo is proportionally taller
  // on a 16x9 canvas, so the message drops further there.
  const msgTop = wide ? 26 : 21;
  // AUTO-SIZE THE TYPE TO FIT, so a longer headline shrinks to sit fully inside its column instead of wrapping past
  // the band and clipping (Gary: "headline gets cut off"). Two constraints: (1) the LONGEST WORD must fit the
  // column width (a word cannot break), and (2) every wrapped line must fit the VERTICAL band between the logo and
  // the nameplate. We take the smaller, then never go below a readable floor.
  const longestWord = Math.max(...message.split(/\s+/).map((w) => w.length), 1);
  const lineH = 1.06;
  const minSize = Math.round(H * 0.032);
  const maxSize = Math.round(H * 0.072);
  const bandBottomPct = wide ? 58 : 64;                        // the nameplate sits below this
  const bandH = ((bandBottomPct - msgTop) / 100) * H;
  const byWord = Math.floor(colW / (longestWord * 0.60));
  let msgSize = Math.min(maxSize, byWord);
  // Shrink until the wrapped lines fit the band (bold condensed type averages ~0.52 * size per character).
  for (; msgSize > minSize; msgSize--) {
    const charsPerLine = Math.max(1, Math.floor(colW / (msgSize * 0.52)));
    const lines = Math.ceil(message.length / charsPerLine);
    if (lines * msgSize * lineH <= bandH) break;
  }
  msgSize = Math.max(minSize, Math.min(maxSize, msgSize));
  const wash = design.washRgb || "4,25,40";      // MoMo default = navy; GAS = neutral dark
  const mark = design.markColor || "#F9CB0F";     // MoMo default = yellow; GAS = orange
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* A soft dark wash on the left so white type reads whatever the backdrop does behind it. */
.wash{position:absolute;inset:0;background:linear-gradient(102deg, rgba(${wash},.85) 0%, rgba(${wash},.5) 30%, transparent 52%)}
/* No footer bar (Gary): the disclosure sits on the photograph itself. A soft bottom gradient keeps it
   readable over whatever the backdrop does, without becoming a band. */
.btm{position:absolute;left:0;right:0;bottom:0;height:16%;background:linear-gradient(to top, rgba(${wash},.72) 0%, transparent 100%)}
.msg{position:absolute;left:6%;top:${msgTop}%;width:37%;color:#fff;font-family:'MTNBrighterSans',sans-serif;
  font-weight:800;font-size:${msgSize}px;line-height:1.06;letter-spacing:-1px;text-shadow:0 3px 18px rgba(0,0,0,.55)}
.plate{position:absolute;left:6.5%;bottom:12%}
${nameplateCss(0.42, design.nameplate)}
/* THE AI MARK - bottom RIGHT, clear of the name plate, small but legible (Gary). An icon plus the words reads
   as a credential rather than a caption, which is the point: it should look deliberate and disclosed, not
   apologetic. */
.ai{position:absolute;right:5%;bottom:4.5%;display:inline-flex;align-items:center;gap:${Math.round(H * 0.006)}px;
  padding:${Math.round(H * 0.006)}px ${Math.round(H * 0.011)}px;border-radius:999px;
  border:1px solid rgba(255,255,255,.22);background:rgba(${wash},.42);
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
    <path d="M12 2.6l1.9 5.6 5.6 1.9-5.6 1.9L12 17.6l-1.9-5.6-5.6-1.9 5.6-1.9L12 2.6Z" fill="${mark}"/>
    <path d="M18.6 15.2l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3Z" fill="${mark}" opacity=".75"/>
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
/* A clean cream panel holding the text, over a photographic boardroom. SOLID to 27% then a GRACEFUL editorial
   fade, fully gone by 45% - she begins at ~46%, so the panel gives charcoal type a firm backing and NEVER
   reaches her face (the veil that shaded her before). No hard divider line: a top-1% layout lets the room
   breathe into the panel rather than slicing the frame with a rule. */
.scrim{position:absolute;inset:0;background:linear-gradient(90deg, #f4f2ef 0%, #f4f2ef 40%, rgba(244,242,239,.85) 43%, rgba(244,242,239,0) 45%)}
.rule{position:absolute;left:6%;top:33%;width:${Math.round(H * 0.043)}px;height:${Math.round(H * 0.004)}px;background:${design.accent};border-radius:3px}
.msg{position:absolute;left:6%;top:36%;width:42%;color:${design.textColor};font-weight:700;font-size:${msgSize}px;line-height:1.1;letter-spacing:-1.2px}
.plate{position:absolute;left:6%;bottom:12.5%}
.plate .nm{font-weight:800;font-size:${Math.round(H * 0.025)}px;color:${design.textColor};letter-spacing:-0.3px}
.plate .tl{margin-top:3px;font-weight:600;font-size:${Math.round(H * 0.016)}px;color:${design.subColor};letter-spacing:0.2px}
.plate .br{width:${Math.round(H * 0.032)}px;height:${Math.round(H * 0.0033)}px;background:${design.accent};margin-top:12px;border-radius:2px}
.fsp{position:absolute;left:6%;width:34%;bottom:5%;font-size:${Math.round(H * 0.0112)}px;line-height:1.5;color:${design.fspColor};font-weight:500}
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
