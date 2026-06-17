"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Influencer } from "@/lib/influencers";
import { buildProgress, ringColour } from "@/lib/build-progress";
import ConsentGate from "@/components/ConsentGate";
import Uploader from "@/components/Uploader";

type Mode = "synthetic" | "twin";

function Ring({ pct, size = 34 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line, #ffffff14)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColour(pct)} strokeWidth="3"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

export default function InfluencerRoster({ influencers }: { influencers: Influencer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Render the live list from the layout (do NOT snapshot into state, or newly
  // created influencers won't appear until a hard reload).
  const list = influencers;
  const [modal, setModal] = useState<Mode | null>(null);
  const [consentFor, setConsentFor] = useState<{ name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "">("");
  const [look, setLook] = useState<"natural" | "photoshoot">("natural");
  const [refUrl, setRefUrl] = useState<string | null>(null); // optional reference for synthetic
  const [twinName, setTwinName] = useState("");
  const [twinConsentId, setTwinConsentId] = useState<string | null>(null);
  const [twinPhotos, setTwinPhotos] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  function reset() { setModal(null); setConsentFor(null); setName(""); setGender(""); setLook("natural"); setRefUrl(null); setTwinName(""); setTwinConsentId(null); setTwinPhotos([]); }

  async function remove(e: React.MouseEvent, inf: Influencer) {
    e.preventDefault(); e.stopPropagation();
    if (deleting || !confirm(`Delete "${inf.name}"? This removes the influencer and all its looks. This cannot be undone.`)) return;
    setDeleting(inf.id);
    const r = await fetch(`/api/influencers/${inf.id}`, { method: "DELETE" });
    setDeleting(null);
    if (r.ok) {
      if (pathname.startsWith(`/setup/influencers/${inf.id}`)) router.push("/setup/influencers");
      router.refresh();
    }
  }

  async function rename(e: React.MouseEvent, inf: Influencer) {
    e.preventDefault(); e.stopPropagation();
    const next = window.prompt("Rename influencer", inf.name)?.trim();
    if (!next || next === inf.name) return;
    const r = await fetch(`/api/influencers/${inf.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: next }) });
    if (r.ok) router.refresh();
  }

  async function createSynthetic() {
    if (!name.trim() || !gender || busy) return;
    setBusy(true);
    const r = await fetch("/api/influencers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), mode: "synthetic", persona: { ...(refUrl ? { reference_url: refUrl } : {}), gender, look } }),
    });
    setBusy(false);
    if (r.ok) { const { id } = await r.json(); reset(); router.push(`/setup/influencers/${id}`); router.refresh(); }
  }

  async function createTwin() {
    if (!twinConsentId || twinPhotos.length < 3 || busy) return;
    setBusy(true);
    const r = await fetch("/api/influencers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: twinName.trim(), mode: "twin", consentId: twinConsentId, persona: { reference_url: twinPhotos[0], reference_images: twinPhotos } }),
    });
    setBusy(false);
    if (r.ok) { const { id } = await r.json(); reset(); router.push(`/setup/influencers/${id}`); router.refresh(); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Influencers</span>
        <button onClick={() => setModal("synthetic")} className="btn-brand rounded-md px-2.5 py-1 text-xs font-bold">+ New</button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {list.length === 0 && <p className="px-1 py-4 text-xs text-ink-faint">No influencers yet. Hit + New to build one.</p>}
        {list.map((inf) => {
          const { pct } = buildProgress(inf);
          const active = pathname === `/setup/influencers/${inf.id}`;
          const face = (inf.persona as { hero_url?: string })?.hero_url || (inf.look_refs as { url: string; hero?: boolean }[])?.find?.((r) => r.hero)?.url;
          return (
            <Link key={inf.id} href={`/setup/influencers/${inf.id}`}
              className={`group relative flex items-center gap-3 rounded-lg px-2 py-2 transition ${active ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
              <div className="relative">
                <Ring pct={pct} />
                <div className="absolute inset-0 flex items-center justify-center">
                  {face ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={face} alt={inf.name} className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-bold text-ink-faint">{pct}%</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{inf.name}</div>
                <div className="tabular text-[10px] uppercase tracking-wide text-ink-faint">{inf.mode === "twin" ? "digital twin" : "influencer"}</div>
              </div>
              <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-hover:flex">
                <button onClick={(e) => rename(e, inf)} title={`Rename ${inf.name}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint hover:bg-[#a855f7]/15 hover:text-[#c79bff]">✎</button>
                <button onClick={(e) => remove(e, inf)} title={`Delete ${inf.name}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint hover:bg-alert/15 hover:text-alert">
                  {deleting === inf.id ? "…" : "✕"}
                </button>
              </div>
            </Link>
          );
        })}
      </div>

      <button onClick={() => setModal("twin")} className="mt-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">
        + Build Me (digital twin)
      </button>

      {modal === "synthetic" && (
        <Modal title="New influencer" onClose={reset}>
          <p className="text-xs text-ink-dim">Just a name to start. Character Casting, the look casting and everything else happen on the next screen.</p>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createSynthetic()}
            placeholder="e.g. Ava" className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
          <div>
            <p className="mb-1.5 text-[11px] text-ink-faint">Gender</p>
            <div className="grid grid-cols-2 gap-2">
              {(["female", "male"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setGender(g)}
                  className={`rounded-lg border py-2 text-sm font-semibold transition ${gender === g ? "border-[#a855f7] bg-[#a855f7]/15 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}>
                  {g === "female" ? "♀ Female" : "♂ Male"}
                </button>
              ))}
            </div>
          </div>
          {gender && (
            <div>
              <p className="mb-1.5 text-[11px] text-ink-faint">Look</p>
              <div className="grid grid-cols-2 gap-2">
                {([["natural", gender === "female" ? "minimal / no makeup" : "understated, bare skin"], ["photoshoot", gender === "female" ? "styled + tasteful makeup" : "groomed, editorial"]] as const).map(([k, hint]) => (
                  <button key={k} type="button" onClick={() => setLook(k as "natural" | "photoshoot")}
                    className={`rounded-lg border px-2 py-2 text-left transition ${look === k ? "border-[#a855f7] bg-[#a855f7]/15" : "border-line hover:border-line-strong"}`}>
                    <div className={`text-sm font-semibold capitalize ${look === k ? "text-[#c79bff]" : "text-ink-dim"}`}>{k}</div>
                    <div className="text-[10px] text-ink-faint">{hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] text-ink-faint">Optional: upload a reference image to steer the look. With one, we skip casting and shoot straight from your reference.</p>
            <Uploader kind="reference" label="Reference image (optional)" current={refUrl} onUploaded={setRefUrl} />
          </div>
          <Actions onCancel={reset} onConfirm={createSynthetic} label={busy ? "Creating…" : "Create influencer →"} disabled={!name.trim() || !gender || busy} />
        </Modal>
      )}
      {modal === "twin" && !consentFor && (
        <Modal title="Build Me: digital twin" onClose={reset}>
          <p className="text-xs text-ink-dim">Your own likeness, from a photo. We capture consent before any upload (POPIA / GDPR).</p>
          <input autoFocus value={twinName} onChange={(e) => setTwinName(e.target.value)} placeholder="e.g. Gary"
            className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
          <Actions onCancel={reset} onConfirm={() => setConsentFor({ name: twinName })} label="Continue to consent →" disabled={!twinName.trim()} />
        </Modal>
      )}
      {modal === "twin" && consentFor && !twinConsentId && (
        <ConsentGate dataType="image" onCancel={() => setConsentFor(null)} onConfirm={(consentId) => setTwinConsentId(consentId)} />
      )}
      {modal === "twin" && twinConsentId && (
        <Modal title="Upload your photos" onClose={reset}>
          <p className="text-xs text-ink-dim">Upload <span className="text-ink">at least 3</span> clear photos (5 to 10 is ideal): different angles, lighting and expressions, one face per photo, no sunglasses or hats. More varied photos means a far more accurate twin.</p>
          {twinPhotos.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {twinPhotos.map((u, i) => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`photo ${i + 1}`} className="aspect-square w-full rounded-lg border border-line object-cover" />
                  <button onClick={() => setTwinPhotos((p) => p.filter((x) => x !== u))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-alert text-[10px] font-bold text-white">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3"><Uploader kind="twin" multiple label={twinPhotos.length ? "Add more photos" : "Add photos"} current={null} onUploaded={(u) => setTwinPhotos((p) => (u && !p.includes(u) ? [...p, u] : p))} /></div>
          <p className="mt-2 text-[11px] text-ink-faint">{twinPhotos.length} added{twinPhotos.length > 0 && twinPhotos.length < 3 ? ` · ${3 - twinPhotos.length} more needed` : ""}</p>
          <Actions onCancel={reset} onConfirm={createTwin} label={busy ? "Creating…" : "Create digital twin"} disabled={twinPhotos.length < 3 || busy} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Actions({ onCancel, onConfirm, label, disabled }: { onCancel: () => void; onConfirm: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Cancel</button>
      <button onClick={onConfirm} disabled={disabled} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{label}</button>
    </div>
  );
}
