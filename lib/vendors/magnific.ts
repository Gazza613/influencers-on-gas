import { getSecret } from "../connections";

// Magnific (via Freepik API) — skin-realism upscale/enhance. Vendor-neutral in the UI.
const BASE = "https://api.freepik.com/v1/ai/image-upscaler";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function key(): Promise<string> {
  const k = await getSecret("magnific");
  if (!k) throw new Error("Realism (Magnific) is not connected");
  return k;
}

type AnyObj = Record<string, unknown>;

function pickUrl(d: AnyObj): string | null {
  const data = (d.data as AnyObj) || d;
  const gen = (data.generated as unknown[]) || (data.generated_images as unknown[]);
  if (Array.isArray(gen) && gen.length) {
    const first = gen[0] as string | AnyObj;
    return typeof first === "string" ? first : (first?.url as string) || null;
  }
  return (data.url as string) || (data.result as string) || null;
}

// Enhance a face/hero image for skin realism. Returns the enhanced image URL.
// Async API: POST starts a task, then poll until COMPLETED.
export async function enhanceImage(imageUrl: string): Promise<string> {
  const k = await key();
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`Could not fetch image to enhance (${img.status})`);
  const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");

  const start = await fetch(BASE, {
    method: "POST",
    headers: { "x-freepik-api-key": k, "Content-Type": "application/json" },
    body: JSON.stringify({
      image: b64,
      scale_factor: "2x",
      optimized_for: "soft_portraits",
      creativity: 1,
      hdr: 2,
      resemblance: 5,
      fractality: 2,
      engine: "automatic",
    }),
  });
  const sd = (await start.json().catch(() => ({}))) as AnyObj;
  if (!start.ok) throw new Error(`Magnific start failed (${start.status}): ${JSON.stringify(sd).slice(0, 200)}`);
  const taskId = ((sd.data as AnyObj)?.task_id as string) || (sd.task_id as string);
  // Some responses return the result synchronously.
  const immediate = pickUrl(sd);
  if (immediate) return immediate;
  if (!taskId) throw new Error(`No task_id from Magnific: ${JSON.stringify(sd).slice(0, 200)}`);

  for (let i = 0; i < 80; i++) {
    await sleep(3000);
    const ps = await fetch(`${BASE}/${taskId}`, { headers: { "x-freepik-api-key": k }, cache: "no-store" });
    const pd = (await ps.json().catch(() => ({}))) as AnyObj;
    const status = String(((pd.data as AnyObj)?.status as string) || (pd.status as string) || "").toUpperCase();
    const url = pickUrl(pd);
    if (url) return url;
    if (status === "FAILED" || status === "ERROR") throw new Error("Magnific enhancement failed");
  }
  throw new Error("Magnific enhancement timed out");
}
