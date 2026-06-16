import { put } from "@vercel/blob";

// Re-host a remote image onto Vercel Blob so the stored URL is permanent, public and
// always loadable in an <img> tag. Vendor CDNs (Higgsfield, upscale outputs) can expire,
// require auth, or serve as attachments — re-hosting once at generation time fixes that
// for good. Returns the Blob URL, or null if the source couldn't be fetched.
export async function rehostToBlob(url: string, prefix = "creatives"): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : ct.includes("webp") ? "webp" : ct.includes("avif") ? "avif" : "png";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null; // empty / error body
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const r = await put(key, buf, { access: "public", contentType: ct, addRandomSuffix: false });
    return r.url;
  } catch {
    return null;
  }
}
