"use client";

import { useState } from "react";
import Link from "next/link";
import type { Influencer } from "@/lib/influencers";
import ConsentGate from "@/components/ConsentGate";

type Mode = "synthetic" | "twin";

export default function InfluencersManager({ initial }: { initial: Influencer[] }) {
  const [list, setList] = useState(initial);
  const [modal, setModal] = useState<Mode | null>(null);
  const [consentFor, setConsentFor] = useState<{ name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // synthetic form
  const [form, setForm] = useState({
    name: "", gender: "", age_range: "", niche: "", vibe: "", wardrobe: "", setting: "",
  });
  // twin form
  const [twinName, setTwinName] = useState("");

  async function refresh() {
    const r = await fetch("/api/influencers", { cache: "no-store" });
    if (r.ok) setList((await r.json()).influencers);
  }

  async function createSynthetic() {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    const { name, ...persona } = form;
    const r = await fetch("/api/influencers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), mode: "synthetic", persona }),
    });
    setBusy(false);
    if (r.ok) {
      setModal(null);
      setForm({ name: "", gender: "", age_range: "", niche: "", vibe: "", wardrobe: "", setting: "" });
      await refresh();
    }
  }

  async function createTwin(consentId: string) {
    setBusy(true);
    const r = await fetch("/api/influencers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: twinName.trim(), mode: "twin", consentId }),
    });
    setBusy(false);
    setConsentFor(null);
    setModal(null);
    setTwinName("");
    if (r.ok) await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this influencer?")) return;
    await fetch(`/api/influencers/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="mt-7">
      <div className="flex gap-3">
        <button onClick={() => setModal("synthetic")} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">
          + Build an Influencer
        </button>
        <button onClick={() => setModal("twin")} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-line-strong">
          + Build Me (digital twin)
        </button>
      </div>

      {/* list */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {list.length === 0 && (
          <div className="col-span-full rounded-xl border border-line bg-surface-1 p-6 text-sm text-ink-dim">
            No influencers yet. Build one — it&apos;s reused across every video.
          </div>
        )}
        {list.map((inf) => (
          <div key={inf.id} className="flex items-center justify-between rounded-xl border border-line bg-surface-1 p-4 transition hover:border-line-strong">
            <Link href={`/setup/influencers/${inf.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{inf.name}</span>
                  <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-faint">
                    {inf.mode === "twin" ? "twin" : "synthetic"}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
                  <span>{inf.higgsfield_soul_id ? "Identity ✓" : "Identity —"}</span>
                  <span>{inf.voice_id ? "Voice ✓" : "Voice —"}</span>
                  <span className="text-active">{inf.status}</span>
                </div>
              </div>
              <span className="whitespace-nowrap text-xs font-semibold text-accent">Open →</span>
            </Link>
            <button onClick={() => remove(inf.id)} className="text-xs text-ink-faint hover:text-alert">Delete</button>
          </div>
        ))}
      </div>

      {/* Build an Influencer (synthetic) */}
      {modal === "synthetic" && (
        <Modal title="Build an Influencer" onClose={() => setModal(null)}>
          <p className="text-xs text-ink-dim">
            A synthetic, reusable identity. Identity training, voice, and reference frames
            are generated in the next step.
          </p>
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Ava" autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} placeholder="female / male" />
            <Field label="Age range" value={form.age_range} onChange={(v) => setForm({ ...form, age_range: v })} placeholder="25–34" />
            <Field label="Niche" value={form.niche} onChange={(v) => setForm({ ...form, niche: v })} placeholder="fintech, beauty…" />
            <Field label="Vibe" value={form.vibe} onChange={(v) => setForm({ ...form, vibe: v })} placeholder="warm, confident" />
            <Field label="Wardrobe" value={form.wardrobe} onChange={(v) => setForm({ ...form, wardrobe: v })} placeholder="smart casual" />
            <Field label="Setting" value={form.setting} onChange={(v) => setForm({ ...form, setting: v })} placeholder="modern office" />
          </div>
          <ModalActions onCancel={() => setModal(null)} onConfirm={createSynthetic} confirmLabel={busy ? "Creating…" : "Create"} disabled={!form.name.trim() || busy} />
        </Modal>
      )}

      {/* Build Me (twin) — name then consent gate */}
      {modal === "twin" && !consentFor && (
        <Modal title="Build Me — digital twin" onClose={() => setModal(null)}>
          <p className="text-xs text-ink-dim">
            Your own likeness, from photos + voice. We&apos;ll capture consent before any
            upload (POPIA / GDPR).
          </p>
          <Field label="Name" value={twinName} onChange={setTwinName} placeholder="e.g. Gary" autoFocus />
          <ModalActions
            onCancel={() => setModal(null)}
            onConfirm={() => setConsentFor({ name: twinName })}
            confirmLabel="Continue to consent →"
            disabled={!twinName.trim()}
          />
        </Modal>
      )}

      {modal === "twin" && consentFor && (
        <ConsentGate dataType="image" onCancel={() => setConsentFor(null)} onConfirm={createTwin} />
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface-1 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-ink-dim">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, disabled }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">Cancel</button>
      <button onClick={onConfirm} disabled={disabled} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {confirmLabel}
      </button>
    </div>
  );
}
