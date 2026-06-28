import sharp from "sharp";
import { putBytes } from "./blob";
import { isSafePublicUrl } from "./safe-url";

// Proxied, resized JPEG via images.weserv.nl - zero local compute, can't exceed the cap. Used as a
// fallback when sharp can't run in the runtime; weserv fetches the (public) source URL itself.
function weservJpeg(url: string, maxEdge = 1280): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${maxEdge}&h=${maxEdge}&fit=inside&output=jpg&q=82`;
}

// fal (OmniHuman) rejects any INPUT file over 5 MB ("File size exceeds the maximum allowed size of
// 5242880 bytes"). Our keyframes are 1-2K PNGs that routinely blow past that, so OmniHuman submits
// fail and silently fall back to Seedance. OmniHuman renders at 720p, so a 1280px JPEG loses nothing
// visible. PREFERRED: re-encode locally with sharp + re-host. FALLBACK (sharp unavailable): hand fal
// a proxied resized JPEG URL - so this can NEVER pass a too-large image through.
export async function compressForFal(url: string, maxBytes = 4_800_000, maxEdge = 1280): Promise<string> {
  if (!url || !isSafePublicUrl(url)) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const input = Buffer.from(await res.arrayBuffer());
      if (input.length <= maxBytes && /\.jpe?g(\?|$)/i.test(url)) return url; // already a small jpeg
      const resize = (q: number) => sharp(input).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true }).jpeg({ quality: q, mozjpeg: true }).toBuffer();
      let q = 88;
      let out = await resize(q);
      while (out.length > maxBytes && q > 45) { q -= 12; out = await resize(q); } // step down (rare at 1280px)
      if (out.length <= maxBytes) return await putBytes(out, "fal-src", "jpg", "image/jpeg");
    }
  } catch {
    /* sharp not available, or fetch failed - fall through to the proxy below */
  }
  return weservJpeg(url, maxEdge);
}
