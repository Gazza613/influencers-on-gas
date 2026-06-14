import { NextResponse } from "next/server";
import { createHash } from "crypto";

// TEMPORARY diagnostic — returns only a hash prefix of the runtime signing key so we
// can confirm the deployment has the expected value WITHOUT exposing the secret. DELETE.
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("k") !== "keyprobe-7f3a91") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const key = process.env.INNGEST_SIGNING_KEY || "";
  const sha = (s: string) => (s ? createHash("sha256").update(s).digest("hex").slice(0, 12) : null);
  return NextResponse.json({
    set: !!key,
    length: key.length,
    sha12: sha(key),
    event_key_set: !!process.env.INNGEST_EVENT_KEY,
  });
}
