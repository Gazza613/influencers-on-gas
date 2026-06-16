"use client";

import { useEffect, useRef, useState } from "react";

type Bible = Record<string, unknown>;

// Auto-growing editable text that reads like a document but is obviously editable
// (subtle dashed underline at rest, accent glow + raised surface on focus).
function Bare({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const cls = "w-full resize-none rounded-md border border-dashed border-line/70 bg-transparent px-2.5 py-1.5 text-sm leading-relaxed text-ink outline-none transition hover:border-line-strong hover:bg-surface-1 focus:border-[#a855f7] focus:bg-surface-1 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.14)]";
  if (multiline) {
    return <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={Math.max(2, Math.ceil((value?.length || 0) / 60))} className={cls} />;
  }
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />;
}

// One labelled field — label sits ABOVE the value so long text gets the full width.
function Field({ label, value, onChange, multiline }: { label: string; value: unknown; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="py-1.5">
      <div className="tabular mb-0.5 px-1 text-[10px] uppercase tracking-[0.18em] text-ink-faint">{label.replace(/_/g, " ")}</div>
      <Bare value={String(value ?? "")} onChange={onChange} multiline={multiline} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="tabular mb-2 border-b border-line/60 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c79bff]">{title}</div>
      <div className="space-y-1">{children}</div>
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
    if (!r.ok) { setErr(d?.error || "Could not design the character"); setBusy(false); return; }
    setBible(d.bible); setOpen(false); setBusy(false); setSaved("saved");
  }

  const get = (path: string[]): Bible => path.reduce((o: Bible, k) => (o?.[k] ?? {}) as Bible, (bible ?? {}) as Bible);
  const arr = (path: string[], key: string): string[] => (get(path)[key] as string[]) || [];

  const wardrobe = get(["wardrobe"]) as { garments?: { item: string; fabric: string; detail: string }[] };
  const garments = wardrobe.garments || [];

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Character Casting</div>
        <div className="flex items-center gap-3">
          {bible && saved !== "idle" && <span className="text-[10px] text-ink-faint">{saved === "saving" ? "saving…" : "saved ✓"}</span>}
          {bible && <button onClick={() => setOpen((o) => !o)} className="text-xs text-ink-dim hover:text-ink">{open ? "Hide brief" : "↻ Re-brief"}</button>}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        This is where your influencer is born. Tell us a line or two about who they are, and our co-pilot
        casts a full film-grade character: their face, their story, the way they move, even their wardrobe.
        Think of it as the audition before the photoshoot. The richer the brief, the more alive they feel.
      </p>

      {(open || !bible) && (
        <div className="mt-3">
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder="e.g. 42, Indonesian-Dutch concert pianist, warm and intellectual, plays jazz in intimate clubs, calm confidence with flashes of humour."
            className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
          <button onClick={generate} disabled={busy || brief.trim().length < 10} className="btn-brand mt-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
            {busy ? "Casting the character…" : bible ? "✨ Re-cast the character" : "✨ Bring them to life"}
          </button>
          {brief.trim().length > 0 && brief.trim().length < 10 && <p className="mt-2 text-[11px] text-ink-faint">Give us a touch more to work with, a sentence or two.</p>}
          {busy && <p className="mt-2 text-[11px] text-ink-faint">Our co-pilot is in the casting room dreaming them up. About half a minute, worth the wait.</p>}
          {err && <p className="mt-2 text-xs text-alert">{err}</p>}
        </div>
      )}

      {bible && !open && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-[#a855f7]/25 bg-[#a855f7]/8 px-3 py-2 text-[11px] text-ink-dim">
            ✎ Everything below is yours to tweak. Click any line to rewrite it, it saves automatically as you type.
            Want a totally different take? Hit <span className="text-[#c79bff]">↻ Re-brief</span> up top.
          </div>
          <Bare value={String(bible.signature_line ?? "")} onChange={(v) => edit((b) => { b.signature_line = v; })} placeholder="Signature line" />

          <div className="space-y-3">
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
