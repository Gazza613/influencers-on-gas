"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function rand(cents: number) {
  return "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function usd(cents: number, zarPerUsd: number) {
  if (!zarPerUsd) return "";
  return "$" + (cents / 100 / zarPerUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Top-bar readout: THIS MONTH's total spend (Rand + Dollar) and credits used, plus
// the live Higgsfield balance. Links to Cost Control for the breakdowns.
export default function CostReadout() {
  const [m, setM] = useState<{ cents: number; credits: number } | null>(null);
  const [rate, setRate] = useState(0);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/usage").then((r) => r.json()).then((d) => { if (alive && d.month) { setM(d.month); setRate(d.zarPerUsd || 0); } }).catch(() => {});
    fetch("/api/balance").then((r) => r.json()).then((d) => { if (alive) setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000 }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, Math.round((bal.remaining / bal.monthly) * 100))) : null;

  return (
    <Link href="/cost-control" className="group tabular flex items-center gap-3 rounded-md border border-line px-3 py-1 text-xs text-ink-dim hover:border-line-strong hover:text-ink" title="Cost Control · this month">
      <span>
        Total Spend{" "}
        <span className="text-ink">{m ? rand(m.cents) : "…"}</span>
        {m && rate > 0 && <span className="text-ink-faint"> ({usd(m.cents, rate)})</span>}
      </span>
      <span className="text-line-strong">·</span>
      <span>
        <span className="text-ink">{m ? m.credits.toLocaleString() : "…"}</span> Credits Used
      </span>
      <span className="hidden items-center gap-1.5 sm:flex" title="Higgsfield credits remaining this month">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
          <span className={`block h-full ${pct != null && pct < 12 ? "bg-alert" : "bg-ready"}`} style={{ width: pct != null ? `${pct}%` : "0%" }} />
        </span>
        <span className="text-ink-faint">{bal?.remaining != null ? `${bal.remaining.toLocaleString()} left` : "balance"}</span>
      </span>
    </Link>
  );
}
