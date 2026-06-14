import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listInfluencers, createInfluencer } from "@/lib/influencers";
import { ensureUser } from "@/lib/users";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ influencers: await listInfluencers() });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const mode = body.mode === "twin" ? "twin" : "synthetic";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (mode === "twin" && !body.consentId) {
    return NextResponse.json({ error: "Consent is required for a digital twin" }, { status: 400 });
  }

  const createdBy = await ensureUser(session.user.email, session.user.name, session.user.role);
  const id = await createInfluencer({
    name,
    mode,
    persona: typeof body.persona === "object" && body.persona ? body.persona : {},
    consentId: body.consentId ?? null,
    createdBy,
  });
  return NextResponse.json({ id });
}
