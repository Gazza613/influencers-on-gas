import { put } from "@vercel/blob";
import { isSafePublicUrl } from "./safe-url";

// Re-host a remote image onto Vercel Blob so the stored URL is permanent, public and
// always loadable in an <img> tag. Vendor CDNs (Higgsfield, upscale outputs) can expire,
// require auth, or serve as attachments - re-hosting once at generation time fixes that
// for good. Returns the Blob URL, or null if the source couldn't be fetched.
// Upload raw bytes to public Blob and return the URL (e.g. a generated TTS mp3 that another
// vendor, like HeyGen, then needs to fetch by URL).
export async function putBytes(buf: Buffer, prefix: string, ext: string, contentType: string): Promise<string> {
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const r = await put(key, buf, { access: "public", contentType, addRandomSuffix: false });
  return r.url;
}

export async function rehostToBlob(url: string, prefix = "creatives"): Promise<string | null> {
  if (!isSafePublicUrl(url)) return null; // SSRF guard
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    // Pick the RIGHT extension - videos/audio re-hosted into clips/finals must NOT become ".png",
    // or Shotstack rejects them ("Unsupported file extension .png for video asset"). Robust:
    // (1) content-type, (2) the source URL's own extension, (3) default video for clip/final prefixes.
    const urlExt = (url.split("?")[0].match(/\.(mp4|m4v|mov|webm|mkv|avi|3gp|flv|mp3|wav|m4a|jpe?g|png|webp|avif)$/i)?.[1] || "").toLowerCase();
    const videoPrefix = ["clips", "finals", "aroll", "broll"].includes(prefix);
    const ext =
      ct.includes("mp4") ? "mp4" :
      ct.includes("webm") ? "webm" :
      ct.includes("quicktime") || ct === "video/mov" ? "mov" :
      ct.includes("matroska") || ct.includes("mkv") ? "mkv" :
      ct.startsWith("video/") ? "mp4" :
      ct.startsWith("audio/") ? (ct.includes("wav") ? "wav" : "mp3") :
      ct.includes("jpeg") || ct.includes("jpg") ? "jpg" :
      ct.includes("webp") ? "webp" :
      ct.includes("avif") ? "avif" :
      ct.includes("png") ? "png" :
      // content-type ambiguous (e.g. octet-stream) → infer from URL, else default by destination
      (urlExt === "jpeg" ? "jpg" : urlExt) ||
      (videoPrefix ? "mp4" : "png");
    const contentType = ct || (ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : ext === "mp3" ? "audio/mpeg" : `image/${ext === "jpg" ? "jpeg" : ext}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null; // empty / error body
    const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const r = await put(key, buf, { access: "public", contentType, addRandomSuffix: false });
    return r.url;
  } catch {
    return null;
  }
}
