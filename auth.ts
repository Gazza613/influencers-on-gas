import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { timingSafeEqual } from "node:crypto";
import { authConfig } from "./auth.config";

const ALLOWED_DOMAIN = "@gasmarketing.co.za";

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // v1: single super-admin from env (Gary). Domain-gated.
      // Phase 1b moves this to the `users` table in Neon.
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        const saEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
        const saPass = process.env.SUPER_ADMIN_PASSWORD ?? "";
        if (!saEmail || !saPass) return null;
        if (!email.endsWith(ALLOWED_DOMAIN)) return null;
        if (safeEqual(email, saEmail) && safeEqual(password, saPass)) {
          return { id: email, email, name: "Gary Berman", role: "super_admin" };
        }
        return null;
      },
    }),
  ],
});
