import { NextResponse } from "next/server";

// Fast re-gate: clear the session cookies and bounce to /login. Hit by the
// inline reload-detector in the root layout so a hard refresh lands on login
// immediately, with no flash of the signed-in page.
const COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.session-token.0",
  "authjs.session-token.1",
  "__Secure-authjs.session-token.0",
  "__Secure-authjs.session-token.1",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

// A safe SAME-ORIGIN internal path only. We resolve against the real origin with `new URL`, which NORMALISES
// away control chars (tab/CR/LF) that browsers strip and that a bare prefix-check would miss (e.g. an encoded
// tab turns "/<tab>/evil.com" into "//evil.com" -> cross-origin). The origin comparison then rejects anything
// off-origin; we also drop /api routes and only ever return a path+query, never an absolute URL.
function safeNext(v: string | null, origin: string): string {
  if (!v) return "";
  try { v = decodeURIComponent(v); } catch { return ""; }
  let u: URL;
  try { u = new URL(v, origin); } catch { return ""; }
  if (u.origin !== origin || u.pathname.startsWith("/api/")) return "";
  const path = u.pathname + u.search;
  return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 300) : "";
}

export async function GET(req: Request) {
  // Re-gate on reload (Gary's security posture) BUT remember where the user was, so after signing back in
  // they land on the SAME page, not the homepage - the #1 trust fix from the journey audit.
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("to"), url.origin);
  const res = NextResponse.redirect(new URL(next ? `/login?next=${encodeURIComponent(next)}` : "/login", req.url));
  for (const name of COOKIES) res.cookies.set(name, "", { path: "/", expires: new Date(0) });
  // Don't let this hop get cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
