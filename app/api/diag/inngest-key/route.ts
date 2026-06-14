import { NextResponse } from "next/server";
import { createHash } from "crypto";

// TEMPORARY diagnostic — returns only a hash prefix of the runtime signing key so we
// can confirm the deployment has the expected value WITHOUT exposing the secret. DELETE.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "keyprobe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const key = process.env.INNGEST_SIGNING_KEY || "";
  const ek = process.env.INNGEST_EVENT_KEY || "";
  const sha = (s: string) => (s ? createHash("sha256").update(s).digest("hex").slice(0, 12) : null);
  return NextResponse.json({
    vercel_env: process.env.VERCEL_ENV || null,
    signing_set: !!key,
    signing_length: key.length,
    signing_sha12: sha(key),
    event_length: ek.length,
    event_sha12: sha(ek),
  });
}
