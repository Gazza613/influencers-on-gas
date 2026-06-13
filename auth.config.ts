import type { NextAuthConfig } from "next-auth";

// Edge-safe config shared by the middleware and the full auth instance.
// (No providers here — providers with Node deps live in auth.ts.)
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h
  callbacks: {
    // Gate every matched route: only a signed-in user may pass.
    authorized({ auth }) {
      return !!auth?.user;
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
