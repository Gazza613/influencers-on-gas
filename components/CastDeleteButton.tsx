"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// Always-visible delete control for a cast card, so cleaning up the cast list is obvious (not a
// hidden hover-only affordance). Stops the card's Link from navigating.
export default function CastDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy || !(await askConfirm({ title: `Delete "${name}"?`, body: "This removes the influencer and all its looks, and it cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setBusy(true);
    const r = await fetch(`/api/influencers/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (r?.ok) router.refresh();
    else flex("Couldn't delete that influencer.");
  }
  return (
    <button onClick={del} disabled={busy} title={`Delete ${name}`} aria-label={`Delete ${name}`}
      className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/60 text-xs text-white/90 backdrop-blur-sm transition hover:bg-alert hover:text-white disabled:opacity-50">
      {busy ? "…" : "✕"}
    </button>
  );
}
