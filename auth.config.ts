import type { NextAuthConfig } from "next-auth";

// Edge-safe config shared by the middleware and the full auth instance.
// (No providers here — providers with Node deps live in auth.ts.)
export const authConfig = {
  trustHost: true,
  // Unauthenticated access to a gated route lands on the public homepage (not the login form);
  // the user enters via Get Started -> /login.
  pages: { signIn: "/" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h
  callbacks: {
    // The public marketing homepage is open to everyone; every other matched route
    // requires a signed-in user (Get Started -> /login gates entry to the app).
    //
    // A VALID TOKEN IS NO LONGER ENOUGH. It also has to still belong to an active account, checked against the
    // database on the request. Without this, removing someone left their 8-hour JWT working and "revoke"
    // meant "revoke, eventually". Now their very next click is refused.
    async authorized({ auth, request }) {
      if (request.nextUrl.pathname === "/") return true;
      if (!auth?.user) return false;
      const { isStillAllowed } = await import("./lib/access-check");
      return isStillAllowed(auth.user.email);
    },
    jwt({ token, user }) {
      if (user) token.role = (user as { role?: string }).role ?? "producer";
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.role = (token.role as string) ?? "producer";
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
