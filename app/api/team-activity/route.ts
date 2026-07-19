import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActivity } from "@/lib/activity";

// Team adoption: who signed in, what they built, which desks they use.
// Super-admin only. This is other people's activity, so it is not something every member should be able to read.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "super_admin" && session.user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const days = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get("days") || 7), 365));
  return NextResponse.json(await getActivity(days));
}
