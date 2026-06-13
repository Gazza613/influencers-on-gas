import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 "proxy" (formerly middleware). Auth.js gates every matched route via
// the `authorized` callback; unauthenticated requests redirect to /login.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    // Everything except auth API, the login page, Next internals, and static assets.
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|json)$).*)",
  ],
};
