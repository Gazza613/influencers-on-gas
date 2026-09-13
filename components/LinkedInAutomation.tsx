"use client";

import { useCallback, useEffect, useState } from "react";

// THE LINKEDIN ARTICLE AUTOMATION (Gary, admin-only). Topic-DRIVEN: on a cadence, the pod drafts the exec's
// LinkedIn piece from a TOPIC QUEUE the team controls and emails the team a DRAFT to review (never auto-sends).
// The team fills the queue with their OWN topics, or with topics SUGGESTED from what the market is currently
// discussing (the brain's recent findings) - the choice Gary asked for.
const LINKEDIN_BLUE = "#0A66C2";
type Cadence = "off" | "weekly" | "monthly";

export default function LinkedInAutomation({ clientId }: { clientId: string }) {
  const [briefed, setBriefed] = useState(true);
  const [schedule, setSchedule] = useState<Cadence>("off");
  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [publisher, setPublisher] = useState<"ceo" | "md">("ceo");
  const [reviewRecips, setReviewRecips] = useState("");
  const [ceoName, setCeoName] = useState("");
  const [mdName, setMdName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/studio/intel/linkedin-schedule?clientId=${encodeURIComponent(clientId)}`).then((r) => r.json()).catch(() => null);
    if (!d) return;
    setBriefed(d.briefed !== false);
    setSchedule((["off", "weekly", "monthly"].includes(d.schedule) ? d.schedule : "off") as Cadence);
    setTopics(Array.isArray(d.topics) ? d.topics : []);
    setReviewRecips(Array.isArray(d.reviewRecipients) ? d.reviewRecipients.join(", ") : "");
    setPublisher(d.publisher === "md" ? "md" : "ceo");
    setCeoName(d.ceoName || ""); setMdName(d.mdName || "");
    setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : []);
    setSaved(false); setErr("");
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  function addTopic(t: string) {
    const v = t.trim().slice(0, 300);
    if (!v) return;
    setTopics((p) => p.some((x) => x.toLowerCase() === v.toLowerCase()) ? p : [...p, v]);
    setNewTopic(""); setSaved(false);
  }
  function removeTopic(t: string) { setTopics((p) => p.filter((x) => x !== t)); setSaved(false); }

  async function save() {
    setSaving(true); setErr("");
    const d = await fetch("/api/studio/intel/linkedin-schedule", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, schedule, topics, publisher, reviewRecipients: reviewRecips.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) }),
    }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (!d?.ok) { setErr(d?.error || "Couldn't save."); return; }
    setSaved(true);
  }

  if (!briefed) {
    return <p className="text-[13px] text-ink-faint">This brain has no brief yet, so there is nothing to schedule.</p>;
  }

  const CADENCES: { key: Cadence; label: string; sub: string }[] = [
    { key: "off", label: "Off", sub: "No automated drafts" },
    { key: "weekly", label: "Weekly", sub: "Mon 08:30" },
    { key: "monthly", label: "Monthly", sub: "First Mon 08:30" },
  ];
  const unused = suggestions.filter((s) => !topics.some((t) => t.toLowerCase() === s.toLowerCase())).slice(0, 6);

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: LINKEDIN_BLUE + "55", background: LINKEDIN_BLUE + "0a" }}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: LINKEDIN_BLUE }}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" /></svg>
        </span>
        <div>
          <h4 className="text-[16px] font-bold" style={{ color: LINKEDIN_BLUE }}>LinkedIn Article Automation</h4>
          <p className="text-[12.5px] leading-relaxed text-ink-dim sm:max-w-[80%]">On the cadence, the pod drafts your {publisher === "md" ? "MD" : "CEO"}&rsquo;s piece from the next topic in the queue and emails the <b className="text-ink">team a draft to review</b>, never the exec directly. Fill the queue with your own topics, or add one the market is talking about.</p>
        </div>
      </div>

      {/* Cadence */}
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        {CADENCES.map((c) => (
          <button key={c.key} onClick={() => { setSchedule(c.key); setSaved(false); }}
            className={`rounded-lg border px-3 py-2 text-left transition ${schedule === c.key ? "border-[#0A66C2] bg-[#0A66C2]/15" : "border-line bg-surface-2/50 hover:border-line-strong"}`}>
            <div className={`text-[14px] font-bold ${schedule === c.key ? "text-[#4a9eff]" : "text-ink"}`}>{c.label}</div>
            <div className="text-[11px] text-ink-faint">{c.sub}</div>
          </button>
        ))}
      </div>

      {/* Publisher toggle (only when the brain has both) */}
      {ceoName && mdName && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-sm">
          {(["ceo", "md"] as const).map((p) => (
            <button key={p} onClick={() => { setPublisher(p); setSaved(false); }}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${publisher === p ? "bg-[#0A66C2]/20 text-[#4a9eff]" : "text-ink-dim hover:text-ink"}`}>
              {p === "ceo" ? `CEO · ${ceoName}` : `MD · ${mdName}`}
            </button>
          ))}
        </div>
      )}

      {/* The topic queue */}
      <div className="mt-3.5">
        <span className="tabular block text-[11px] uppercase tracking-[0.16em] text-ink-faint">Topic queue{topics.length ? ` (${topics.length})` : ""}</span>
        {topics.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {topics.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[13px] text-ink">
                {t}
                <button onClick={() => removeTopic(t)} className="text-ink-faint hover:text-alert" aria-label="Remove">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(newTopic); } }}
            placeholder="Type a topic and press Enter"
            className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-ink outline-none focus:border-[#0A66C2]" />
          <button onClick={() => addTopic(newTopic)} disabled={!newTopic.trim()}
            className="rounded-lg border border-[#0A66C2]/50 px-3 py-2 text-[13.5px] font-semibold text-[#4a9eff] hover:bg-[#0A66C2]/10 disabled:opacity-40">Add</button>
        </div>
      </div>

      {/* Market suggestions */}
      {unused.length > 0 && (
        <div className="mt-3">
          <span className="tabular block text-[11px] uppercase tracking-[0.16em] text-ink-faint">From the market · tap to add</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {unused.map((s, i) => (
              <button key={i} onClick={() => addTopic(s)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#0A66C2]/45 bg-[#0A66C2]/[0.06] px-2.5 py-1 text-[13px] text-ink-dim hover:text-ink">
                <span className="text-[#4a9eff]">＋</span> {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* WHO REVIEWS the drafts (Gary): specify the reviewers; empty falls back to the intelligence-digest team. */}
      <label className="mt-3.5 block">
        <span className="tabular block text-[11px] uppercase tracking-[0.16em] text-ink-faint">Send review drafts to (comma-separated)</span>
        <input value={reviewRecips} onChange={(e) => { setReviewRecips(e.target.value); setSaved(false); }}
          placeholder="you@gasmarketing.co.za, reviewer@gasmarketing.co.za"
          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13.5px] text-ink outline-none focus:border-[#0A66C2]" />
        <span className="mt-1 block text-[11px] text-ink-faint">Never the exec. Leave empty to use the intelligence-email team.</span>
      </label>

      {err && <p className="mt-3 text-[13px] text-alert">{err}</p>}
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-[13.5px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: LINKEDIN_BLUE }}>
          {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          {saving ? "Saving…" : "Save automation"}
        </button>
        {saved && <span className="text-[13px] font-semibold text-[#86efac]">✓ Saved</span>}
        {schedule !== "off" && !topics.length && <span className="text-[12px] text-[#fcd34d]">Add at least one topic to switch it on.</span>}
      </div>
    </div>
  );
}
