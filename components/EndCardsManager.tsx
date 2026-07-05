"use client";

import { useState } from "react";
import Uploader from "@/components/Uploader";
import { askConfirm } from "@/lib/confirm";

type EndCard = { id: string; label: string; url: string; kind: "image" | "video"; ratio: "9:16" | "1:1"; created_at: string };

// Upload + manage a reusable library of closing frames/clips. The Producer brief/stitch can pick one
// to append to any cut. Grouped by aspect ratio so each shows at its true size (never cropped).
export default function EndCardsManager({ initial }: { initial: EndCard[] }) {
  const [cards, setCards] = useState<EndCard[]>(initial);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<"image" | "video">("video");
  const [ratio, setRatio] = useState<"9:16" | "1:1">("9:16");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!url || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/end-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), url, kind, ratio }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.endCard) { setCards((c) => [r.endCard, ...c]); setUrl(null); setLabel(""); } else setErr(r?.error || "Couldn't save the end card.");
  }
  async function del(id: string) {
    if (!(await askConfirm({ title: "Delete this end card?", body: "It can't be undone.", tone: "danger", confirmLabel: "Delete" }))) return;
    setCards((c) => c.filter((x) => x.id !== id));
    await fetch(`/api/end-cards/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const vertical = cards.filter((c) => c.ratio !== "1:1");
  const square = cards.filter((c) => c.ratio === "1:1");

  const Card = ({ c }: { c: EndCard }) => (
    <div className="group relative overflow-hidden rounded-xl border border-line bg-surface-1">
      {c.kind === "video"
        ? <video src={c.url} controls playsInline className={`w-full bg-black object-contain ${c.ratio === "1:1" ? "aspect-square" : "aspect-[9/16]"}`} />
        /* eslint-disable-next-line @next/next/no-img-element */
        : <img src={c.url} alt={c.label} className={`w-full bg-black object-contain ${c.ratio === "1:1" ? "aspect-square" : "aspect-[9/16]"}`} />}
      <button onClick={() => del(c.id)} title="Delete end card" aria-label="Delete end card" className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-alert/60 bg-black/70 text-xs text-alert transition hover:bg-alert/30">✕</button>
      <div className="p-2.5"><div className="truncate text-[12px] font-semibold text-ink">{c.label || "End card"}</div><div className="tabular text-[10px] uppercase text-ink-faint">{c.kind} · {c.ratio}</div></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Upload a new end card */}
      <div className="space-y-3 rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Add an end card</div>
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Type</div>
            <div className="flex gap-2">
              {(["video", "image"] as const).map((k) => (
                <button key={k} onClick={() => { setKind(k); setUrl(null); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize ${kind === k ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{k === "video" ? "🎬 Video" : "🖼 Image"}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Shape</div>
            <div className="flex gap-2">
              {(["9:16", "1:1"] as const).map((r) => (
                <button key={r} onClick={() => setRatio(r)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${ratio === r ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{r === "9:16" ? "▯ 9:16 vertical" : "◻ 1:1 square"}</button>
              ))}
            </div>
          </div>
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it (e.g. MoMo end card - yellow)" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
        <Uploader kind="endcard" accept={kind} label={`Upload your ${ratio} end ${kind}`} current={url} onUploaded={setUrl} />
        {err && <p className="text-xs text-alert">{err}</p>}
        <button onClick={add} disabled={!url || busy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{busy ? "Saving…" : "＋ Add to library"}</button>
      </div>

      {/* Library - grouped by shape so each shows at its correct size */}
      {cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface-1 p-6 text-center text-sm text-ink-faint">No end cards yet. Upload a closing clip or frame above - it&apos;ll be available to append to any cut in the Producer.</p>
      ) : (
        <>
          {vertical.length > 0 && (
            <div>
              <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Vertical · 9:16 · {vertical.length}</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{vertical.map((c) => <Card key={c.id} c={c} />)}</div>
            </div>
          )}
          {square.length > 0 && (
            <div>
              <div className="tabular mb-3 text-xs uppercase tracking-[0.2em] text-ink-faint">Square · 1:1 · {square.length}</div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{square.map((c) => <Card key={c.id} c={c} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
