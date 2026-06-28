"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flex, pick, BIBLE_LINES } from "@/lib/flex";

type Bible = Record<string, unknown>;

// Auto-growing editable text that reads like a document but is obviously editable
// (subtle dashed underline at rest, accent glow + raised surface on focus).
function Bare({ value, onChange, multiline, placeholder }: { value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  // Always a textarea so every descriptor wraps and shows in full (never clipped).
  const cls = "block w-full resize-none whitespace-pre-wrap break-words rounded-md border border-dashed border-line/70 bg-transparent px-2.5 py-1.5 text-sm leading-relaxed text-ink outline-none transition hover:border-line-strong hover:bg-surface-1 focus:border-[#a855f7] focus:bg-surface-1 focus:shadow-[0_0_0_3px_rgba(168,85,247,0.14)]";
  const rows = Math.max(multiline ? 2 : 1, Math.ceil((value?.length || 0) / 52));
  return <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={rows} className={cls} />;
}

// One labelled field - label sits ABOVE the value so long text gets the full width.
function Field({ label, value, onChange, multiline }: { label: string; value: unknown; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div className="py-1.5">
      <div className="tabular mb-0.5 px-1 text-[10px] uppercase tracking-[0.18em] text-ink-faint">{label.replace(/_/g, " ")}</div>
      <Bare value={String(value ?? "")} onChange={onChange} multiline={multiline} />
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between border-b border-line/60 pb-2">
        <div className="tabular text-xs font-semibold uppercase tracking-[0.2em] text-[#c79bff]">{title}</div>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// Per-section "reimagine with AI" button.
function Regen({ section, busy, onClick }: { section: string; busy: string | null; onClick: (s: string) => void }) {
  const active = busy === section;
  return (
    <button onClick={() => onClick(section)} disabled={!!busy} title="Reimagine this section with AI"
      className="flex items-center gap-1 rounded-md border border-[#a855f7]/30 px-2 py-0.5 text-[10px] font-semibold text-[#c79bff] transition hover:border-[#a855f7]/60 hover:bg-[#a855f7]/10 disabled:opacity-50">
      <span className={active ? "inline-block animate-spin" : ""}>↻</span> {active ? "Reimagining…" : "Reimagine"}
    </button>
  );
}

export default function BibleEditor({ influencerId, initialBrief, initialBible, flushRef }: { influencerId: string; initialBrief: string | null; initialBible: Bible | null; flushRef?: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const [brief, setBrief] = useState(initialBrief || "");
  const [bible, setBible] = useState<Bible | null>(initialBible);
  const [open, setOpen] = useState(!initialBible);
  const [busy, setBusy] = useState(false);
  const [perfecting, setPerfecting] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [regen, setRegen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Bible | null>(null); // latest edit not yet written

  // Write the pending edit now (used by the debounce, on blur, and before casting).
  const doSave = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaved("saving");
    try {
      await fetch(`/api/influencers/${influencerId}/bible`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bible: next }) });
      setSaved("saved");
    } catch {
      pending.current = next; // keep it so a later flush retries
      setSaved("idle");
    }
  }, [influencerId]);

  // Expose a flush so the casting step can guarantee edits are saved before it runs.
  useEffect(() => { if (flushRef) flushRef.current = doSave; }, [flushRef, doSave]);

  async function reimagine(section: string) {
    if (regen) return;
    setRegen(section);
    const r = await fetch(`/api/influencers/${influencerId}/bible/section`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section }),
    });
    const d = await r.json().catch(() => ({}));
    setRegen(null);
    if (r.ok && "value" in d) {
      // The server already saved; mirror it locally so the edit shows immediately.
      setBible((prev) => ({ ...(prev as Bible), [section]: d.value }));
      setSaved("saved");
    } else {
      setErr(d?.error || "Could not reimagine that section");
    }
  }

  function scheduleSave(next: Bible) {
    pending.current = next;
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { doSave(); }, 600);
  }
  // Flush any pending edit if the component unmounts (e.g. navigating away).
  useEffect(() => () => { if (pending.current) doSave(); }, [doSave]);

  // Immutable nested update + autosave.
  function edit(mutate: (b: Bible) => void) {
    setBible((prev) => {
      const next = structuredClone(prev) as Bible;
      mutate(next);
      scheduleSave(next);
      return next;
    });
  }

  // "Perfect with AI" - polish the rough brief into a richer, castable one (the user can still edit it).
  async function perfect() {
    if (perfecting || busy || brief.trim().length < 4) return;
    setPerfecting(true); setErr("");
    try {
      const r = await fetch(`/api/influencers/${influencerId}/bible/perfect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.brief) setBrief(d.brief);
      else setErr(d?.error || "Couldn't perfect that - try again.");
    } finally { setPerfecting(false); }
  }

  async function generate() {
    if (brief.trim().length < 10 || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/bible`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not design the character"); setBusy(false); return; }
    setBible(d.bible); setOpen(false); setBusy(false); setSaved("saved"); flex(pick(BIBLE_LINES));
  }

  const get = (path: string[]): Bible => path.reduce((o: Bible, k) => (o?.[k] ?? {}) as Bible, (bible ?? {}) as Bible);
  const arr = (path: string[], key: string): string[] => (get(path)[key] as string[]) || [];

  const wardrobe = get(["wardrobe"]) as { garments?: { item: string; fabric: string; detail: string }[] };
  const garments = wardrobe.garments || [];

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-xs uppercase tracking-[0.2em] brand-grad font-semibold">Character Casting</div>
        <div className="flex items-center gap-3">
          {bible && saved !== "idle" && <span className="text-[10px] text-ink-faint">{saved === "saving" ? "saving…" : "saved ✓"}</span>}
          {bible && <button onClick={() => setOpen((o) => !o)} className="text-xs text-ink-dim hover:text-ink">{open ? "Hide brief" : "↻ Re-brief"}</button>}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-dim">
        {bible
          ? <>Your character is <b className="text-ink">cast</b>. Everything below is yours - click any line to edit it (it saves as you type), hit <span className="text-[#c79bff]">↻ Reimagine</span> on a section to re-roll just that part, or <span className="text-[#c79bff]">↻ Re-brief</span> up top to start a whole new character.</>
          : <>This is where your influencer is born. Tell us a line or two about who they are, and our co-pilot casts a full film-grade character: their face, their story, the way they move, even their wardrobe. Think of it as the audition before the photoshoot. The richer the brief, the more alive they feel.</>}
      </p>

      {(open || !bible) && (
        <div className="mt-3">
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder="e.g. 42, Indonesian-Dutch concert pianist, warm and intellectual, plays jazz in intimate clubs, calm confidence with flashes of humour."
            className="glow-accent w-full rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink outline-none" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={generate} disabled={busy || perfecting || brief.trim().length < 10} className="btn-brand inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
              {busy && <span className="spinner-ring" />}{busy ? "Casting the character…" : bible ? "✨ Re-cast the character" : "✨ Bring them to life"}
            </button>
            <button onClick={perfect} disabled={perfecting || busy || brief.trim().length < 4} title="Let the co-pilot enrich your idea into a fuller casting brief"
              className="inline-flex items-center gap-2 rounded-lg border border-[#a855f7]/40 px-4 py-2 text-sm font-semibold text-[#c79bff] transition hover:bg-[#a855f7]/10 disabled:opacity-50">
              {perfecting ? <><span className="spinner-ring" />Perfecting…</> : "✨ Perfect with AI"}
            </button>
          </div>
          {brief.trim().length > 0 && brief.trim().length < 10 && <p className="mt-2 text-[11px] text-ink-faint">Give us a touch more to work with, a sentence or two.</p>}
          {busy && <p className="mt-2 text-[11px] text-ink-faint">Our co-pilot is in the casting room dreaming them up. About half a minute, worth the wait.</p>}
          {err && <p className="mt-2 text-xs text-alert">{err}</p>}
        </div>
      )}

      {bible && !open && (
        <div className="mt-4 space-y-3" onBlur={() => { if (pending.current) doSave(); }}>
          <div className="rounded-lg border border-[#a855f7]/25 bg-[#a855f7]/8 px-3 py-2 text-[13px] leading-relaxed text-ink-dim">
            ✎ Everything below is yours to tweak. Click any line to rewrite it, it saves automatically as you type.
            Not feeling one part? Hit <span className="text-[#c79bff]">↻ Reimagine</span> on that section and the AI re-rolls
            just that bit, in keeping with the rest. Want a whole new character? <span className="text-[#c79bff]">↻ Re-brief</span> up top.
          </div>
          <div>
            <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Signature line · a short quote in their own voice (anchors their tone)</div>
            <Bare value={String(bible.signature_line ?? "")} onChange={(v) => edit((b) => { b.signature_line = v; })} placeholder={"e.g. “A room should feel like it’s always been here.”"} />
          </div>

          <div className="space-y-3">
            <Section title="Identity" action={<Regen section="identity" busy={regen} onClick={reimagine} />}>
              {["profession", "age", "height", "build", "ethnicity_design"].map((k) => (
                <Field key={k} label={k} value={get(["identity"])[k]} onChange={(v) => edit((b) => { ((b.identity ??= {}) as Bible)[k] = v; })} />
              ))}
              <Field label="bio" value={get(["identity"]).bio} multiline onChange={(v) => edit((b) => { ((b.identity ??= {}) as Bible).bio = v; })} />
            </Section>

            <Section title="Face" action={<Regen section="face" busy={regen} onClick={reimagine} />}>
              {["structure", "skin", "eyes", "hair", "distinct_features"].map((k) => (
                <Field key={k} label={k} value={get(["face"])[k]} multiline onChange={(v) => edit((b) => { ((b.face ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>

            <Section title="Psychology" action={<Regen section="psychology" busy={regen} onClick={reimagine} />}>
              <Field label="core_traits" value={arr(["psychology"], "core_traits").join(", ")} onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).core_traits = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
              <Field label="internal_conflict" value={get(["psychology"]).internal_conflict} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).internal_conflict = v; })} />
              <Field label="behaviour_patterns" value={arr(["psychology"], "behaviour_patterns").join(" · ")} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).behaviour_patterns = v.split(/·|\n/).map((s) => s.trim()).filter(Boolean); })} />
              <Field label="emotional_baseline" value={get(["psychology"]).emotional_baseline} multiline onChange={(v) => edit((b) => { ((b.psychology ??= {}) as Bible).emotional_baseline = v; })} />
            </Section>

            <Section title="Performance" action={<Regen section="performance" busy={regen} onClick={reimagine} />}>
              {["body_language", "movement_rhythm", "idle_behaviour"].map((k) => (
                <Field key={k} label={k} value={get(["performance"])[k]} multiline onChange={(v) => edit((b) => { ((b.performance ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>

            <Section title="Cinematic portrait" action={<Regen section="portrait" busy={regen} onClick={reimagine} />}>
              {["environment", "lighting", "colour_tone", "expression", "camera"].map((k) => (
                <Field key={k} label={k} value={get(["portrait"])[k]} onChange={(v) => edit((b) => { ((b.portrait ??= {}) as Bible)[k] = v; })} />
              ))}
            </Section>
            {/* Voice descriptor is generated and kept in the bible, but it belongs to the
                Voice section (designed later), so it is not shown or edited here. */}
          </div>

          <Section title="Wardrobe" action={<Regen section="wardrobe" busy={regen} onClick={reimagine} />}>
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

          <Section title="Colour palette" action={<Regen section="palette" busy={regen} onClick={reimagine} />}>
            {["skin_tones", "hair_eyes", "wardrobe_colours"].map((k) => (
              <Field key={k} label={k} value={arr(["palette"], k).join(", ")} onChange={(v) => edit((b) => { ((b.palette ??= {}) as Bible)[k] = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
