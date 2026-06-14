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
        Connect your vendor accounts here. Keys are <strong>encrypted at rest</strong> and never
        leave the server. You can <strong>revoke any connection instantly</strong> with Disconnect —
        use it immediately if a key is ever leaked or compromised. The produce flow unlocks once
        the required tools are connected.
      </p>
      <ConnectTools initial={connections} canEdit={session?.user?.role === "super_admin"} />
    </div>
  );
}
