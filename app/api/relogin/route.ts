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
export async function GET(req: Request) {
  // Re-gate on reload (Gary's security posture) and land on the PUBLIC LANDING PAGE - the front door, clean.
  //
  // NOTHING IS CARRIED ACROSS. An earlier version passed the page you were on as ?next= so signing back in
  // returned you there, but that put a query string on the landing page and dropped you straight back where
  // you started (Gary). A re-gate should end at the beginning: front door, then whatever journey you choose.
  const res = NextResponse.redirect(new URL("/", req.url));
  for (const name of COOKIES) res.cookies.set(name, "", { path: "/", expires: new Date(0) });
  // Don't let this hop get cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
