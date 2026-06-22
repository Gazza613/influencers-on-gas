import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listEndCards, addEndCard } from "@/lib/endcards";
import { isSafePublicUrl } from "@/lib/safe-url";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ endCards: await listEndCards() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 160) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const url = String(b?.url || "").trim();
  if (!url) return NextResponse.json({ error: "An uploaded file is required." }, { status: 400 });
  if (!isSafePublicUrl(url)) return NextResponse.json({ error: "Invalid file URL." }, { status: 400 }); // SSRF guard
  const kind = b?.kind === "video" ? "video" : "image";
  const ratio = b?.ratio === "1:1" ? "1:1" : "9:16";
  try {
    return NextResponse.json({ endCard: await addEndCard(String(b?.label || "").trim(), url, kind, ratio) });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 160) }, { status: 500 });
  }
}
