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

// A spinner on EVERY button that does work (Gary: "any button clicked must have a visual spinner so the user
// knows the platform is processing").
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Quirky working copy, so the team can see it is genuinely running and not frozen. Cycles while we wait.
const WORKING_LINES = [
  "Briefing the creative expert…",
  "Studying your reference design…",
  "Keeping the swish exactly where it is…",
  "Casting the right faces…",
  "Rewriting the callout for the campaign…",
  "Matching the MTN type…",
  "Stamping the real MoMo logo (never AI-drawn)…",
  "Checking nobody grew a third hand…",
  "Polishing the pixels…",
  "Almost there - good creative takes a minute…",
];

// INLINE working state - NOT a blocking overlay (Gary: "the spinner can happen in the screen so my team can
// continue on the next scenes in parallel"). Each section renders its own, so the team can fire several
// creatives at once and keep working while they cook.
function WorkingInline({ label }: { label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % WORKING_LINES.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface-2/60 px-6 py-8 text-center" role="status" aria-live="polite">
      <Spinner className="h-6 w-6 text-accent" />
      <p className="text-sm font-bold text-ink">{label}</p>
      <p className="text-xs text-ink-dim">{WORKING_LINES[i]}</p>
      <p className="text-[11px] text-ink-dim/70">Carry on with the other sections - this keeps running.</p>
    </div>
  );
}

