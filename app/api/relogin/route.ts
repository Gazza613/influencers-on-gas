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

// A safe INTERNAL path only (single leading "/", never "//" or a scheme, never an API route) so
// return-to-where-you-were can't become an open redirect.
function safeNext(v: string | null): string {
  if (!v) return "";
  try { v = decodeURIComponent(v); } catch { return ""; }
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.startsWith("/api/")) return "";
  return v.slice(0, 300);
}

export async function GET(req: Request) {
  // Re-gate on reload (Gary's security posture) BUT remember where the user was, so after signing back in
  // they land on the SAME page, not the homepage - the #1 trust fix from the journey audit.
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("to"));
  const res = NextResponse.redirect(new URL(next ? `/login?next=${encodeURIComponent(next)}` : "/login", req.url));
  for (const name of COOKIES) res.cookies.set(name, "", { path: "/", expires: new Date(0) });
  // Don't let this hop get cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}
