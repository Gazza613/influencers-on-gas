import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyFal } from "@/lib/vendors/fal";

// Quick check that the fal.ai key is connected + OmniHuman is reachable (no spend). Super-admin only.
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  return NextResponse.json(await verifyFal());
}
