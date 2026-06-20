"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Small hover-reveal delete control for a cast card. Stops the card's Link from navigating.
export default function CastDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function del(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy || !confirm(`Delete "${name}"? This removes the influencer and all its looks, and it cannot be undone.`)) return;
    setBusy(true);
    const r = await fetch(`/api/influencers/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (r?.ok) router.refresh();
    else alert("Couldn't delete that influencer.");
  }
  return (
    <button onClick={del} disabled={busy} title={`Delete ${name}`}
      className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/55 text-xs text-white/80 opacity-0 backdrop-blur-sm transition hover:bg-alert/85 hover:text-white group-hover:opacity-100 disabled:opacity-50">
      {busy ? "…" : "✕"}
    </button>
  );
}
