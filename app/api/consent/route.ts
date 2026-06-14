import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveConsentText, recordConsent } from "@/lib/consent";
import { ensureUser } from "@/lib/users";

// Records a POPIA/GDPR consent and returns its id. Called before any real
// photo/voice upload (the consent gate). All four affirmations must be ticked.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const subjectName = String(body.subjectName ?? "").trim();
  const dataType = body.dataType === "voice" ? "voice" : "image";
  if (!subjectName) return NextResponse.json({ error: "Subject name is required" }, { status: 400 });
  if (body.affirmed !== true) {
    return NextResponse.json({ error: "All consent affirmations must be ticked" }, { status: 400 });
  }

  const text = await getActiveConsentText();
  if (!text) return NextResponse.json({ error: "No active consent text configured" }, { status: 500 });

  const grantedBy = await ensureUser(session.user.email, session.user.name, session.user.role);
  const id = await recordConsent({
    subjectName,
    subjectEmail: body.subjectEmail ?? null,
    dataType,
    scope: String(body.scope ?? "AI likeness / voice clone for marketing video content"),
    consentTextId: text.id,
    grantedBy,
  });
  return NextResponse.json({ id });
}
