"use client";

import { useEffect, useState } from "react";
import { flex } from "@/lib/flex";

// THE WAY BACK, for the public landing page (Gary: "i may go back to how it is now so it must be reversible
// if i dont like it").
//
// Lives on Connect Tools rather than the dashboard, because it is a setting and the dashboard's job is to be
// six tiles and nothing else. Switching is one click and takes effect for the next visitor - no deploy, and
// no waiting on me.
//
// The preview links matter as much as the switch: they force the OTHER layout for you alone, via ?layout=,
// without changing what the public sees. So you can look at both properly before deciding, which is the thing
// that was missing when this was hard-coded.

export default function LandingLayoutSwitch() {
  const [layout, setLayout] = useState<"systems" | "cards" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/landing-layout", { cache: "no-store" })
      .then((r) => r.json()).then((d) => setLayout(d?.layout === "cards" ? "cards" : "systems"))
      .catch(() => setLayout("systems"));
  }, []);

  async function choose(next: "systems" | "cards") {
    if (busy || next === layout) return;
    setBusy(true);
    const r = await fetch("/api/landing-layout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: next }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) { setLayout(next); flex(next === "systems" ? "The public page now shows the six systems." : "The public page is back to the floating influencer photos."); }
    else flex("Could not change that.");
  }

  if (!layout) return null;

  const Option = ({ id, title, note }: { id: "systems" | "cards"; title: string; note: string }) => (
    <button onClick={() => choose(id)} disabled={busy}
      className={`flex-1 rounded-lg border p-4 text-left transition disabled:opacity-50 ${
        layout === id ? "border-[#a855f7]/60 bg-[#a855f7]/10" : "border-line hover:border-line-strong"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${layout === id ? "bg-[#c79bff]" : "bg-transparent ring-1 ring-line-strong"}`} />
        <span className="text-base font-bold text-ink">{title}</span>
        {layout === id && <span className="text-[13px] font-semibold text-[#c79bff]">live</span>}
      </div>
      <p className="mt-1.5 text-[15px] text-ink-dim">{note}</p>
    </button>
  );

  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold text-ink">Public landing page</h2>
      <p className="mt-1.5 text-base text-ink-dim">
        What a visitor sees at influencers.gasmarketing.co.za before they sign in. Switch back at any time.
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Option id="systems" title="The six systems" note="The six systems float down both sides. Says what the platform is made of." />
        <Option id="cards" title="Influencer photos" note="The original: six real cast photos drifting down the sides." />
      </div>
      <p className="mt-3 text-[15px] text-ink-faint">
        Look before you switch:{" "}
        <a href="/?layout=systems" target="_blank" rel="noreferrer" className="font-semibold text-[#c79bff] hover:underline">preview the systems</a>
        {" · "}
        <a href="/?layout=cards" target="_blank" rel="noreferrer" className="font-semibold text-[#c79bff] hover:underline">preview the photos</a>
        . A preview is yours alone and changes nothing for visitors.
      </p>
    </section>
  );
}
