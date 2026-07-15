"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE FUNNEL BUILDER - the real per-section wizard (Gary's locked architecture).
//
// Brief -> (optional) sharpen -> three sections, each the same shape: a CAROUSEL of that section's own
// reference designs, pick one, say who/what you want in it, generate, then accept / rerun. Masthead + section-1
// swap the person on the chosen design (on the funnel background); sliders swap person + scene. Nothing is
// generated from scratch - every creative is one of the client's proven designs with a new person.

type Deal = { id: string; label: string; amount: string; amountSuffix?: string; price: string; validity: string };
type Ref = { id: string; kind: string; name: string | null; url: string };
type Client = { id: string; name: string };
type Shot = { url: string; status: "new" | "accepted" };

const SECTIONS = [
  { key: "masthead", title: "Masthead", match: /hero/i, count: 1, hint: "The banner at the top of the funnel. One design." },
  { key: "section1", title: "Section 1", match: /supporting/i, count: 1, hint: "The supporting hero. Must feel different from the masthead." },
  { key: "slider", title: "Section 2 · Sliders", match: /slider|slide/i, count: 3, hint: "Three sliders. Each carries its own campaign headline." },
] as const;

const dealText = (d: Deal) => `${d.label} · ${d.amount}${d.amountSuffix || ""} · ${d.price} · ${d.validity}`;

