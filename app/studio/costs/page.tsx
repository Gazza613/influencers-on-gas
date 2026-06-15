"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  total: { credits: number; cents: number; events: number };
  byInfluencer: { name: string; credits: number; cents: number }[];
  byProvider: { provider: string; credits: number; cents: number }[];
  byDay: { day: string; credits: number; cents: number }[];
};

const rand = (cents: number) =>
  "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PROVIDER_LABEL: Record<string, string> = {
  higgsfield: "Higgsfield (images · Soul)",
  heygen: "HeyGen (presenter)",
  magnific: "Magnific (Humaniser)",
  anthropic: "Claude (Character Bible)",
  elevenlabs: "ElevenLabs (voice)",
  voyage: "Voyage (embeddings)",
};

export default function CostsPage() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number; creditZarCents: number } | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage").then((r) => r.json()).then((d) => setSum(d.summary)).catch(() => {});
    fetch("/api/balance")
      .then((r) => r.json())
      .then((d) => { setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000, creditZarCents: d.creditZarCents ?? 64 }); if (d.error) setBalErr(d.error); })
      .catch((e) => setBalErr(String(e)));
  }, []);

  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, (bal.remaining / bal.monthly) * 100)) : null;
  const used = bal?.remaining != null ? bal.monthly - bal.remaining : null;
  const remainingRand = bal?.remaining != null ? (bal.remaining * bal.creditZarCents) / 100 : null;

  return (
    <div className="min-h-dvh bg-surface-0 text-ink">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-line bg-surface-1 px-4 py-2.5">
        <Link href="/studio" className="flex items-center gap-2 font-extrabold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gas-logo.png" alt="GAS" className="h-7 w-7 rounded-full" />
          <span>Influencers <span className="text-accent">on</span> GAS</span>
        </Link>
        <Link href="/studio" className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink">
          ← Back to studio
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-bold">Cost intelligence</h1>
        <p className="mt-1 text-sm text-ink-dim">
          What every generation actually costs. Live Higgsfield credit balance is the ground truth;
          the ledger below prices each job from the rate card.
        </p>

        {/* Hero: live balance + ledger spend */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Live balance ring-ish bar */}
          <div className="rounded-xl border border-line bg-surface-1 p-5 sm:col-span-2">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Higgsfield credits (live)</div>
            {bal?.remaining != null ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="tabular text-3xl font-bold text-ink">{bal.remaining.toLocaleString()}</span>
                  <span className="text-sm text-ink-dim">/ {bal.monthly.toLocaleString()} this month</span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={`h-full ${pct != null && pct < 12 ? "bg-active" : "bg-ready"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="tabular mt-2 flex justify-between text-xs text-ink-dim">
                  <span>{used != null ? used.toLocaleString() : "–"} used</span>
                  <span>≈ {remainingRand != null ? rand(remainingRand * 100) : "–"} of value left</span>
                </div>
                {pct != null && pct < 12 && (
                  <p className="mt-2 text-xs font-semibold text-active">Running low — top up before the next big shoot.</p>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-dim">{balErr ? `Couldn't read live balance (${balErr}).` : "Reading live balance…"}</p>
            )}
          </div>

          {/* Ledger spend */}
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="tabular text-[10px] uppercase tracking-[0.25em] text-ink-faint">Tracked spend (ledger)</div>
            <div className="tabular mt-2 text-3xl font-bold text-ink">{sum ? rand(sum.total.cents) : "…"}</div>
            <div className="tabular mt-1 text-xs text-ink-dim">
              {sum ? `${Math.round(sum.total.credits).toLocaleString()} credits · ${sum.total.events} jobs` : "loading…"}
            </div>
          </div>
        </div>

        {/* By provider */}
        <Section title="By tool">
          {sum?.byProvider?.length ? (
            <Table
              rows={sum.byProvider.map((p) => ({
                label: PROVIDER_LABEL[p.provider] ?? p.provider,
                credits: p.credits,
                cents: p.cents,
              }))}
            />
          ) : (
            <Empty />
          )}
        </Section>

        {/* By influencer */}
        <Section title="By influencer">
          {sum?.byInfluencer?.length ? (
            <Table rows={sum.byInfluencer.map((i) => ({ label: i.name, credits: i.credits, cents: i.cents }))} />
          ) : (
            <Empty />
          )}
        </Section>

        {/* By day */}
        <Section title="By day">
          {sum?.byDay?.length ? (
            <Table rows={sum.byDay.map((d) => ({ label: d.day, credits: d.credits, cents: d.cents }))} />
          ) : (
            <Empty />
          )}
        </Section>

        <p className="mt-8 text-xs text-ink-faint">
          Prices come from the <span className="text-ink-dim">rate_card</span> table (R0.64 / credit on the Ultra plan).
          Images on Higgsfield run ~1 credit; Soul training ~40; the Character Bible is Claude tokens; presenter builds are included.
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="tabular mb-2 text-[10px] uppercase tracking-[0.25em] text-ink-faint">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface-1">{children}</div>
    </section>
  );
}

function Table({ rows }: { rows: { label: string; credits: number; cents: number }[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line last:border-0">
            <td className="px-4 py-2.5 text-ink">{r.label}</td>
            <td className="tabular px-4 py-2.5 text-right text-ink-dim">{Math.round(r.credits).toLocaleString()} cr</td>
            <td className="tabular px-4 py-2.5 text-right font-semibold text-ink">{rand(r.cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return <div className="px-4 py-6 text-center text-xs text-ink-faint">No spend tracked yet — run a generation to see it here.</div>;
}
