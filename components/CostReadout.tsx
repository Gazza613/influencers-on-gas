"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  total: { credits: number; cents: number; events: number };
};

function rand(cents: number) {
  return "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Live spend chip in the studio top bar: this-account credits + Rand from the
// usage ledger, plus the live Higgsfield balance bar. Links through to /studio/costs.
export default function CostReadout() {
  const [sum, setSum] = useState<Summary | null>(null);
  const [bal, setBal] = useState<{ remaining: number | null; monthly: number } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/usage").then((r) => r.json()).then((d) => { if (alive && d.summary) setSum(d.summary); }).catch(() => {});
    fetch("/api/balance").then((r) => r.json()).then((d) => { if (alive) setBal({ remaining: d.remaining ?? null, monthly: d.monthly ?? 9000 }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const credits = sum ? Math.round(sum.total.credits) : null;
  const pct = bal?.remaining != null ? Math.max(0, Math.min(100, Math.round((bal.remaining / bal.monthly) * 100))) : null;

  return (
    <Link href="/cost-control" className="group tabular flex items-center gap-2 rounded-md border border-line px-2.5 py-1 text-xs text-ink-dim hover:border-line-strong hover:text-ink" title="Cost Control">
      <span>
        spend{" "}
        <span className="text-ink">{sum ? rand(sum.total.cents) : "…"}</span>
        {credits != null && <span className="text-ink-faint"> · {credits.toLocaleString()} cr</span>}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
          <span
            className={`block h-full ${pct != null && pct < 12 ? "bg-active" : "bg-ready"}`}
            style={{ width: pct != null ? `${pct}%` : "0%" }}
          />
        </span>
        <span className="text-ink-faint">{bal?.remaining != null ? `${bal.remaining.toLocaleString()} left` : "balance"}</span>
      </span>
    </Link>
  );
}
