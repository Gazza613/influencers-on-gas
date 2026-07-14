"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";

// THE FUNNEL CAMPAIGN ORDER. A brief in plain English, a whole funnel out:
//   1 masthead + 1 section 1 + 3 sliders + the Webflow copy + the SMS.
//
// THE PLAN IS SHOWN BEFORE ANYTHING IS PAID FOR. You read the Producer's whole campaign - every headline,
// every image prompt, every deal, and its own compliance check - and can edit it, before a single image is
// generated. That gate is the cost control AND the quality control: the image prompt IS the art direction,
// so the place to fix a creative is here, not after paying to render it.

type Deal = { label: string; amount: string; amountSuffix?: string; amountSub?: string; price: string; validity: string; footnote?: string };
type Plan = {
  theme: string; rationale: string;
  masthead: { subjectPrompt: string; phoneScreen: string };
  section1: { subjectPrompt: string; deals: Deal[] };
  sliders: { headline1: string; headline2: string; scenePrompt: string; deal: Deal }[];
  webflow: { heroHeadline: string; heroSubheads: string[]; section1Headline: string; section1Body: string; sliderSubhead: string };
  sms: { copy: string; slug: string; assembled: string; chars: number; gsm7: boolean };
  complianceCheck: string[];
};
type Creative = { kind: string; index: number; url: string; bytes: number; width: number; height: number; error?: string };

// Never hand React something that might be an object. One non-string field should degrade a line of text,
// not destroy the page and take an Opus-priced plan with it.
const txt = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);

const dealLine = (d: Deal) => `${txt(d?.label)} · ${txt(d?.amount)}${txt(d?.amountSuffix)}${d?.amountSub ? ` ${txt(d.amountSub)}` : ""} · ${txt(d?.price)} · ${txt(d?.validity)}`;

