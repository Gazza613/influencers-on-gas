import sharp from "sharp";

// DOES OUR RENDER ACTUALLY LOOK LIKE THEIRS? MEASURE IT.
//
// Gary: "you are not matching reference images that I gave you in the intake to get the desired look and feel."
// He was right, and the reason it went unnoticed for so long is that I was checking by LOOKING - rendering a
// canvas, deciding it seemed close, and moving on. "Seems close" is not a check. It let me ship the deal card
// with the wrong yellow (#F9CB0F, from MoMo's website CSS) against artwork that is actually #FFCE0B. A human
// eye forgives a 6-point hue shift; a comparison does not.
//
// So: compare the render to the reference numerically, and print the delta.
//
// WHAT THIS MEASURES AND WHAT IT DOES NOT:
//   PALETTE   - the colours we put down vs the colours they put down, and how much of each. This catches a
//               wrong brand colour, a washed-out grade, a missing accent. It is the check that would have
//               caught the yellow on day one.
//   INK MAP   - where the dark/light mass sits, on a coarse grid. This catches "the type is in the wrong
//               third", "the card is on the wrong side", "our scrim is far heavier than theirs".
//
// It does NOT judge whether the photograph is any good, whether the casting is right, or whether the idea
// works. Those are human calls. This exists to stop me from being confidently wrong about the measurable half.

export type PaletteEntry = { hex: string; share: number };
export type Comparison = {
  palette: { ours: PaletteEntry[]; theirs: PaletteEntry[]; missing: PaletteEntry[]; nearest: { theirs: string; ours: string; deltaE: number }[] };
  inkDelta: number;      // 0 = identical mass distribution, 1 = completely different
  verdict: string[];
};

// Perceptual-ish distance in Lab. Plain RGB distance lies: it calls two very different-looking colours close
// if they happen to be near in cube space, which is exactly how a wrong brand yellow slips through.
function labDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

async function palette(buf: Buffer, n = 6): Promise<{ entries: PaletteEntry[]; labs: Map<string, [number, number, number]> }> {
  const img = sharp(buf).resize(160, 160, { fit: "inside" });
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { data: lab } = await sharp(buf).resize(160, 160, { fit: "inside" }).toColourspace("lab").raw().toBuffer({ resolveWithObject: true });

  const tally = new Map<string, number>();
  const labs = new Map<string, [number, number, number]>();
  let total = 0;
  for (let i = 0, p = 0; i < data.length; i += info.channels, p += 3) {
    if (info.channels === 4 && data[i + 3] < 200) continue;  // ignore transparency
    // Quantise to 5 bits so near-identical pixels group, but not so coarse that a brand colour drifts.
    const q = (v: number) => (v >> 3) << 3;
    const hex = "#" + [q(data[i]), q(data[i + 1]), q(data[i + 2])].map((v) => v.toString(16).padStart(2, "0")).join("");
    tally.set(hex, (tally.get(hex) || 0) + 1);
    if (!labs.has(hex)) labs.set(hex, [lab[p], lab[p + 1], lab[p + 2]]);
    total++;
  }
  const entries = [...tally]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([hex, c]) => ({ hex, share: c / Math.max(1, total) }));
  return { entries, labs };
}

// Where the ink sits. An 8x8 grid of mean luminance - coarse enough to be about composition rather than
// content, fine enough to notice that our headline band is twice the weight of theirs.
async function inkMap(buf: Buffer): Promise<number[]> {
  const G = 8;
  const { data, info } = await sharp(buf)
    .resize(G, G, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out: number[] = [];
  for (let i = 0; i < G * G; i++) out.push(data[i * info.channels] / 255);
  return out;
}

export async function compareToReference(ours: Buffer, theirs: Buffer): Promise<Comparison> {
  const [po, pt, io, it] = await Promise.all([palette(ours), palette(theirs), inkMap(ours), inkMap(theirs)]);

  // For each colour THEY use meaningfully, what is our closest colour, and how far off is it?
  const nearest = pt.entries
    .filter((e) => e.share > 0.02)
    .map((t) => {
      const tl = pt.labs.get(t.hex)!;
      let best = { theirs: t.hex, ours: "", deltaE: Infinity };
      for (const o of po.entries) {
        const d = labDist(tl, po.labs.get(o.hex)!);
        if (d < best.deltaE) best = { theirs: t.hex, ours: o.hex, deltaE: d };
      }
      return best;
    })
    .sort((a, b) => b.deltaE - a.deltaE);

  // A deltaE over ~10 in Lab is a colour a person would call "a different colour", not "a shade off".
  const missing = pt.entries.filter((t) => {
    const hit = nearest.find((n) => n.theirs === t.hex);
    return t.share > 0.03 && (!hit || hit.deltaE > 10);
  });

  const inkDelta = io.reduce((s, v, i) => s + Math.abs(v - it[i]), 0) / io.length;

  const verdict: string[] = [];
  for (const n of nearest.slice(0, 3)) {
    if (n.deltaE > 10) verdict.push(`Colour ${n.theirs} in the reference is ${n.deltaE.toFixed(1)} deltaE from our nearest (${n.ours}). That is a different colour, not a shade.`);
  }
  if (missing.length) verdict.push(`We do not use ${missing.map((m) => `${m.hex} (${(m.share * 100).toFixed(0)}% of theirs)`).join(", ")} at all.`);
  if (inkDelta > 0.18) verdict.push(`The tonal mass sits differently: mean luminance delta ${inkDelta.toFixed(3)} across the frame. The composition is not landing where theirs does.`);
  if (!verdict.length) verdict.push("Palette and tonal mass both track the reference.");

  return { palette: { ours: po.entries, theirs: pt.entries, missing, nearest }, inkDelta, verdict };
}
