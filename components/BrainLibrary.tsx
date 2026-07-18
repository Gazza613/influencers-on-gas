"use client";

import { useEffect, useState } from "react";

// THE BRAND LIBRARY, INSIDE THE BRAIN (Gary: "those intake reference images ... should actually always sit in
// a well structured brain section").
//
// These assets were never somewhere else. studio_assets is keyed by client_id, the same key as the brain's
// chunks, so the reference designs and logos uploaded through Intake have always BEEN the client's brain -
// they were just only ever drawn on the Intake screen. Showing a chunk count while hiding 177 brand assets
// understated what the brain holds by more than half.
//
// Grouped by kind and collapsed by default: this is a reference shelf you open when you want to check what the
// brain is working from, not a gallery that should push the knowledge tools off the screen.

type Asset = { id: string; name: string | null; url: string };
type Group = { kind: string; label: string; note: string; assets: Asset[] };

export default function BrainLibrary({ brainId }: { brainId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<Asset | null>(null);

  useEffect(() => {
    fetch(`/api/brains/${brainId}/assets`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setGroups(d.groups || []); setTotal(d.total || 0); })
      .catch(() => setGroups([]));
  }, [brainId]);

  // A brain with no uploaded brand material should say nothing at all rather than show an empty shelf.
  if (!groups || groups.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-6">
      <div className="tabular text-sm uppercase tracking-[0.2em] text-ink-faint">Brand library</div>
      <p className="mt-1.5 text-base text-ink-dim">
        The real artwork this brain builds from: <b className="text-ink">{total}</b> file{total === 1 ? "" : "s"} uploaded through Intake.
        Creatives are forensically matched to these, never invented.
      </p>

      <div className="mt-4 space-y-2.5">
        {groups.map((g) => {
          const isOpen = open[g.kind];
          return (
            <div key={g.kind} className="rounded-lg border border-line bg-surface-2">
              <button onClick={() => setOpen((m) => ({ ...m, [g.kind]: !isOpen }))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span className="min-w-0">
                  <span className="text-base font-bold text-ink">{g.label}</span>
                  <span className="tabular ml-2.5 text-[14px] text-ink-faint">{g.assets.length}</span>
                  {g.note && <span className="mt-0.5 block text-[14px] text-ink-dim">{g.note}</span>}
                </span>
                <span className="shrink-0 text-base text-ink-faint">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="grid grid-cols-3 gap-2.5 border-t border-line p-4 sm:grid-cols-5">
                  {g.assets.map((a) => (
                    <button key={a.id} onClick={() => setZoom(a)} title={a.name || ""}
                      className="group overflow-hidden rounded-lg border border-line bg-surface-1 transition hover:border-line-strong">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={a.name || ""} loading="lazy"
                        className="aspect-square w-full bg-white/5 object-contain p-1.5" />
                      <span className="block truncate px-2 pb-1.5 text-[12px] text-ink-faint">{a.name || "untitled"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {zoom && (
        <div onClick={() => setZoom(null)} role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url} alt={zoom.name || ""} className="max-h-[90vh] max-w-[95vw] rounded-lg bg-white/5" />
          <button onClick={() => setZoom(null)}
            className="absolute right-5 top-5 rounded-lg bg-white/10 px-3.5 py-2 text-base font-bold text-white hover:bg-white/20">Close ✕</button>
        </div>
      )}
    </div>
  );
}
