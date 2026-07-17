import sharp from "sharp";
import { generateBatchDetailed } from "./vendors/higgsfield";
import { removeBackground } from "./vendors/fal";
import { cutoutToTransparent } from "./studio-cutout";
import { compositeLogo, tidyCallout } from "./studio-slider";
import { renderPng, fontFaceCss } from "./studio-render";
import { nameplateCss, nameplateHtml } from "./templates/momo-nameplate";
import { getBrandKit, listAssets } from "./studio";
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
const BACKDROPS = [
  "a premium deep navy studio background with a soft top-lit gradient, subtle and clean, corporate",
  "a deep navy background with one soft curved MoMo light-swish/glow arcing behind, gentle and premium",
  "a deep navy background with a faint, heavily blurred out-of-focus modern office suggested in the darkness",
];

export type CeoCreative = { url: string; error?: string };

export async function buildCeoCreatives(
  clientId: string,
  opts: { message: string; name?: string; title?: string },
): Promise<{ creatives: CeoCreative[]; error: string | null }> {
  // 1. His real photo. Prefer a portrait-ish one; the team uploads clean studio shots.
  const photos = await listAssets(clientId, "ceo_photo");
  if (!photos.length) return { creatives: [], error: "No CEO photo on file. Upload one on the intake page first." };
  const photo = photos[0];

  const kit = await getBrandKit(clientId).catch(() => null);
  const fonts = (kit?.fonts || []) as { family: string; url: string }[];
  const legal = (kit?.creative_legal_text || "").trim() || "AI Creative";
  const name = (opts.name || "Kagiso Mothibi").trim();
  const title = (opts.title || "CEO, Fintech, MTN SA").trim();
  const message = tidyCallout(opts.message).split("/")[0].replace(/[,;]\s*$/, "").trim();
  const W = 1200, H = 1200;

  // 2. Cut him out ONCE with a PROPER matting model - fal BiRefNet - not luminance keying. A CEO cut-out has to
  //    be flawless (Gary: "not good, CEO will not approve"), and flood-fill left a ragged, haloed edge on his
  //    suit because his studio background is a grey gradient, not pure white. BiRefNet cuts hair and soft edges
  //    cleanly. Falls back to the flood-fill only if fal is unreachable, so a creative still comes back.
  let cut: Buffer;
  const matted = await removeBackground(photo.url).catch(() => ({ url: null as string | null, error: "matting failed" }));
  if (matted.url) {
    cut = Buffer.from(new Uint8Array(await (await fetch(matted.url)).arrayBuffer()));
  } else {
    const raw = Buffer.from(new Uint8Array(await (await fetch(photo.url)).arrayBuffer()));
    const fb = await cutoutToTransparent(raw).catch(() => null);
    if (!fb) return { creatives: [], error: `Could not cut the CEO photo out (${matted.error || "no matting"}).` };
    cut = fb;
  }
  cut = await sharp(cut).trim().png().toBuffer(); // tighten to the subject

  // Size him to sit on the RIGHT, bottom-anchored. Right-aligned with a small right bleed so his left edge lands
  // clear of the message column, whatever his shoulder width.
  const cm = await sharp(cut).metadata();
  const figH = Math.round(H * 0.86);
  const figW = Math.round((cm.width || 800) * (figH / (cm.height || 1000)));
  const figure = await sharp(cut).resize({ height: figH }).png().toBuffer();
  // His leftmost point is forced to at least 50% of the width, so the headline never reaches him (Gary: "must
  // never go over the subject's face"). If he is wide, he bleeds further off the right edge instead.
  const figLeft = Math.max(Math.round(W * 0.50), W - figW);
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

      let out = await sharp(bg)
        .composite([
          { input: figure, left: Math.max(0, Math.min(figLeft, W - Math.round(figW * 0.5))), top: figTop },
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
  const colW = W * 0.42;
  const longestWord = Math.max(...message.split(/\s+/).map((w) => w.length), 1);
  const msgSize = Math.max(Math.round(H * 0.042), Math.min(Math.round(H * 0.076), Math.floor(colW / (longestWord * 0.60))));
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss(fonts)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
/* A soft dark wash on the left so white type reads whatever the backdrop does behind it. */
.wash{position:absolute;inset:0;background:linear-gradient(102deg, rgba(4,25,40,.85) 0%, rgba(4,25,40,.5) 30%, transparent 52%)}
.foot{position:absolute;left:0;right:0;bottom:0;height:8%;background:${"#004F71"}}
.msg{position:absolute;left:6.5%;top:17%;width:42%;color:#fff;font-family:'MTNBrighterSans',sans-serif;
  font-weight:800;font-size:${msgSize}px;line-height:1.06;letter-spacing:-1px;text-shadow:0 3px 18px rgba(0,0,0,.55)}
.plate{position:absolute;left:6.5%;bottom:12%}
${nameplateCss(0.42)}
.legal{position:absolute;left:0;right:0;bottom:2.6%;text-align:center;padding:0 7%;
  font-family:'MTNBrighterSans',sans-serif;font-weight:500;line-height:1.3;color:rgba(255,255,255,.9);font-size:${Math.round(H * 0.0145)}px}
</style></head><body>
<div class="wash"></div>
<div class="foot"></div>
<div class="msg">${esc(message)}</div>
<div class="plate">${nameplateHtml(name, title)}</div>
<div class="legal">${esc(legal)}</div>
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
