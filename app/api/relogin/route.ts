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
// tab turns "/<tab>/outside.example" into "//outside.example" -> cross-origin). The origin comparison then
// rejects anything off-origin; we also drop /api routes and only ever return a path+query, never an absolute URL.
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
  // Re-gate on reload (Gary's security posture), but land on the PUBLIC LANDING PAGE rather than the login
  // form (Gary). Being dropped straight onto a password prompt reads as "you have been kicked out"; the front
  // door reads as "you are signed out", which is the same fact told properly.
  //
  // The ?next= still rides along, handed to the landing page and passed on to /login when the user chooses to
  // sign in, so the return-to-the-same-page behaviour is not lost on the way.
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("to"), url.origin);
  const res = NextResponse.redirect(new URL(next ? `/?next=${encodeURIComponent(next)}` : "/", req.url));
  for (const name of COOKIES) res.cookies.set(name, "", { path: "/", expires: new Date(0) });
  // Don't let this hop get cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
