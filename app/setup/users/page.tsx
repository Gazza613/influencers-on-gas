import { auth } from "@/auth";
import TeamManager from "@/components/TeamManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-surface-1 p-6 text-center">
        <div className="text-sm font-semibold text-ink">Super admin only</div>
        <p className="mt-1 text-xs text-ink-dim">Only a super admin can manage team access. Ask Gary if you need a teammate added.</p>
      </div>
    );
  }
  return <TeamManager />;
}
