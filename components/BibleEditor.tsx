"use client";

import { useEffect, useRef, useState } from "react";

type Bible = Record<string, unknown>;

// Bare, document-style field: looks like text, glows an accent border on focus.
function Bare({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const cls = "w-full resize-none rounded border border-transparent bg-transparent px-2 py-1 text-sm text-ink outline-none transition hover:border-line focus:border-accent focus:bg-surface-2";
  if (multiline) {
    return <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={2} className={cls} />;
  }
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />;
}

function Field({ label, value, onChange, multiline }: { label: string; value: unknown; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="flex items-start gap-2 border-b border-line/50 py-1">
      <span className="mt-1.5 w-28 shrink-0 text-[11px] capitalize text-ink-dim">{label.replace(/_/g, " ")}</span>
      <div className="min-w-0 flex-1"><Bare value={String(value ?? "")} onChange={onChange} multiline={multiline} /></div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="tabular mb-1 text-[10px] uppercase tracking-[0.25em] text-ink-faint">{title}</div>
      {children}
    </div>
  );
}

export default function BibleEditor({ influencerId, initialBrief, initialBible }: { influencerId: string; initialBrief: string | null; initialBible: Bible | null }) {
  const [brief, setBrief] = useState(initialBrief || "");
  const [bible, setBible] = useState<Bible | null>(initialBible);
  const [open, setOpen] = useState(!initialBible);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: Bible) {
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch(`/api/influencers/${influencerId}/bible`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bible: next }) }).catch(() => {});
      setSaved("saved");
    }, 800);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Immutable nested update + autosave.
  function edit(mutate: (b: Bible) => void) {
    setBible((prev) => {
      const next = structuredClone(prev) as Bible;
      mutate(next);
      scheduleSave(next);
      return next;
    });
  }

  async function generate() {
    if (brief.trim().length < 10 || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/bible`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not write the bible"); setBusy(false); return; }
    setBible(d.bible); setOpen(false); setBusy(false); setSaved("saved");
  }

  const get = (path: string[]): Bible => path.reduce((o: Bible, k) => (o?.[k] ?? {}) as Bible, (bible ?? {}) as Bible);
  const arr = (path: string[], key: string): string[] => (get(path)[key] as string[]) || [];

  const wardrobe = get(["wardrobe"]) as { garments?: { item: string; fabric: string; detail: string }[] };
  const garments = wardrobe.garments || [];

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-accent">Character Bible</div>
        <div className="flex items-center gap-3">
          {bible && saved !== "idle" && <span className="text-[10px] text-ink-faint">{saved === "saving" ? "saving…" : "saved ✓"}</span>}
          {bible && <button onClick={() => setOpen((o) => !o)} className="text-xs text-ink-dim hover:text-ink">{open ? "Hide brief" : "Re-brief"}</button>}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink">
        Give us a line or two and our co-pilot designs a full film-grade character bible. Every field below is
        yours to fine-tune in place, it is the blueprint every casting shot and script is built from.
      </p>

      {(open || !bible) && (
        <div className="mt-3">
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder="e.g. 42, Indonesian-Dutch concert pianist, warm and intellectual, plays jazz in intimate clubs, calm confidence with flashes of humour."
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong" />
          <button onClick={generate} disabled={busy || brief.trim().length < 10} className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Designing the character…" : bible ? "Regenerate bible" : "Co-write with AI"}
          </button>
          {busy && <p className="mt-2 text-[11px] text-ink-faint">Our co-pilot is casting the character. This takes around half a minute.</p>}
          {err && <p className="mt-2 text-xs text-alert">{err}</p>}
        </div>
      )}

      {bible && !open && (
        <div className="mt-4 space-y-3">
          <Bare value={String(bible.signature_line ?? "")} onChange={(v) => edit((b) => { b.signature_line = v; })} placeholder="Signature line" />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Section title="Identity">
              {["profession", "age", "height", "build", "ethnicity_design"].map((k) => (
                <Field key={k} label={k} value={get(["identity"])[k]} onChange={(v) => edit((b) => { ((b.identity ??= {}) as Bible)[k] = v; })} />
              ))}
              <Field label="bio" value={get(["identity"]).bio} multiline onChange={(v) => edit((b) => { ((b.identity ??= {}) as Bible).bio = v; })} />
            </Section>

            <Section title="Face">
              {["structure", "skin", "eyes", "hair", "distinct_features"].map((k) => (
                <Field key={k} label={k} value={get(["face"])[k]} multiline onChange={(v) => edit((b) => { ((b.face ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>

            <Section title="Psychology">
              <Field label="core_traits" value={arr(["psychology"], "core_traits").join(", ")} onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).core_traits = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
              <Field label="internal_conflict" value={get(["psychology"]).internal_conflict} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).internal_conflict = v; })} />
              <Field label="behaviour_patterns" value={arr(["psychology"], "behaviour_patterns").join(" · ")} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).behaviour_patterns = v.split(/·|\n/).map((s) => s.trim()).filter(Boolean); })} />
              <Field label="emotional_baseline" value={get(["psychology"]).emotional_baseline} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).emotional_baseline = v; })} />
            </Section>

            <Section title="Performance">
              {["body_language", "movement_rhythm", "idle_behaviour"].map((k) => (
                <Field key={k} label={k} value={get(["performance"])[k]} multiline onChange={(v) => edit((b) => { ((b.performance ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>

            <Section title="Cinematic portrait">
              {["environment", "lighting", "colour_tone", "expression", "camera"].map((k) => (
                <Field key={k} label={k} value={get(["portrait"])[k]} onChange={(v) => edit((b) => { ((b.portrait ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>

            <Section title="Voice">
              <Bare value={String(bible.voice_descriptor ?? "")} multiline onChange={(v) => edit((b) => { b.voice_descriptor = v; })} />
            </Section>
          </div>

          <Section title="Wardrobe">
            <div className="space-y-1">
              {garments.map((g, i) => (
                <div key={i} className="grid grid-cols-3 gap-1">
                  <Bare value={g.item} placeholder="item" onChange={(v) => edit((b) => { (((b.wardrobe as Bible).garments as Record<string, string>[])[i]).item = v; })} />
                  <Bare value={g.fabric} placeholder="fabric" onChange={(v) => edit((b) => { (((b.wardrobe as Bible).garments as Record<string, string>[])[i]).fabric = v; })} />
                  <Bare value={g.detail} placeholder="detail" onChange={(v) => edit((b) => { (((b.wardrobe as Bible).garments as Record<string, string>[])[i]).detail = v; })} />
                </div>
              ))}
            </div>
            <Field label="footwear" value={get(["wardrobe"]).footwear} onChange={(v) => edit((b) => { ((b.wardrobe ??= {}) as Bible).footwear = v; })} />
            <Field label="accessories" value={arr(["wardrobe"], "accessories").join(", ")} onChange={(v) => edit((b) => { ((b.wardrobe ??= {}) as Bible).accessories = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
            <Field label="props" value={arr(["wardrobe"], "props").join(", ")} onChange={(v) => edit((b) => { ((b.wardrobe ??= {}) as Bible).props = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
          </Section>

          <Section title="Colour palette">
            {["skin_tones", "hair_eyes", "wardrobe_colours"].map((k) => (
              <Field key={k} label={k} value={arr(["palette"], k).join(", ")} onChange={(v) => edit((b) => { ((b.palette ??= {}) as Bible)[k] = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
