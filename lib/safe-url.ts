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
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host) || isPrivateIPv4(host)) return false;
  return true;
}