export default function CampaignPage() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [brief, setBrief] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "plan" | "produce">("");
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    fetch("/api/studio").then((r) => r.json()).then((d) => {
      const cs = d.clients || [];
      setClients(cs);
      if (cs[0]) setClientId(cs[0].id);
    }).catch(() => {});
  }, []);

  // THE PLAN SURVIVES A RELOAD. It is the expensive artefact on this page - an Opus call, then however long
  // you spent editing the headlines - and it was living in React state alone. A stray reload, a chunk error
  // after a deploy, a mis-hit back button, and it was simply gone. Nothing that costs money and takes thought
  // should be that easy to lose.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gas-studio-campaign");
      if (!raw) return;
      const saved = JSON.parse(raw) as { clientId?: string; brief?: string; plan?: Plan; creatives?: Creative[] };
      if (saved.brief) setBrief(saved.brief);
      if (saved.plan) { setPlan(saved.plan); setRestored(true); }
      if (saved.creatives?.length) setCreatives(saved.creatives);
    } catch { /* a corrupt cache is not worth crashing the page for */ }
  }, []);

  useEffect(() => {
    if (!plan && !brief) return;
    try {
      localStorage.setItem("gas-studio-campaign", JSON.stringify({ clientId, brief, plan, creatives }));
    } catch { /* quota or private mode - the page still works, it just will not remember */ }
  }, [clientId, brief, plan, creatives]);

  // A run that takes minutes must LOOK like it is running. Without this the button reads as dead.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function post(action: "plan" | "produce") {
    setBusy(action); setErr("");
    if (action === "plan") { setPlan(null); setCreatives([]); setWarnings([]); }
    try {
      // Two routes, not one action flag: planning is free and must never load the 67MB renderer, so it
      // cannot be taken down by a rendering problem.
      const r = await fetch(action === "plan" ? "/api/studio/campaign" : "/api/studio/campaign/produce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, brief, plan }),
      });
      // A crashed function returns Vercel's HTML error page, not JSON. Say so plainly instead of throwing
      // "Unexpected token '<'", which tells the user nothing about what broke.
      const text = await r.text();
      let d: { error?: string; plan?: Plan; creatives?: Creative[]; warnings?: string[] };
      try { d = JSON.parse(text); }
      catch { throw new Error(`The server returned an error page (${r.status}), not a result. The function itself failed.`); }
      if (!r.ok) throw new Error(d.error || "That did not work.");
      if (action === "plan") setPlan(d.plan ?? null);
      else { setCreatives(d.creatives || []); setWarnings(d.warnings || []); }
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally { setBusy(""); }
  }

  const edit = (fn: (p: Plan) => void) => { if (!plan) return; const p = structuredClone(plan); fn(p); setPlan(p); };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/studio" className="text-xs font-semibold text-ink-dim transition hover:text-ink">← GAS Studio</Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Funnel campaign</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">
          Tell the Producer what the campaign is. It designs the whole funnel: 1 masthead, 1 section 1, 3 sliders,
          the page copy and the SMS. Nothing is generated until you have read the plan.
        </p>

        {/* ── THE BRIEF ─────────────────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-line bg-surface-1 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px]">
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <span className="text-sm text-ink-dim">Planning is free. Producing spends: 5 generated images + 2 cut-outs.</span>
          </div>
          <textarea
            value={brief} onChange={(e) => setBrief(e.target.value)} rows={4}
            placeholder="Winter campaign. Cosy indoors, staying connected when it is cold outside. Push the voice bundles - R5 for 30 minutes, R10 for unlimited all-net calls. We want people talking to family."
            className="mt-3 w-full rounded-xl border border-line bg-surface-2 p-4 text-base leading-relaxed outline-none focus:border-accent"
          />
          <button onClick={() => post("plan")} disabled={!!busy || !clientId || brief.trim().length < 12}
            className="mt-3 rounded-lg bg-accent px-5 py-2.5 text-[15px] font-bold text-black disabled:opacity-40">
            {busy === "plan" ? "The Producer is thinking…" : "Plan the campaign"}
          </button>
          {err && <p className="mt-3 text-sm font-semibold text-red-400">{err}</p>}
        </section>

        {/* ── THE PLAN ──────────────────────────────────────────────────────────── */}
        {plan && (
          <section className="mt-6 space-y-4">
            {restored && (
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-2.5">
                <p className="text-sm text-ink-dim">Restored the plan you were working on.</p>
                <button
                  onClick={() => { localStorage.removeItem("gas-studio-campaign"); setPlan(null); setCreatives([]); setRestored(false); }}
                  className="text-sm font-semibold text-ink-dim underline hover:text-ink">Start fresh</button>
              </div>
            )}
            <div className="rounded-2xl border border-line bg-surface-1 p-5">
              <p className="text-[13px] font-semibold uppercase tracking-widest text-ink-dim">The idea</p>
              <h2 className="mt-1 text-xl font-bold">{txt(plan.theme)}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{txt(plan.rationale)}</p>
            </div>

            {/* The two cut-out canvases. No baked headline - Webflow supplies the words beside them. */}
            {([
              { key: "masthead", title: "Masthead · 1080×811", prompt: plan.masthead?.subjectPrompt || "",
                set: (v: string) => edit((p) => { p.masthead.subjectPrompt = v; }), deals: [] as Deal[] },
              { key: "section1", title: "Section 1 · 1239×1080", prompt: plan.section1?.subjectPrompt || "",
                set: (v: string) => edit((p) => { p.section1.subjectPrompt = v; }), deals: plan.section1?.deals || [] },
            ]).map((c) => (
              <div key={c.key} className="rounded-2xl border border-line bg-surface-1 p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-base font-bold">{c.title}</p>
                  <span className="text-xs text-ink-dim">no baked headline · Webflow supplies the copy</span>
                </div>
                <textarea value={txt(c.prompt)} onChange={(e) => c.set(e.target.value)} rows={3}
                  className="mt-2 w-full rounded-lg border border-line bg-surface-2 p-3 text-[15px] leading-relaxed outline-none focus:border-accent" />
                {c.deals.length > 0 && (
                  <p className="mt-2 text-sm text-ink-dim">
                    Deal cards: {c.deals.map((d) => <span key={`${txt(d?.label)}-${txt(d?.price)}`} className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 tabular">{dealLine(d)}</span>)}
                  </p>
                )}
              </div>
            ))}

            {/* The three sliders. These DO carry baked copy. */}
            {(plan.sliders || []).map((s, i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface-1 p-5">
                <div className="flex items-baseline justify-between">
                  <p className="text-base font-bold">Slider {i + 1} · 1080×1080</p>
                  <span className="text-xs text-ink-dim tabular">{dealLine(s.deal)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input value={txt(s.headline1)} onChange={(e) => edit((p) => { p.sliders[i].headline1 = e.target.value; })}
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-base font-bold outline-none focus:border-accent" />
                  <input value={txt(s.headline2)} onChange={(e) => edit((p) => { p.sliders[i].headline2 = e.target.value; })}
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-base font-bold text-[#F9CB0F] outline-none focus:border-accent" />
                </div>
                <textarea value={txt(s.scenePrompt)} onChange={(e) => edit((p) => { p.sliders[i].scenePrompt = e.target.value; })} rows={3}
                  className="mt-2 w-full rounded-lg border border-line bg-surface-2 p-3 text-[15px] leading-relaxed outline-none focus:border-accent" />
              </div>
            ))}

            <div className="rounded-2xl border border-line bg-surface-1 p-5">
              <p className="text-[13px] font-semibold uppercase tracking-widest text-ink-dim">Page copy (Webflow)</p>
              <p className="mt-2 text-lg font-bold">{txt(plan.webflow?.heroHeadline)}</p>
              <ul className="mt-1 list-disc pl-5 text-[15px] leading-relaxed text-ink-dim">{(plan.webflow?.heroSubheads || []).map((h, i) => <li key={i}>{txt(h)}</li>)}</ul>
              <p className="mt-4 text-lg font-bold">{txt(plan.webflow?.section1Headline)}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-dim">{txt(plan.webflow?.section1Body)}</p>
            </div>

            {plan.sms && (
            <div className="rounded-2xl border border-line bg-surface-1 p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-semibold uppercase tracking-widest text-ink-dim">SMS</p>
                {/* Segments matter in rand: one non-GSM-7 character drops the segment from 160 chars to 70. */}
                {/* The count is of the ASSEMBLED message - link, queries number and FSP tail included -
                    because that is what actually gets billed. 190 is the client's ceiling. */}
                <span className={`text-xs tabular ${(Number(plan.sms?.chars) || 0) > 190 || !plan.sms?.gsm7 ? "font-bold text-red-400" : "text-ink-dim"}`}>
                  {Number(plan.sms?.chars) || 0}/190 chars · {(Number(plan.sms?.chars) || 0) <= 160 ? "1 segment" : "2 segments"}{plan.sms?.gsm7 ? "" : " · NOT GSM-7"}
                </span>
              </div>
              <p className="mt-2 font-mono text-[15px] leading-relaxed">{txt(plan.sms?.assembled)}</p>
              <p className="mt-2 text-xs text-ink-dim">
                Only the selling line is written by the Producer. The link, the queries number and the
                FSP tail are fixed furniture and are appended automatically.
              </p>
            </div>
            )}

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <p className="text-[13px] font-semibold uppercase tracking-widest text-amber-400">Compliance check</p>
              <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-dim">
                {(plan.complianceCheck || []).map((c, i) => <li key={i}>• {txt(c)}</li>)}
              </ul>
            </div>

            <button onClick={() => post("produce")} disabled={!!busy}
              className="w-full rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-black disabled:opacity-40">
              {busy === "produce"
                ? `Generating and rendering… ${elapsed}s`
                : "Final production · generate the 5 creatives"}
            </button>

            {/* THE ERROR BELONGS WHERE THE CLICK WAS. It used to render only inside the brief card at the top
                of the page, so a failure here appeared far above the fold and the button looked simply dead. */}
            {busy === "produce" && (
              <p className="text-center text-sm text-ink-dim">
                Five images are generating, two are being cut out, then five canvases render. Two to four minutes. Leave this tab open.
              </p>
            )}
            {err && !busy && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-semibold text-red-300">{err}</p>
            )}
          </section>
        )}

        {/* ── THE CREATIVES ─────────────────────────────────────────────────────── */}
        {creatives.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold">The creatives</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {creatives.map((c, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface-1 p-3">
                  {c.url
                    ? <a href={c.url} target="_blank" rel="noreferrer"><img src={c.url} alt="" className="w-full rounded-lg" /></a>
                    : <p className="p-6 text-center text-xs text-red-400">{txt(c.error) || "did not render"}</p>}
                  <p className="mt-2 flex items-baseline justify-between text-xs text-ink-dim">
                    <span className="font-semibold uppercase tracking-wider">{c.kind}{c.kind === "slider" ? ` ${c.index + 1}` : ""}</span>
                    <span className="tabular">{c.width}×{c.height} · {(c.bytes / 1024).toFixed(0)}KB</span>
                  </p>
                </div>
              ))}
            </div>
            {warnings.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-300">
                {warnings.map((w, i) => <li key={i}>• {txt(w)}</li>)}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
