"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Uploader from "@/components/Uploader";
import ConsentGate from "@/components/ConsentGate";
import { buildProgress, ringColour } from "@/lib/build-progress";

type View = "menu" | "new" | "twin" | "existing";
type Inf = { id: string; name: string; mode: string; persona?: Record<string, unknown> | null; look_refs?: { url: string; hero?: boolean }[] | null; higgsfield_soul_id?: string | null; voice_id?: string | null; heygen_avatar_id?: string | null };

const OPTIONS = [
  { key: "new", emoji: "✨", title: "Build a new influencer", blurb: "Cast a brand-new face from a one-line brief.", grad: "linear-gradient(135deg,#EC4899,#A855F7)" },
  { key: "twin", emoji: "🧬", title: "Build my digital twin", blurb: "Turn your own photo into a lifelike twin.", grad: "linear-gradient(135deg,#FFB020,#FF2D55)" },
  { key: "existing", emoji: "♻️", title: "Use existing influencer", blurb: "Pick one you've already built and carry on.", grad: "linear-gradient(135deg,#60A5FA,#8B5CF6)" },
] as const;

export default function StartPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("menu");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // new
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "">("");
  const [refUrl, setRefUrl] = useState<string | null>(null);
  // twin
  const [twinName, setTwinName] = useState("");
  const [consenting, setConsenting] = useState(false);
  const [twinConsentId, setTwinConsentId] = useState<string | null>(null);
  const [twinPhoto, setTwinPhoto] = useState<string | null>(null);
  // existing
  const [list, setList] = useState<Inf[] | null>(null);

  useEffect(() => {
    if (view === "existing" && list === null) {
      fetch("/api/influencers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { influencers: [] })).then((d) => setList(d.influencers || [])).catch(() => setList([]));
    }
  }, [view, list]);

  async function create(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    const r = await fetch("/api/influencers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d?.error || "Could not create"); setBusy(false); return; }
    router.push(`/setup/influencers/${d.id}`);
  }

  const back = () => { setView("menu"); setErr(""); setConsenting(false); setTwinConsentId(null); setTwinPhoto(null); };

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", background: "#07070E" }} className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {/* ambient */}
      <div style={{ position: "absolute", width: 700, height: 700, top: "-20%", left: "-15%", borderRadius: "50%", background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 65%)", animation: "sOrb 16s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 640, height: 640, bottom: "-22%", right: "-12%", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,113,227,0.16) 0%, transparent 65%)", animation: "sOrb 21s ease-in-out infinite reverse", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)", backgroundSize: "30px 30px", pointerEvents: "none" }} />

      <div className="relative z-10 w-full max-w-3xl">
        <Link href="/" className="absolute -top-10 left-0 text-xs text-ink-faint hover:text-ink">← Home</Link>

        {view === "menu" && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">How do you want to start?</h1>
            <p className="mt-3 text-sm text-ink-dim">Three ways to bring an influencer to life. Pick one, lock the identity, then take it to video production.</p>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {OPTIONS.map((o, i) => (
                <button key={o.key} onClick={() => setView(o.key as View)} className="start-card group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 p-6 text-left transition" style={{ animation: `cardIn 0.5s ease ${0.05 + i * 0.08}s both` }}>
                  <div className="start-bar absolute inset-x-0 top-0 h-1" style={{ background: o.grad }} />
                  <div className="text-3xl">{o.emoji}</div>
                  <div className="mt-3 truncate text-base font-bold text-white">{o.title}</div>
                  <div className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-dim">{o.blurb}</div>
                  <span className="start-cta mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg transition" style={{ background: o.grad }}>
                    Start <span className="start-arrow transition-transform">→</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {view === "new" && (
          <Panel title="Build a new influencer" onBack={back}>
            <p className="text-sm text-ink-dim">Name it and pick the gender. Then write a one-line brief and our co-pilot designs the whole character, or upload a reference to steer the look (we then skip casting and shoot from it).</p>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Ava)" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
            <GenderToggle value={gender} onChange={setGender} />
            <Uploader kind="reference" label="Reference image (optional)" current={refUrl} onUploaded={setRefUrl} />
            <button onClick={() => create({ name: name.trim(), mode: "synthetic", persona: { ...(refUrl ? { reference_url: refUrl } : {}), gender } })} disabled={!name.trim() || !gender || busy}
              className="btn-brand w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50">{busy ? "Creating…" : !gender ? "Pick a gender to continue" : "Create influencer →"}</button>
          </Panel>
        )}

        {view === "twin" && (
          <Panel title="Build my digital twin" onBack={back}>
            {!consenting && !twinConsentId && (
              <>
                <p className="text-sm text-ink-dim">Your own likeness from a photo. We capture consent first (POPIA / GDPR), then you upload, and we skip casting and shoot straight from your face.</p>
                <input autoFocus value={twinName} onChange={(e) => setTwinName(e.target.value)} placeholder="Name (e.g. Gary)" className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
                <button onClick={() => setConsenting(true)} disabled={!twinName.trim()} className="btn-brand w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50">Continue to consent →</button>
              </>
            )}
            {consenting && !twinConsentId && <ConsentGate dataType="image" onCancel={() => setConsenting(false)} onConfirm={(id) => setTwinConsentId(id)} />}
            {twinConsentId && (
              <>
                <p className="text-sm text-ink-dim">Upload your photo. This is the identity, so pick a clear, well-lit face shot.</p>
                <Uploader kind="twin" label="Your photo" current={twinPhoto} onUploaded={setTwinPhoto} />
                <button onClick={() => create({ name: twinName.trim(), mode: "twin", consentId: twinConsentId, persona: { reference_url: twinPhoto } })} disabled={!twinPhoto || busy}
                  className="btn-brand w-full rounded-lg py-3 text-sm font-bold disabled:opacity-50">{busy ? "Creating…" : "Create my twin →"}</button>
              </>
            )}
          </Panel>
        )}

        {view === "existing" && (
          <Panel title="Use an existing influencer" onBack={back}>
            {list === null && <p className="text-sm text-ink-faint">Loading your roster…</p>}
            {list && list.length === 0 && <p className="text-sm text-ink-dim">None yet. Go back and build your first one.</p>}
            {list && list.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {list.map((inf) => {
                  const { pct } = buildProgress(inf);
                  const face = (inf.persona as { hero_url?: string })?.hero_url || (inf.persona as { reference_url?: string })?.reference_url || inf.look_refs?.find?.((r) => r.hero)?.url || null;
                  return (
                    <button key={inf.id} onClick={() => router.push(`/setup/influencers/${inf.id}`)} className="group rounded-xl border border-line bg-surface-2 p-3 text-left transition hover:border-line-strong">
                      <div className="flex items-center gap-2">
                        <svg width="30" height="30" className="-rotate-90"><circle cx="15" cy="15" r="12" fill="none" stroke="var(--color-line,#ffffff14)" strokeWidth="3" /><circle cx="15" cy="15" r="12" fill="none" stroke={ringColour(pct)} strokeWidth="3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 12} strokeDashoffset={2 * Math.PI * 12 * (1 - pct / 100)} /></svg>
                        {face && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={face} alt={inf.name} className="h-7 w-7 rounded-full object-cover" />
                        )}
                      </div>
                      <div className="mt-2 truncate text-sm font-semibold text-white">{inf.name}</div>
                      <div className="tabular text-[10px] uppercase tracking-wide text-ink-faint">{inf.mode === "twin" ? "digital twin" : "synthetic"} · {pct}%</div>
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>
        )}

        {err && <p className="mt-4 text-xs text-alert">{err}</p>}
      </div>

      <style>{`
        @keyframes sOrb { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(1.08)} }
        @keyframes cardIn { from{opacity:0; transform:translateY(16px)} to{opacity:1; transform:translateY(0)} }
        .start-card { transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
        .start-card:hover { transform: translateY(-5px); box-shadow: 0 22px 55px rgba(0,0,0,0.55); border-color: rgba(255,255,255,0.2); }
        .start-bar { height: 3px; transition: height .2s ease, filter .2s ease; }
        .start-card:hover .start-bar { height: 5px; filter: brightness(1.15); }
        .start-cta { opacity: .92; }
        .start-card:hover .start-cta { opacity: 1; transform: translateY(-1px); filter: saturate(1.1) brightness(1.06); box-shadow: 0 8px 26px rgba(168,85,247,0.35); }
        .start-card:hover .start-arrow { transform: translateX(4px); }
      `}</style>
    </div>
  );
}

function GenderToggle({ value, onChange }: { value: "female" | "male" | ""; onChange: (v: "female" | "male") => void }) {
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Gender</div>
      <div className="grid grid-cols-2 gap-2">
        {(["female", "male"] as const).map((g) => (
          <button key={g} type="button" onClick={() => onChange(g)}
            className={`rounded-lg border py-2.5 text-sm font-semibold capitalize transition ${value === g ? "border-[#a855f7] bg-[#a855f7]/15 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong hover:text-ink"}`}>
            {g === "female" ? "♀ Female" : "♂ Male"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md text-left" style={{ animation: "cardIn 0.4s ease both" }}>
      <button onClick={onBack} className="mb-3 text-xs text-ink-faint hover:text-ink">← Back to options</button>
      <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
      <div className="mt-4 space-y-3 rounded-2xl border border-line bg-surface-1 p-6">{children}</div>
    </div>
  );
}
