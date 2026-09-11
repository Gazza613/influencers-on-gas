// SSRF guard: before the server fetches a URL that could be influenced by request input,
// require https and reject localhost / private / link-local / metadata hosts. This is a
// pragmatic literal-host check (not full DNS-rebind protection), applied at every server-side
// fetch chokepoint (rehost, upscale, media import).
const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1|\[::1\]|metadata\.|.*\.internal)$/i;

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;            // link-local / cloud metadata
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

// The host half of the check, shared by every variant: reject IPv6 literals and private / link-local /
// metadata / internal hosts. The protocol requirement differs by caller (blobs/media are https-only; a crawl
// target may legitimately be http), so that is decided by the callers below, not here.
function isPublicHost(hostname: string): boolean {
  let host = hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1); // trailing dot ("...internal.") must not bypass the anchors below
  // Reject EVERY IPv6 literal. We never legitimately fetch an IP-literal host (always vendor hostnames /
  // *.blob.vercel-storage.com / a client's own domain), and IPv6 literals are the SSRF bypass surface that the
  // IPv4-only checks miss: ::1, ULA fc00::/7 (fc/fd), link-local fe80::/10, and IPv4-mapped metadata
  // (::ffff:169.254.169.254). `new URL(...).hostname` strips the [ ] brackets, so any IPv6 host still has a ":".
  if (host.includes(":")) return false;
  if (PRIVATE_HOST.test(host) || isPrivateIPv4(host)) return false;
  return true;
  // NOTE (follow-up): this is still literal-host only. A PUBLIC name that resolves to a private/link-local IP
  // (DNS rebind, e.g. 169.254.169.254.nip.io) and a public URL that 302-redirects to an internal IP are NOT
  // caught here - that needs async DNS re-resolution + redirect:"manual" re-validation at each fetch site.
}

export function isSafePublicUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  return isPublicHost(u.hostname);
}

// A CRAWL/INGEST TARGET (a client's own website). Same host guard, but http is allowed as well as https because a
// legitimate client site may still be http-only - blocking that would be a real regression, and the SSRF risk is
// the internal HOST, not the scheme. Applied at every door that turns request input into a server-side fetch of a
// site: adding a website/crawl source, re-crawling one, and fetching the sitemap.
export function isSafeCrawlTarget(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return isPublicHost(u.hostname);
}

// IS THIS A URL IN OUR OWN BLOB STORE? A HOST check, not a substring: a substring test
// (/\.blob\.vercel-storage\.com\//.test(url)) matches the PATH too, so
// https://attacker.com/.blob.vercel-storage.com/x.png would pass and be trusted as "ours".
// We register/ingest blobs by URL, so this must be exact: the hostname itself must be the store.
export function isOwnBlobUrl(url: unknown): url is string {
  if (!isSafePublicUrl(url)) return false;
  try {
    return new URL(url as string).hostname.toLowerCase().endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
