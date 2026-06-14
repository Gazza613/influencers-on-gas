import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 "proxy" (formerly middleware). Auth.js gates every matched route via
// the `authorized` callback; unauthenticated requests redirect to /login.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    // Gate page routes. API routes self-gate (return JSON 401/403) so they aren't
    // redirected to /login. Excludes Next internals + static assets too.
    "/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|json)$).*)",
  ],
};
