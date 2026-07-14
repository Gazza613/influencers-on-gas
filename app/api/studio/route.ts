import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrandKit, listAssets, listTemplates, deleteAsset, deleteTemplate, listStudioClients } from "@/lib/studio";

// What GAS Studio knows about a client: its brand kit (logos, licensed fonts, colours), the templates
// ingested from its reference set, and its asset library. `clients` is the single tenancy key across the
// whole platform, so the Studio picks the SAME client list the influencer brains use - one client, one
// brand, one brain, rather than a second parallel notion of "client".
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  // Clients WITH a brand kit come first. The picker defaults to clients[0], so ordering by "any brain"
  // silently landed on a client the Studio knows nothing about and every panel came back empty.
  const clients = await listStudioClients().catch(() => []);
  if (!clientId) return NextResponse.json({ clients });

  const [brandKit, templates, assets] = await Promise.all([
    getBrandKit(clientId).catch(() => null),
    listTemplates(clientId).catch(() => []),
    listAssets(clientId).catch(() => []),
  ]);
  return NextResponse.json({ clients, brandKit, templates, assets });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = new URL(req.url);
  const clientId = u.searchParams.get("clientId") || "";
  const assetId = u.searchParams.get("assetId") || "";
  const templateId = u.searchParams.get("templateId") || "";
  if (!clientId) return NextResponse.json({ error: "Missing client" }, { status: 400 });
  if (templateId) await deleteTemplate(clientId, templateId);
  if (assetId) await deleteAsset(clientId, assetId);
  return NextResponse.json({ ok: true });
}
