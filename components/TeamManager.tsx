"use client";

import { useEffect, useState } from "react";

type User = { id: string; email: string; name: string | null; role: string; status: string; created_at: string };

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", producer: "Member" };

export default function TeamManager() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("producer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const d = await fetch("/api/users").then((r) => r.json()).catch(() => null);
    if (d?.users) setUsers(d.users);
  }
  useEffect(() => { load(); }, []);

  async function invite() {
    if (!email.trim() || busy) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ kind: "err", text: d?.error || "Could not send invite" }); return; }
    if (d.emailed) setMsg({ kind: "ok", text: `Invite emailed to ${email.trim()}.` });
    else setMsg({ kind: "ok", text: `User added. Email not configured — share this link: ${d.link}` });
    setEmail(""); setName(""); load();
  }

  async function remove(u: User) {
    if (!confirm(`Remove ${u.name || u.email}? They will lose access immediately.`)) return;
    const r = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Team</h1>
      <p className="mt-1 text-sm text-ink-dim">Invite teammates and manage access. Everyone can see Cost Control; only a super admin can invite or remove members.</p>

      {/* Invite */}
      <div className="glow-accent mt-5 rounded-xl bg-surface-1 p-4">
        <div className="tabular text-[10px] uppercase tracking-[0.25em] brand-grad font-semibold">Invite a teammate</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-[#a855f7]" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-[#a855f7]" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none">
            <option value="producer">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={invite} disabled={busy || !email.trim()} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
            {busy ? "Sending…" : "Send invite →"}
          </button>
        </div>
        {msg && <p className={`mt-2 break-all text-xs ${msg.kind === "ok" ? "text-ready" : "text-alert"}`}>{msg.text}</p>}
      </div>

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface-1">
        {users === null ? (
          <div className="px-4 py-6 text-center text-xs text-ink-faint">Loading team…</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-ink-faint">No teammates yet. Invite your first above.</div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{u.name || u.email}</div>
                    {u.name && <div className="text-[11px] text-ink-faint">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-dim">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span className={`tabular rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${u.status === "active" ? "bg-ready/15 text-ready" : "bg-active/15 text-active"}`}>
                      {u.status === "active" ? "active" : "invited"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(u)} className="rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-alert/15 hover:text-alert">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
