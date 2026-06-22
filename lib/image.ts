import sharp from "sharp";
import { putBytes } from "./blob";
import { isSafePublicUrl } from "./safe-url";

// fal (OmniHuman) rejects any INPUT file over 5 MB ("File size exceeds the maximum allowed size of
// 5242880 bytes"). Our keyframes are 1-2K PNGs that routinely blow past that, so every OmniHuman
// submit was failing and silently falling back to Seedance. OmniHuman renders at 720p, so a 1280px
// long-edge JPEG loses nothing visible. Re-encode + re-host to a fresh public URL (also cures fal's
// "failed to download the file" errors). Fail-open: on any problem, return the original URL.
export async function compressForFal(url: string, maxBytes = 4_800_000, maxEdge = 1280): Promise<string> {
  try {
    if (!url || !isSafePublicUrl(url)) return url;
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return url;
    const input = Buffer.from(await res.arrayBuffer());
    // Already a comfortably-small JPEG? leave it.
    if (input.length <= maxBytes && /\.jpe?g(\?|$)/i.test(url)) return url;
    const resize = (q: number) => sharp(input).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
    let q = 88;
    let out = await resize(q);
    while (out.length > maxBytes && q > 45) { q -= 12; out = await resize(q); } // step down until under the cap (rare at 1280px)
    return await putBytes(out, "fal-src", "jpg", "image/jpeg");
  } catch {
    return url;
  }
}
