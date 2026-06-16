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

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  for (const name of COOKIES) res.cookies.set(name, "", { path: "/", expires: new Date(0) });
  // Don't let this hop get cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
