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

export function isSafePublicUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  let host = u.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1); // trailing dot ("...internal.") must not bypass the anchors below
  // Reject EVERY IPv6 literal. We never legitimately fetch an IP-literal host (always vendor hostnames /
  // *.blob.vercel-storage.com), and IPv6 literals are the SSRF bypass surface that the IPv4-only checks miss:
  // ::1, ULA fc00::/7 (fc/fd), link-local fe80::/10, and IPv4-mapped metadata (::ffff:169.254.169.254).
  // `new URL(...).hostname` strips the [ ] brackets, so any IPv6 host still contains a ":".
  if (host.includes(":")) return false;
  if (PRIVATE_HOST.test(host) || isPrivateIPv4(host)) return false;
  return true;
  // NOTE (follow-up): this is still literal-host only. A PUBLIC name that resolves to a private/link-local IP
  // (DNS rebind, e.g. 169.254.169.254.nip.io) and a public URL that 302-redirects to an internal IP are NOT
  // caught here - that needs async DNS re-resolution + redirect:"manual" re-validation at each fetch site.
}
