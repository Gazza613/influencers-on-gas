"use client";

import { useState } from "react";
import type { ConnectionStatus } from "@/lib/connections";
import { flex } from "@/lib/flex";

export default function ConnectTools({
  initial,
  canEdit,
}: {
  initial: ConnectionStatus[];
  canEdit: boolean;
}) {
  const [conns, setConns] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch("/api/connections", { cache: "no-store" });
    if (r.ok) setConns((await r.json()).connections);
  }

  async function save(provider: string) {
    if (!secret.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, secret }),
    });
    setBusy(false);
    if (r.ok) {
      setEditing(null);
      setSecret("");
      await refresh();
    } else flex((await r.json().catch(() => ({})))?.error || "Couldn't save that key - check it and try again.");
  }

  async function disconnect(provider: string) {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/connections/${provider}`, { method: "DELETE" });
    setBusy(false);
    await refresh();
  }

  return (
    <div className="mt-7 overflow-hidden rounded-xl border border-line">
      {conns.map((c, i) => (
        <div
          key={c.id}
          className={`flex flex-col gap-3 bg-surface-1 px-5 py-4 ${i ? "border-t border-line" : ""}`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.label}</span>
                {c.required ? (
                  <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                    required
                  </span>
                ) : (
                  <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                    optional
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-ink-dim">{c.role}</div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge connected={c.connected} source={c.source} verified={c.verified} />
              {canEdit && (
                <button
                  onClick={() => {
                    setEditing(editing === c.id ? null : c.id);
                    setSecret("");
                  }}
                  className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-dim hover:border-line-strong hover:text-ink"
                >
                  {editing === c.id ? "Cancel" : c.connected ? "Update" : "Connect"}
                </button>
              )}
              {canEdit && c.connected && (
                <button
                  onClick={() => disconnect(c.id)}
                  className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-alert/80 hover:text-alert"
                >
                  Disconnect
                </button>
              )}
              {/* Members can't edit connections - so a not-connected required tool isn't a dead row: tell them who can. */}
              {!canEdit && !c.connected && c.required && (
                <span className="text-[11px] font-medium text-[#fbbf24]">⚠ Ask a workspace admin to connect this</span>
              )}
            </div>
          </div>

          {editing === c.id && canEdit && (
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoFocus
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={`Paste ${c.label} API key`}
                className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
              <button
                onClick={() => save(c.id)}
                disabled={busy || !secret.trim()}
                className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ connected, source, verified }: { connected: boolean; source: string | null; verified: boolean | null }) {
  if (!connected) {
    return <span className="text-xs text-ink-faint">Not connected</span>;
  }
  if (source === "vault" && verified === false) {
    return <span className="text-xs text-alert">Key error, re-enter</span>;
  }
  // Uniform look for vault + env: every connected tool reads the same.
  return (
    <span className="flex items-center gap-1.5 text-xs text-ready">
      <span className="h-1.5 w-1.5 rounded-full bg-ready" />
      {verified ? "Connected · verified" : "Connected"}
    </span>
  );
}