export default function BuilderPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [brief, setBrief] = useState("");

  // per creative slot: which reference is picked, the subject prompt, the chosen deal, the generated shots
  const [picked, setPicked] = useState<Record<string, string>>({});   // slotKey -> reference url
  const [subject, setSubject] = useState<Record<string, string>>({}); // slotKey -> what to see
  const [shot, setShot] = useState<Record<string, Shot>>({});         // slotKey -> generated
  const [busy, setBusy] = useState<Record<string, boolean>>({});      // slotKey -> generating
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/studio").then((r) => r.json()).then((d) => {
      const cs: Client[] = d.clients || [];
      setClients(cs);
      if (cs[0]) setClientId(cs[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/studio?clientId=${clientId}`).then((r) => r.json()).then((d) => {
      setRefs((d.assets || []).filter((a: Ref) => a.kind === "reference"));
    }).catch(() => {});
    fetch(`/api/studio/deals?clientId=${clientId}`).then((r) => r.json()).then((d) => setDeals(d.deals || [])).catch(() => {});
  }, [clientId]);

  async function sharpen() {
    setErr(""); setBusy((b) => ({ ...b, brief: true }));
    try {
      const d = await fetch("/api/studio/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sharpen", clientId, brief }),
      }).then((r) => r.json());
      if (d.sharpened?.brief) setBrief(d.sharpened.brief);
      else if (d.error) setErr(d.error);
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, brief: false })); }
  }

  async function generate(slotKey: string, kind: string) {
    const referenceUrl = picked[slotKey];
    const subj = (subject[slotKey] || "").trim();
    if (!referenceUrl) { setErr("Pick a design for this section first."); return; }
    if (!subj) { setErr("Say who should be in it."); return; }
    setErr(""); setBusy((b) => ({ ...b, [slotKey]: true }));
    try {
      const d = await fetch("/api/studio/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, kind, referenceUrl, subject: subj }),
      }).then((r) => r.json());
      if (d.url) setShot((s) => ({ ...s, [slotKey]: { url: d.url, status: "new" } }));
      else setErr(d.error || "generation failed");
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, [slotKey]: false })); }
  }

  const refsFor = (m: RegExp) => refs.filter((r) => m.test(r.name || ""));
  const accepted = Object.values(shot).filter((s) => s.status === "accepted").length;
  const totalSlots = SECTIONS.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/studio" className="text-xs font-semibold text-ink-dim transition hover:text-ink">← GAS Studio</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Funnel builder</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">
          Build the funnel one section at a time. For each, pick one of your own proven designs, say who should
          be in it, and generate. Nothing is invented - every creative is your design with a new person.
        </p>

        {/* BRIEF */}
        <section className="mt-6 rounded-2xl border border-line bg-surface-1 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px]">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="text-sm text-ink-dim tabular">{refs.length} designs · {deals.length} deals on file</span>
          </div>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
            placeholder="What is the campaign? e.g. Mother's Day - celebrate mums, send money and airtime to your mother through MoMo, zero fees."
            className="mt-3 w-full rounded-xl border border-line bg-surface-2 p-4 text-base leading-relaxed outline-none focus:border-accent" />
          <button onClick={sharpen} disabled={!!busy.brief || brief.trim().length < 6}
            className="mt-3 rounded-lg border border-[#818cf8]/60 bg-[#818cf8]/10 px-4 py-2 text-sm font-bold text-ink hover:bg-[#818cf8]/20 disabled:opacity-40">
            {busy.brief ? "The Producer is reading…" : "Sharpen the brief"}
          </button>
        </section>

        {err && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-semibold text-red-300">{err}</p>}

        {/* SECTIONS */}
        {SECTIONS.map((sec) => {
          const options = refsFor(sec.match);
          return (
            <section key={sec.key} className="mt-8">
              <h2 className="text-xl font-bold">{sec.title}</h2>
              <p className="mt-0.5 text-sm text-ink-dim">{sec.hint}</p>

              {Array.from({ length: sec.count }).map((_, slot) => {
                const slotKey = sec.count > 1 ? `${sec.key}-${slot}` : sec.key;
                const chosen = picked[slotKey];
                const s = shot[slotKey];
                return (
                  <div key={slotKey} className="mt-4 rounded-2xl border border-line bg-surface-1 p-5">
                    {sec.count > 1 && <p className="mb-2 text-sm font-bold text-ink-dim">Slider {slot + 1}</p>}

                    {/* carousel of this section's references */}
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {options.length === 0 && <p className="text-sm text-ink-faint">No {sec.title.toLowerCase()} designs uploaded at intake.</p>}
                      {options.map((r) => (
                        <button key={r.id} onClick={() => setPicked((p) => ({ ...p, [slotKey]: r.url }))}
                          className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${chosen === r.url ? "border-accent" : "border-line hover:border-ink-dim"}`}>
                          <img src={r.url} alt={r.name || ""} className="h-28 w-auto bg-surface-2 object-contain" />
                        </button>
                      ))}
                    </div>

                    <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-ink-faint">Who should be in it? (bring the theme in)</label>
                    <input value={subject[slotKey] || ""} onChange={(e) => setSubject((x) => ({ ...x, [slotKey]: e.target.value }))}
                      placeholder="e.g. a mother and her adult daughter smiling together"
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[15px] outline-none focus:border-accent" />

                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => generate(slotKey, sec.key)} disabled={!!busy[slotKey] || !chosen}
                        className="rounded-lg bg-accent px-5 py-2 text-sm font-bold text-black disabled:opacity-40">
                        {busy[slotKey] ? "Generating… (a few min)" : s ? "Rerun" : "Generate"}
                      </button>
                      {s && s.status !== "accepted" && (
                        <button onClick={() => setShot((x) => ({ ...x, [slotKey]: { ...s, status: "accepted" } }))}
                          className="rounded-lg border border-[#4ade80]/50 bg-[#4ade80]/10 px-4 py-2 text-sm font-bold text-[#86efac]">Accept</button>
                      )}
                      {s && <button onClick={() => setShot((x) => { const c = { ...x }; delete c[slotKey]; return c; })}
                        className="text-sm font-semibold text-ink-dim underline hover:text-ink">Reject</button>}
                    </div>

                    {s && (
                      <div className="mt-3">
                        <img src={s.url} alt="" className={`w-full max-w-md rounded-lg border-2 ${s.status === "accepted" ? "border-[#4ade80]" : "border-line"}`}
                          style={sec.key === "section1" ? { background: "#fff" } : undefined} />
                        {s.status === "accepted" && <p className="mt-1 text-xs font-bold text-[#86efac]">✓ Accepted</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        <div className="mt-8 rounded-2xl border border-line bg-surface-1 p-5">
          <p className="text-sm text-ink-dim">
            <b className="text-ink tabular">{accepted}/{totalSlots}</b> creatives accepted.
            {accepted === totalSlots ? " All five approved - the funnel set is ready." : " Accept each creative when you are happy with it."}
          </p>
          {deals.length > 0 && (
            <p className="mt-2 text-xs text-ink-faint">Deal library available for the offer step: {deals.slice(0, 4).map(dealText).join("  ·  ")}{deals.length > 4 ? " …" : ""}</p>
          )}
        </div>
      </main>
    </div>
  );
}
