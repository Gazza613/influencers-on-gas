import { auth } from "@/auth";
import { listConnections } from "@/lib/connections";
import ConnectTools from "@/components/ConnectTools";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const session = await auth();
  const connections = await listConnections();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Connect Tools</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-dim">
        GAS connects its vendor accounts here. Keys are <strong>encrypted at rest</strong> and
        never leave the server. The produce flow unlocks once the required tools are connected.
        Keys already set in the environment show as “connected”.
      </p>
      <ConnectTools initial={connections} canEdit={session?.user?.role === "super_admin"} />
    </div>
  );
}
