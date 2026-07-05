"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// Delete a finished CUT (the stitched final video) straight from the studio's Latest cuts tile.
// Removes the final video from the studio + showcase but KEEPS the scenes/clips, so it can be
// re-stitched. Overlaid on the tile; its own click never plays/opens the video.
export default function DeleteCutButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !(await askConfirm({
      title: "Delete this cut?",
      body: `The finished video for "${name}" is removed from the studio and showcase. The scenes and clips stay, so you can re-stitch a new cut anytime.`,
      tone: "danger",
      confirmLabel: "Delete cut",
    }))) return;
    setBusy(true);
    const r = await fetch(`/api/influencers/${id}/production/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearFinal: true }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) router.refresh();
    else flex("Couldn't delete that cut - please try again.");
  }

  return (
    <button onClick={del} disabled={busy} title="Delete this cut" aria-label={`Delete the finished cut for ${name}`}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/60 text-xs text-white/90 backdrop-blur-sm transition hover:bg-alert hover:text-white disabled:opacity-50">
      {busy ? "…" : "✕"}
    </button>
  );
}
