"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { askConfirm } from "@/lib/confirm";
import { flex } from "@/lib/flex";

// THE BRAND LIBRARY, INSIDE THE BRAIN (Gary: "those intake reference images ... should actually always sit in
// a well structured brain section", and later: "I should be able to upload the brand library directly here -
// logo, photo of CEO / team pics - and remove them if necessary, as opposed to the intake section").
//
// These assets share the brain's client_id, so the reference designs and logos uploaded through Intake have
// always BEEN the client's brain. This shelf now also ADDS and REMOVES them in place: the browser uploads the
// file straight to Blob, then registers it against this brain. No trip through Intake, no second source of truth.

type Asset = { id: string; name: string | null; url: string };
type Group = { kind: string; label: string; note: string; assets: Asset[] };

// What the team can add here, in the order the picker offers them. The kinds match the API's UPLOADABLE set.
const ADD_KINDS: { kind: string; label: string }[] = [
  { kind: "logo", label: "Logo" },
  { kind: "ceo_photo", label: "CEO photo" },
  { kind: "team_photo", label: "Team photo" },
  { kind: "brand_icon", label: "Brand icon" },
  { kind: "image", label: "Other image" },
];

export default function BrainLibrary({ brainId }: { brainId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [zoom, setZoom] = useState<Asset | null>(null);
  const [addKind, setAddKind] = useState("logo");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/brains/${brainId}/assets`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setGroups(d?.groups || []); setTotal(d?.total || 0);
    // Open the group we just added to, so a fresh upload is visible without hunting for it.
    if (d?.groups?.length) setOpen((m) => ({ ...m, [addKind]: m[addKind] ?? true }));
  }, [brainId, addKind]);

  useEffect(() => { load(); }, [load]);

  async function addFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    setErr(""); const failed: string[] = []; let done = 0;
    for (const f of Array.from(list)) {
      setBusy(`${f.name} (${done + 1}/${list.length})`);
      try {
        // Images can be large, so upload straight to Blob (the studio signer allows image types), then register.
        const blob = await upload(`brains/${brainId}/${addKind}/${f.name}`, f, {
          access: "public", handleUploadUrl: "/api/studio/blob-upload",
        });
        const r = await fetch(`/api/brains/${brainId}/assets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: blob.url, kind: addKind, name: f.name, bytes: f.size }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) failed.push(`${f.name}: ${d?.error || "could not add"}`);
      } catch (e) {
        failed.push(`${f.name}: ${String((e as Error)?.message || e).slice(0, 90)}`);
      }
      done++;
    }
    setBusy("");
    if (fileRef.current) fileRef.current.value = "";
    if (failed.length) setErr(failed.join(" · "));
    else flex(`${done} file${done === 1 ? "" : "s"} added to the brand library.`);
    await load();
  }

  async function remove(a: Asset) {
    if (!(await askConfirm({ title: "Remove this file from the brand library?", body: `${a.name || "This file"} - the creatives will no longer have it as a source. This cannot be undone.`, tone: "danger", confirmLabel: "Remove" }))) return;
    setGroups((gs) => gs?.map((g) => ({ ...g, assets: g.assets.filter((x) => x.id !== a.id) })).filter((g) => g.assets.length > 0) ?? gs);
    setTotal((t) => Math.max(0, t - 1));
    await fetch(`/api/brains/${brainId}/assets?assetId=${encodeURIComponent(a.id)}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-6">
      <div className="tabular text-sm uppercase tracking-[0.2em] text-ink-faint">Brand library</div>
      <p className="mt-1.5 text-base text-ink-dim">
        The real artwork this brain builds from: <b className="text-ink">{total}</b> file{total === 1 ? "" : "s"}.
        Add the logo, CEO and team photos here directly. Creatives are forensically matched to these, never invented.
      </p>

      {/* ADD: pick what it is, then choose the file. Images upload straight to Blob so full-resolution files are fine. */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
        <span className="text-base font-semibold text-ink">Add to the library</span>
        <select value={addKind} onChange={(e) => setAddKind(e.target.value)} disabled={!!busy}
          className="rounded-md border border-line bg-surface-1 px-3 py-2 text-base outline-none focus:border-accent">
          {ADD_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="hidden"
          onChange={(e) => addFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          {busy ? `Uploading ${busy}` : "Choose file"}
        </button>
      </div>
      {err && <p className="mt-2 text-base text-[#fca5a5]">{err}</p>}

      {groups && groups.length > 0 && (
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
                      <div key={a.id} className="group relative overflow-hidden rounded-lg border border-line bg-surface-1 transition hover:border-line-strong">
                        <button onClick={() => setZoom(a)} title={a.name || ""} className="block w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.url} alt={a.name || ""} loading="lazy"
                            className="aspect-square w-full bg-white/5 object-contain p-1.5" />
                          <span className="block truncate px-2 pb-1.5 text-[12px] text-ink-faint">{a.name || "untitled"}</span>
                        </button>
                        <button onClick={() => remove(a)} aria-label={`Remove ${a.name || "file"}`} title="Remove from the library"
                          className="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[13px] font-bold text-white opacity-0 transition hover:bg-[#f87171] group-hover:opacity-100">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
