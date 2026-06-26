import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { submitDopVideo, pollDopOnce, dopConfigured } from "@/lib/vendors/higgsfield-dop";

// TEMPORARY diagnostic: confirm the Higgsfield DoP path end-to-end with the LIVE creds (which are
// redacted on env pull, so this is the only way to see the real submit/poll behaviour). Super-admin
// only. Hit /api/dop-test in the browser; it submits one DoP job + polls once and returns the raw result.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEFAULT_IMG = "https://wlreg8cyfcazuxyk.public.blob.vercel-storage.com/shots/1782328004162-dseqxqt1wdk.png";

export async function GET(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const img = new URL(req.url).searchParams.get("img") || DEFAULT_IMG;

  const configured = dopConfigured();
  const submit = await submitDopVideo({ imageUrl: img, prompt: "a person in a room, gentle natural handheld motion, real-time speed", seconds: 5 });
  let poll: unknown = null;
  if (submit.jobSetId) {
    await new Promise((r) => setTimeout(r, 9000)); // give it a beat, then read status once
    poll = await pollDopOnce(submit.jobSetId);
  }
  return NextResponse.json({ configured, img, submit, poll });
}
