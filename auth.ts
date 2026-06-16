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
        if (!email || !password) return null;

        // 1) Env super-admin (Gary) — always works, even if the DB is down.
        const saEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").toLowerCase().trim();
        const saPass = process.env.SUPER_ADMIN_PASSWORD ?? "";
        if (saEmail && saPass && email.endsWith(ALLOWED_DOMAIN) && safeEqual(email, saEmail) && safeEqual(password, saPass)) {
          return { id: email, email, name: "Gary Berman", role: "super_admin" };
        }

        // 2) Invited team members from the users table (active + password set).
        // Gated to GAS Marketing emails only.
        if (!email.endsWith(ALLOWED_DOMAIN)) return null;
        try {
          const { verifyUser } = await import("./lib/users");
          const u = await verifyUser(email, password);
          if (u) return { id: u.id, email: u.email, name: u.name ?? u.email, role: u.role };
        } catch {
          /* DB unreachable — fall through to deny */
        }
        return null;
      },
    }),
  ],
});