// Read a response SAFELY. A long build that exceeds the gateway limit comes back as a 504 HTML page, and
// r.json() then throws an opaque parse error - which is exactly why "build the whole funnel" looked like it
// just hung. Surface something the team can act on instead.
async function readJson(r: Response): Promise<Record<string, unknown>> {
  const text = await r.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (r.status === 504 || r.status === 502) throw new Error("The build took longer than the server allows and timed out. Try 'Just plan it', then generate each creative one at a time.");
    throw new Error(`The server returned ${r.status}. ${text.slice(0, 120)}`);
  }
}

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
  const [concept, setConcept] = useState<Record<string, string>>({}); // slotKey -> creative-director note
  const [flags, setFlags] = useState<string[]>([]);                    // Producer's soft compliance flags
  const [phone, setPhone] = useState<Record<string, string>>({});      // slotKey -> phone treatment
  const [dealSel, setDealSel] = useState<Record<string, string>>({});  // slotKey -> deal id ("" = none)
  const [cards, setCards] = useState<{ id: string; name: string; url: string }[]>([]); // intake deal-card artwork
  const [cardSel, setCardSel] = useState<Record<string, string>>({});  // slotKey -> deal_card asset url ("" = none)
  const [callout, setCallout] = useState<Record<string, string>>({});  // slotKey -> callout text to feature
  const [lightbox, setLightbox] = useState("");                        // url of the creative opened full-screen
  const [edit, setEdit] = useState<Record<string, string>>({});        // slotKey -> edit instruction for the landed render
  const [scene, setScene] = useState<Record<string, string>>({});      // slotKey -> setting/background (SLIDERS ONLY)
  // A DYNAMIC deal the team types. We typeset it in the client's own card design, so every character is exact -
  // the price is never handed to the model (Gary: "deals are dynamic from the client").
  const [custom, setCustom] = useState<Record<string, Deal>>({});      // slotKey -> typed deal
  const [dealPrev, setDealPrev] = useState<Record<string, string>>({}); // slotKey -> rendered card preview url
  const [err, setErr] = useState("");

  // Start a clean campaign - clear everything from the previous one.
  function startNext() {
    setBrief(""); setTheme(""); setPicked({}); setSubject({}); setShot({}); setConcept({});
    setFlags([]); setPhone({}); setDealSel({}); setCardSel({}); setCallout({}); setScene({}); setEdit({});
    setCustom({}); setDealPrev({}); setErr("");
  }

  // Phone treatment -> a line appended to the person direction. Gary: if they hold a phone to the screen, or
  // point at it, showing the MoMo app on that screen (added or invented) is fine.
  // ONE HANDSET, ALWAYS (Gary's hard rule). These read as "the single phone", never "a phone" - the old wording
  // ("they hold up a phone") ADDED a handset to a design that already had one, so the subject ended up looking
  // at one phone while holding up another.
  const PHONE_MAP: Record<string, string> = {
    app: " There is exactly ONE phone in the whole image and they hold up that single phone, screen facing the viewer, showing the MoMo app. They are not looking at or holding any other phone.",
    looking: " There is exactly ONE phone in the whole image and they look at that single phone in their hand; its screen shows the MoMo app. There is no second phone anywhere.",
    pointing: " There is exactly ONE phone in the whole image and they point at that single phone's screen, which shows the MoMo app. There is no second phone anywhere.",
    none: " There is NO phone anywhere in the image - nobody holds, looks at or points at a phone.",
  };

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
    // The client's own deal-card / pill artwork from intake - we composite the chosen one, never draw it.
    fetch(`/api/studio/deal-cards?clientId=${clientId}`).then((r) => r.json()).then((d) => setCards(d.cards || [])).catch(() => {});
  }, [clientId]);

  const [theme, setTheme] = useState("");

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

  // THE PRODUCER PLANS IT. Gary: "the producer should add this in and then we can edit - the producer must be
  // the expert." So one click has the Producer read the brief (and the reference set) and write who should be
  // in every section - theme-embodying - which pre-fills the subject boxes for the user to tweak, not type raw.
  async function plan() {
    if (brief.trim().length < 6) { setErr("Write the brief first."); return; }
    setErr(""); setBusy((b) => ({ ...b, plan: true }));
    try {
      const d = await fetch("/api/studio/campaign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", clientId, brief }),
      }).then(readJson) as any;
      const p = d.plan;
      if (!p) { setErr(d.error || "The Producer could not plan this."); return; }
      setTheme(p.theme || "");
      setSubject((x) => ({
        ...x,
        masthead: p.masthead?.subjectPrompt || x.masthead || "",
        section1: p.section1?.subjectPrompt || x.section1 || "",
        "slider-0": p.sliders?.[0]?.subject || x["slider-0"] || "",
        "slider-1": p.sliders?.[1]?.subject || x["slider-1"] || "",
        "slider-2": p.sliders?.[2]?.subject || x["slider-2"] || "",
      }));
      setConcept({
        masthead: p.masthead?.concept || "",
        section1: p.section1?.concept || "",
        "slider-0": p.sliders?.[0]?.concept || "",
        "slider-1": p.sliders?.[1]?.concept || "",
        "slider-2": p.sliders?.[2]?.concept || "",
      });
      setCallout((x) => ({
        ...x,
        masthead: p.masthead?.callout || x.masthead || "",
        section1: p.section1?.callout || x.section1 || "",
        "slider-0": p.sliders?.[0] ? `${p.sliders[0].headline1} / ${p.sliders[0].headline2}` : x["slider-0"] || "",
        "slider-1": p.sliders?.[1] ? `${p.sliders[1].headline1} / ${p.sliders[1].headline2}` : x["slider-1"] || "",
        "slider-2": p.sliders?.[2] ? `${p.sliders[2].headline1} / ${p.sliders[2].headline2}` : x["slider-2"] || "",
      }));
      setFlags(Array.isArray(p.complianceCheck) ? p.complianceCheck : []);
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, plan: false })); }
  }

  // LET THE EXPERTS BUILD THE WHOLE STACK. One click: the Producer plans, the creative expert picks references
  // and generates all five, finished. The team then co-pilots (rerun / edit / accept). Gary's core philosophy.
  async function buildAll() {
    if (brief.trim().length < 6) { setErr("Give the experts a brief."); return; }
    setErr(""); setBusy((b) => ({ ...b, all: true }));
    try {
      const d = await fetch("/api/studio/build-all", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, brief }),
      }).then(readJson) as any;
      const p = d.plan;
      if (p) {
        setTheme(p.theme || "");
        setSubject({ masthead: p.masthead?.subjectPrompt || "", section1: p.section1?.subjectPrompt || "", "slider-0": p.sliders?.[0]?.subject || "", "slider-1": p.sliders?.[1]?.subject || "", "slider-2": p.sliders?.[2]?.subject || "" });
        setConcept({ masthead: p.masthead?.concept || "", section1: p.section1?.concept || "", "slider-0": p.sliders?.[0]?.concept || "", "slider-1": p.sliders?.[1]?.concept || "", "slider-2": p.sliders?.[2]?.concept || "" });
        setCallout({ masthead: p.masthead?.callout || "", section1: p.section1?.callout || "", "slider-0": p.sliders?.[0] ? `${p.sliders[0].headline1} / ${p.sliders[0].headline2}` : "", "slider-1": p.sliders?.[1] ? `${p.sliders[1].headline1} / ${p.sliders[1].headline2}` : "", "slider-2": p.sliders?.[2] ? `${p.sliders[2].headline1} / ${p.sliders[2].headline2}` : "" });
        setFlags(Array.isArray(p.complianceCheck) ? p.complianceCheck : []);
      }
      for (const c of (d.creatives || []) as { kind: string; index: number; url: string; refUrl: string }[]) {
        const slotKey = c.kind === "slider" ? `slider-${c.index}` : c.kind;
        if (c.url) setShot((s) => ({ ...s, [slotKey]: { url: c.url, status: "new" } }));
        if (c.refUrl) setPicked((x) => ({ ...x, [slotKey]: c.refUrl }));
      }
      if (d.error && !p) setErr(d.error);
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, all: false })); }
  }

  async function generate(slotKey: string, kind: string) {
    const referenceUrl = picked[slotKey] || ""; // optional - the expert picks one if none chosen
    let subj = (subject[slotKey] || "").trim();
    if (!subj) { setErr("Say who should be in it (or let the Producer plan it)."); return; }
    subj += PHONE_MAP[phone[slotKey]] || ""; // fold the phone treatment into the direction
    // A typed (dynamic) deal wins over a library pick - it is what the team actually edited.
    const typed = custom[slotKey];
    const deal = (typed?.label && typed?.price) ? typed : (deals.find((d) => d.id === dealSel[slotKey]) || null);
    setErr(""); setBusy((b) => ({ ...b, [slotKey]: true }));
    try {
      const d = await fetch("/api/studio/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, kind, referenceUrl, subject: subj, deal, callout: callout[slotKey] || "", theme, dealCardUrl: cardSel[slotKey] || "", scene: scene[slotKey] || "" }),
      }).then(readJson) as any;
      if (d.url) setShot((s) => ({ ...s, [slotKey]: { url: d.url, status: "new" } }));
      else setErr(d.error || "generation failed");
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, [slotKey]: false })); }
  }

  function setCustomField(slotKey: string, field: keyof Deal, value: string) {
    setCustom((x) => ({ ...x, [slotKey]: { ...(x[slotKey] || { id: "", label: "", amount: "", price: "", validity: "" }), [field]: value } as Deal }));
    setDealPrev((p) => ({ ...p, [slotKey]: "" })); // the preview is stale the moment the numbers change
  }

  // Render the typed deal as the ACTUAL card that will land, so the team can check it before spending a
  // generate. Free - our own renderer, no vendor call.
  async function previewDeal(slotKey: string) {
    const deal = custom[slotKey];
    if (!deal?.label || !deal?.price) { setErr("A deal needs at least a label and a price."); return; }
    setErr(""); setBusy((b) => ({ ...b, [`dp-${slotKey}`]: true }));
    try {
      const d = await fetch("/api/studio/deal-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, deal }),
      }).then(readJson) as any;
      if (d.url) setDealPrev((p) => ({ ...p, [slotKey]: d.url }));
      else setErr(d.error || "could not render the card");
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, [`dp-${slotKey}`]: false })); }
  }

  // ITERATE ON THE LANDED RENDER (Gary): edit the creative in front of you, rather than re-rolling from the
  // reference. The brand locks (logo, chosen deal card) are re-applied server side, so iterating is safe.
  async function applyEdit(slotKey: string, kind: string) {
    const s = shot[slotKey];
    const instruction = (edit[slotKey] || "").trim();
    if (!s || instruction.length < 3) { setErr("Say what you want changed on this creative."); return; }
    setErr(""); setBusy((b) => ({ ...b, [slotKey]: true }));
    try {
      const d = await fetch("/api/studio/edit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, kind, imageUrl: s.url, instruction,
          referenceUrl: picked[slotKey] || "", dealCardUrl: cardSel[slotKey] || "",
        }),
      }).then(readJson) as any;
      if (d.url) { setShot((x) => ({ ...x, [slotKey]: { url: d.url, status: "new" } })); setEdit((x) => ({ ...x, [slotKey]: "" })); }
      else setErr(d.error || "the edit failed");
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy((b) => ({ ...b, [slotKey]: false })); }
  }

  const refsFor = (m: RegExp) => refs.filter((r) => m.test(r.name || ""));
  const accepted = Object.values(shot).filter((s) => s.status === "accepted").length;
  const totalSlots = SECTIONS.reduce((n, s) => n + s.count, 0);

  // Nothing blocks the screen: each creative shows its own inline working state, so the team can fire several
  // sections at once and keep editing the rest (Gary).
  const slotTitle = (k: string) => (k.startsWith("slider-") ? `slider ${Number(k.split("-")[1]) + 1}` : k === "section1" ? "section 1" : k);

  // The download filename for a slot, labelled the way Gary wants: masthead / section-1 / section-2-slider-N.
  const fileLabel = (k: string) =>
    k === "masthead" ? "masthead" : k === "section1" ? "section-1" : `section-2-slider-${Number(k.split("-")[1] || 0) + 1}`;

  // DOWNLOAD ALL accepted creatives, each with its labelled filename. Straight to the browser's downloads for
  // now (desktop); a named Drive folder is a later integration once the client gives us the folder.
  async function downloadAll() {
    for (const [k, s] of Object.entries(shot)) {
      if (s.status !== "accepted") continue;
      try {
        const blob = await fetch(s.url).then((r) => r.blob());
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${fileLabel(k)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 400)); // let the browser queue each one
      } catch { /* skip a failed file, keep going */ }
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/studio" className="text-xs font-semibold text-ink-dim transition hover:text-ink">← GAS Studio</Link>
          <button onClick={startNext} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink-dim hover:border-ink-dim hover:text-ink">↻ Start next campaign</button>
        </div>
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={buildAll} disabled={!!busy.all || brief.trim().length < 6}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#818cf8] to-[#f472b6] px-5 py-2.5 text-sm font-bold text-black disabled:opacity-40">
              {busy.all && <Spinner />}
              {busy.all ? "The experts are building the full funnel… (a few minutes)" : "✦ Let the experts build the whole funnel"}
            </button>
            <button onClick={plan} disabled={!!busy.plan || !!busy.all || brief.trim().length < 6}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink-dim hover:text-ink disabled:opacity-40">
              {busy.plan && <Spinner />}
              {busy.plan ? "Planning…" : "Just plan it (I'll pick + generate)"}
            </button>
            <button onClick={sharpen} disabled={!!busy.brief || !!busy.all || brief.trim().length < 6}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink-dim hover:text-ink disabled:opacity-40">
              {busy.brief && <Spinner />}
              {busy.brief ? "Reading…" : "Sharpen the brief"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-faint">The experts plan, pick your best designs, generate and finish all five. Your team co-pilots below - rerun, edit or accept any creative.</p>
          {theme && (
            <p className="mt-3 text-sm text-ink-dim">
              <span className="font-bold text-ink">{theme}</span> — the Producer has filled in who should be in
              each section below. Edit any of them, then pick a design and generate.
            </p>
          )}
        </section>

        {err && <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm font-semibold text-red-300">{err}</p>}

        {/* Producer's flags - advisory only, never a block. The team reads and decides. */}
        {flags.length > 0 && (
          <details className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <summary className="cursor-pointer text-sm font-bold text-amber-300">{flags.length} thing{flags.length === 1 ? "" : "s"} the Producer flagged for your team to check</summary>
            <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-dim">
              {flags.map((f, i) => <li key={i}>• {f}</li>)}
            </ul>
          </details>
        )}

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

                    {/* the Producer's creative-director note for this creative */}
                    {concept[slotKey] && (
                      <div className="mb-3 rounded-lg border border-[#818cf8]/30 bg-[#818cf8]/[0.06] px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#a5b4fc]">Producer&apos;s direction</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-ink-dim">{concept[slotKey]}</p>
                      </div>
                    )}

                    {/* carousel of this section's references */}
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {options.length === 0 && <p className="text-sm text-ink-faint">No {sec.title.toLowerCase()} designs uploaded at intake.</p>}
                      {options.map((r) => (
                        <button key={r.id} onClick={() => setPicked((p) => ({ ...p, [slotKey]: r.url }))}
                          className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${chosen === r.url ? "border-accent" : "border-line hover:border-ink-dim"}`}>
                          <img src={r.url} alt={r.name || ""} className="h-52 w-auto bg-surface-2 object-contain" />
                        </button>
                      ))}
                    </div>

                    <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-ink-faint">Who should be in it? (bring the theme in)</label>
                    <input value={subject[slotKey] || ""} onChange={(e) => setSubject((x) => ({ ...x, [slotKey]: e.target.value }))}
                      placeholder="e.g. a mother and her adult daughter smiling together"
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[15px] outline-none focus:border-accent" />

                    {/* per-creative controls: deal card, deal text, phone, callout */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {/* THE OFFER. Two brand-safe routes, never AI-drawn:
                          1. pick one of the client's own intake artworks (visual picker, so the team SEES it), or
                          2. type a dynamic deal, which we TYPESET in the client's own card design - every
                             character exact, because we set the type (Gary: "deals are dynamic from the client"). */}
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Deal card / pill (top right)</label>
                        <div className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-surface-2 p-1.5">
                          <button onClick={() => setCardSel((x) => ({ ...x, [slotKey]: "" }))}
                            className={`rounded border px-2 py-1 text-[11px] font-bold ${!cardSel[slotKey] ? "border-accent text-accent" : "border-line text-ink-dim"}`}>
                            None
                          </button>
                          {cards.map((c) => (
                            <button key={c.id} onClick={() => setCardSel((x) => ({ ...x, [slotKey]: c.url }))}
                              title={c.name.replace(/\.(png|jpe?g)$/i, "")}
                              className={`rounded border p-0.5 ${cardSel[slotKey] === c.url ? "border-accent ring-1 ring-accent" : "border-line"}`}>
                              <img src={c.url} alt={c.name} className="h-11 w-auto rounded-sm bg-white/5 object-contain" />
                            </button>
                          ))}
                        </div>
                        {cardSel[slotKey] && <p className="mt-1 text-[11px] text-[#86efac]">✓ Real artwork - composited exactly, never redrawn.</p>}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">…or type a deal (we typeset it)</label>
                        <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          <input value={custom[slotKey]?.label || ""} onChange={(e) => setCustomField(slotKey, "label", e.target.value)}
                            disabled={!!cardSel[slotKey]} placeholder="Social Pass"
                            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] outline-none focus:border-accent disabled:opacity-40" />
                          <input value={custom[slotKey]?.amount || ""} onChange={(e) => setCustomField(slotKey, "amount", e.target.value)}
                            disabled={!!cardSel[slotKey]} placeholder="5GB"
                            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] outline-none focus:border-accent disabled:opacity-40" />
                          <input value={custom[slotKey]?.price || ""} onChange={(e) => setCustomField(slotKey, "price", e.target.value)}
                            disabled={!!cardSel[slotKey]} placeholder="R49"
                            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] outline-none focus:border-accent disabled:opacity-40" />
                          <input value={custom[slotKey]?.validity || ""} onChange={(e) => setCustomField(slotKey, "validity", e.target.value)}
                            disabled={!!cardSel[slotKey]} placeholder="*Valid for 7 Days"
                            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] outline-none focus:border-accent disabled:opacity-40" />
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button onClick={() => previewDeal(slotKey)}
                            disabled={!!cardSel[slotKey] || !(custom[slotKey]?.label && custom[slotKey]?.price) || !!busy[`dp-${slotKey}`]}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-ink-dim hover:text-ink disabled:opacity-40">
                            {busy[`dp-${slotKey}`] && <Spinner className="h-3 w-3" />} Preview card
                          </button>
                          <select value={dealSel[slotKey] || ""} onChange={(e) => { const d = deals.find((x) => x.id === e.target.value); setDealSel((x) => ({ ...x, [slotKey]: e.target.value })); if (d) setCustom((x) => ({ ...x, [slotKey]: { id: d.id, label: d.label, amount: d.amount, amountSuffix: d.amountSuffix || "", price: d.price, validity: d.validity } })); setDealPrev((p) => ({ ...p, [slotKey]: "" })); }}
                            disabled={!!cardSel[slotKey]}
                            className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] outline-none focus:border-accent disabled:opacity-40">
                            <option value="">…or start from the deal library</option>
                            {deals.map((d) => <option key={d.id} value={d.id}>{d.label} · {d.amount}{d.amountSuffix || ""} · {d.price}</option>)}
                          </select>
                        </div>
                        {dealPrev[slotKey] && (
                          <img src={dealPrev[slotKey]} alt="" onClick={() => setLightbox(dealPrev[slotKey])}
                            className="mt-1.5 h-20 cursor-zoom-in rounded border border-line bg-surface-2 object-contain p-1" />
                        )}
                      </div>
                      {/* SETTING - sliders only. Masthead/section 1 must keep the flat funnel colour or they
                          stop matching the Webflow section they drop into. */}
                      {sec.key === "slider" ? (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Setting / background</label>
                          <input value={scene[slotKey] || ""} onChange={(e) => setScene((x) => ({ ...x, [slotKey]: e.target.value }))}
                            placeholder="Keep the design's"
                            className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Background</label>
                          <p className="mt-1 rounded-lg border border-dashed border-line px-2.5 py-2 text-[12px] text-ink-dim/80">
                            Locked to the funnel {sec.key === "section1" ? "white" : "navy"} so it drops into Webflow seamlessly.
                          </p>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Phone in shot</label>
                        <select value={phone[slotKey] || ""} onChange={(e) => setPhone((x) => ({ ...x, [slotKey]: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent">
                          <option value="">Keep the design&apos;s</option>
                          <option value="app">Phone screen to camera (app)</option>
                          <option value="looking">Looking at the screen</option>
                          <option value="pointing">Pointing at the screen</option>
                          <option value="none">No phone</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Callout to change</label>
                        <input value={callout[slotKey] || ""} onChange={(e) => setCallout((x) => ({ ...x, [slotKey]: e.target.value }))}
                          placeholder="e.g. Happy Mother's Day"
                          className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => generate(slotKey, sec.key)} disabled={!!busy[slotKey]}
                        className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-bold text-black disabled:opacity-40">
                        {busy[slotKey] && <Spinner />}
                        {busy[slotKey] ? "Generating… (a few min)" : s ? "Rerun" : chosen ? "Generate" : "Generate (expert picks a design)"}
                      </button>
                      {s && s.status !== "accepted" && (
                        <button onClick={() => setShot((x) => ({ ...x, [slotKey]: { ...s, status: "accepted" } }))}
                          className="rounded-lg border border-[#4ade80]/50 bg-[#4ade80]/10 px-4 py-2 text-sm font-bold text-[#86efac]">Accept</button>
                      )}
                      {s && <button onClick={() => setShot((x) => { const c = { ...x }; delete c[slotKey]; return c; })}
                        className="text-sm font-semibold text-ink-dim underline hover:text-ink">Reject</button>}
                    </div>

                    {/* This creative's own working state - inline, so other sections stay fully usable. */}
                    {busy[slotKey] && (
                      <div className="mt-3">
                        <WorkingInline label={`Generating your ${slotTitle(slotKey)}`} />
                      </div>
                    )}

                    {s && !busy[slotKey] && (
                      <div className="mt-3">
                        <button onClick={() => setLightbox(s.url)} className="group relative block w-full max-w-md" title="Open full screen">
                          <img src={s.url} alt="" className={`w-full rounded-lg border-2 ${s.status === "accepted" ? "border-[#4ade80]" : "border-line"}`}
                            style={sec.key === "section1" ? { background: "#fff" } : undefined} />
                          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">⤢ Open</span>
                        </button>
                        {s.status === "accepted" && <p className="mt-1 text-xs font-bold text-[#86efac]">✓ Accepted</p>}

                        {/* EDIT WHAT LANDED (Gary) - tweak this exact creative instead of re-rolling it.
                            The logo and the chosen deal card are re-stamped after the edit, so iterating
                            can never garble them. */}
                        <div className="mt-2 w-full max-w-md">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-faint">Change something on this image</label>
                          <div className="mt-1 flex gap-2">
                            <input
                              value={edit[slotKey] || ""}
                              onChange={(e) => setEdit((x) => ({ ...x, [slotKey]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === "Enter") applyEdit(slotKey, sec.key); }}
                              placeholder="e.g. lose the second phone · make her cardigan navy · warmer light"
                              className="flex-1 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] outline-none focus:border-accent"
                            />
                            <button onClick={() => applyEdit(slotKey, sec.key)} disabled={!!busy[slotKey] || (edit[slotKey] || "").trim().length < 3}
                              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink-dim hover:text-ink disabled:opacity-40">
                              Apply
                            </button>
                          </div>
                          <p className="mt-1 text-[11px] text-ink-dim/70">Edits this render, keeping everything else. The logo and deal card stay locked.</p>
                        </div>
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
          {accepted === totalSlots && (
            <button onClick={downloadAll} className="mt-3 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-black">
              ⤓ Download all (masthead · section 1 · section 2)
            </button>
          )}
          {deals.length > 0 && (
            <p className="mt-2 text-xs text-ink-faint">Deal library available for the offer step: {deals.slice(0, 4).map(dealText).join("  ·  ")}{deals.length > 4 ? " …" : ""}</p>
          )}
        </div>
      </main>

      {/* PREVIEW / OPEN IN SCREEN - click any rendered creative to see it full size. */}
      {lightbox && (
        <div onClick={() => setLightbox("")} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6" role="dialog">
          <img src={lightbox} alt="" className="max-h-[92vh] max-w-[95vw] rounded-lg" style={{ background: "#0b0f14" }} />
          <button onClick={() => setLightbox("")} className="absolute right-5 top-5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/20">Close ✕</button>
          <a href={lightbox} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="absolute bottom-5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/20">Open in new tab ↗</a>
        </div>
      )}
    </div>
  );
}
