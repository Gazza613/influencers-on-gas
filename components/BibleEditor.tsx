"use client";

import { useState } from "react";

type Bible = Record<string, unknown>;

function Row({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  const text = Array.isArray(value) ? value.join(" · ") : String(value);
  if (!text.trim()) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-1.5 text-sm">
      <dt className="shrink-0 capitalize text-ink-dim">{label.replace(/_/g, " ")}</dt>
      <dd className="text-right text-ink">{text}</dd>
    </div>
  );
}

function Section({ title, obj }: { title: string; obj: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="tabular mb-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">{title}</div>
      <dl>{Object.entries(obj).map(([k, v]) => <Row key={k} label={k} value={v} />)}</dl>
    </div>
  );
}

export default function BibleEditor({
  influencerId,
  initialBrief,
  initialBible,
}: {
  influencerId: string;
  initialBrief: string | null;
  initialBible: Bible | null;
}) {
  const [brief, setBrief] = useState(initialBrief || "");
  const [bible, setBible] = useState<Bible | null>(initialBible);
  const [open, setOpen] = useState(!initialBible);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function generate() {
    if (brief.trim().length < 10 || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/bible`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not write the bible"); setBusy(false); return; }
    setBible(d.bible); setOpen(false); setBusy(false);
  }

  const wardrobe = (bible?.wardrobe ?? {}) as { garments?: { item: string; fabric: string; detail: string }[]; footwear?: string; accessories?: string[]; props?: string[] };
  const palette = (bible?.palette ?? {}) as Record<string, string[]>;

  return (
    <div className="rounded-xl border border-line bg-surface-1 p-5">
      <div className="flex items-center justify-between">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] text-accent">Character Bible</div>
        {bible && <button onClick={() => setOpen((o) => !o)} className="text-xs text-ink-dim hover:text-ink">{open ? "Hide brief" : "Re-brief"}</button>}
      </div>
      <p className="mt-2 text-sm text-ink">
        Give us a line or two and our co-pilot designs a full film-grade character bible: face, psychology,
        performance, wardrobe and palette. It is the blueprint every casting shot and script is built from.
      </p>

      {(open || !bible) && (
        <div className="mt-3">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            placeholder="e.g. 42, Indonesian-Dutch concert pianist, warm and intellectual, plays jazz in intimate clubs, calm confidence with flashes of humour."
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-line-strong"
          />
          <button onClick={generate} disabled={busy || brief.trim().length < 10} className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Designing the character…" : bible ? "Regenerate bible" : "Co-write with AI"}
          </button>
          {busy && <p className="mt-2 text-[11px] text-ink-faint">Our co-pilot is casting the character. This takes around half a minute.</p>}
          {err && <p className="mt-2 text-xs text-alert">{err}</p>}
        </div>
      )}

      {bible && !open && (
        <div className="mt-4 space-y-3">
          {bible.signature_line ? <p className="text-sm italic text-ink">&ldquo;{String(bible.signature_line)}&rdquo;</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bible.identity ? <Section title="Identity" obj={bible.identity as Record<string, unknown>} /> : null}
            {bible.face ? <Section title="Face" obj={bible.face as Record<string, unknown>} /> : null}
            {bible.psychology ? <Section title="Psychology" obj={bible.psychology as Record<string, unknown>} /> : null}
            {bible.performance ? <Section title="Performance" obj={bible.performance as Record<string, unknown>} /> : null}
            {bible.portrait ? <Section title="Cinematic portrait" obj={bible.portrait as Record<string, unknown>} /> : null}
          </div>

          {wardrobe.garments && wardrobe.garments.length > 0 && (
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="tabular mb-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Wardrobe</div>
              <ul className="space-y-1 text-sm text-ink">
                {wardrobe.garments.map((g, i) => <li key={i}><span className="text-ink">{g.item}</span> <span className="text-ink-faint">· {g.fabric}{g.detail ? ` · ${g.detail}` : ""}</span></li>)}
              </ul>
              <div className="mt-2 text-[12px] text-ink-dim">
                {wardrobe.footwear ? <span>Footwear: {wardrobe.footwear}. </span> : null}
                {wardrobe.accessories?.length ? <span>Accessories: {wardrobe.accessories.join(", ")}. </span> : null}
                {wardrobe.props?.length ? <span>Props: {wardrobe.props.join(", ")}.</span> : null}
              </div>
            </div>
          )}

          {Object.keys(palette).length > 0 && (
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <div className="tabular mb-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">Colour palette</div>
              {Object.entries(palette).map(([k, vals]) => (
                <div key={k} className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] capitalize text-ink-dim">{k.replace(/_/g, " ")}</span>
                  {(vals || []).map((v, i) => <span key={i} className="rounded bg-surface-1 px-2 py-0.5 text-[11px] text-ink">{v}</span>)}
                </div>
              ))}
            </div>
          )}

          {bible.voice_descriptor ? <p className="text-[12px] text-ink-dim"><span className="text-ink-faint">Voice:</span> {String(bible.voice_descriptor)}</p> : null}
        </div>
      )}
    </div>
  );
}
