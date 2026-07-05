"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// Delete an influencer from the Studio card. Overlaid on the card (its own click is stopped so it never
// triggers the card's navigation). Confirms, calls DELETE (which purges blobs + drops the row), refreshes.
export default function DeleteInfluencerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (!(await askConfirm({ title: `Delete "${name}"?`, body: "This permanently removes this influencer and everything it owns - reference images, keyframes, clips, voice and the final cut - across the whole platform. This cannot be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/influencers/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        flex(d.error || "Could not delete - please try again.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      flex("Could not delete - check your connection.");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      title={`Delete ${name}`}
      aria-label={`Delete ${name}`}
      className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[12px] text-white backdrop-blur-sm transition hover:bg-alert disabled:opacity-60"
    >
      {busy ? "…" : "🗑"}
    </button>
  );
}
