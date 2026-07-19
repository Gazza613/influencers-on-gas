"use client";

import { useEffect, useState } from "react";
import { askConfirm } from "@/lib/confirm";

type User = { id: string; email: string; name: string | null; role: string; status: string; created_at: string; suspended_at?: string | null };
type Member = { email: string; name: string | null; logins: number; failed: number; lastLogin: string | null; jobs: number; cents: number; desks: { desk: string; jobs: number }[]; neverSignedIn: boolean };
type Activity = { from: string; to: string; members: Member[]; totals: { logins: number; jobs: number; cents: number; activeMembers: number; teamSize: number } };
const rand = (c: number) => "R" + (c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// There is exactly ONE admin (Gary), and it comes from the environment, not from this table. The old "admin"
// role was cosmetic - assigned here, never checked anywhere - so it told people they had powers they did not
// have. Kept in the map only so any existing row still renders honestly.
const ROLE_LABEL: Record<string, string> = { super_admin: "Admin (you)", admin: "Member", producer: "Member" };

export default function TeamManager() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("producer");
  const [act, setAct] = useState<Activity | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    const d = await fetch("/api/users").then((r) => r.json()).catch(() => null);
    if (d?.users) setUsers(d.users);
  }
  useEffect(() => { load(); loadActivity(7); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
    else setMsg({ kind: "ok", text: `User added. Email not configured - share this link: ${d.link}` });
    setEmail(""); setName(""); load();
  }

  // SUSPEND is the everyday action; REMOVE is permanent. Both now bite on the person's next request, because
  // the auth gate re-checks account status rather than trusting a token that can be up to 8 hours old.
  async function setStatus(u: User, action: "suspend" | "reactivate") {
    if (action === "suspend" && !(await askConfirm({
      title: `Suspend ${u.name || u.email}?`,
      body: "They are signed out on their next click and cannot sign back in. Their account and history are kept, and you can reactivate them at any time.",
      tone: "danger", confirmLabel: "Suspend",
    }))) return;
    const r = await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) load();
    else setMsg({ kind: "err", text: d?.error || "Could not change that account" });
  }

  async function loadActivity(d: number) {
    setDays(d);
    const r = await fetch(`/api/team-activity?days=${d}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.members) setAct(r);
  }

  async function remove(u: User) {
    if (!(await askConfirm({
      title: `Permanently remove ${u.name || u.email}?`,
      body: "Their account is deleted and cannot be restored - you would have to invite them again from scratch. To take access away temporarily, use Suspend instead.",
      tone: "danger", confirmLabel: "Remove permanently",
    }))) return;
    const r = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) load();
    else setMsg({ kind: "err", text: d?.error || "Could not remove that account" });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold">Team</h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink-dim">Invite teammates and manage access. Gated to <span className="text-ink-dim">@gasmarketing.co.za</span> emails for now. Everyone can see Cost Control; only a super admin can invite, suspend or remove members. Suspending or removing takes effect on their very next click, not when their session expires.</p>

      {/* Invite */}
      <div className="glow-accent mt-5 rounded-xl bg-surface-1 p-4">
        <div className="tabular text-sm uppercase tracking-[0.2em] brand-grad font-semibold">Invite a teammate</div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email"
            className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink outline-none focus:border-[#a855f7]" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
            className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink outline-none focus:border-[#a855f7]" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-lg text-ink outline-none">
            <option value="producer">Member</option>
          </select>
          <button onClick={invite} disabled={busy || !email.trim()} className="btn-brand rounded-lg px-5 py-2.5 text-lg font-bold disabled:opacity-50">
            {busy ? "Sending…" : "Send invite →"}
          </button>
        </div>
        {msg && <p className={`mt-3 break-all text-base ${msg.kind === "ok" ? "text-ready" : "text-alert"}`}>{msg.text}</p>}
      </div>

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface-1">
        {users === null ? (
          <div className="px-4 py-7 text-center text-base text-ink-faint">Loading team…</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-7 text-center text-base text-ink-faint">No teammates yet. Invite your first above.</div>
        ) : (
          <table className="w-full text-base">
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3.5">
                    <div className="text-lg font-semibold text-ink">{u.name || u.email}</div>
                    {u.name && <div className="text-[14px] text-ink-faint">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-base text-ink-dim">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-4 py-3.5">
                    <span className={`tabular rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase ${
                      u.status === "active" ? "bg-ready/15 text-ready"
                      : u.status === "suspended" ? "bg-alert/15 text-alert"
                      : "bg-active/15 text-active"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {u.status === "suspended" ? (
                      <button onClick={() => setStatus(u, "reactivate")} className="rounded-md px-2.5 py-1.5 text-[15px] font-semibold text-ready hover:bg-ready/15">Reactivate</button>
                    ) : (
                      <button onClick={() => setStatus(u, "suspend")} className="rounded-md px-2.5 py-1.5 text-[15px] text-ink-faint hover:bg-alert/15 hover:text-alert">Suspend</button>
                    )}
                    <button onClick={() => remove(u)} className="ml-1 rounded-md px-2.5 py-1.5 text-[15px] text-ink-faint hover:bg-alert/15 hover:text-alert">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ADOPTION. Two sources that were already being written and had never been read together: successful
          sign-ins (recorded by the login throttle) and metered jobs (usage_events, which carry the user's
          email). Reports who is USING the studio and which desks - not a surveillance tool, and it makes no
          attempt to time anyone. */}
      {act && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl font-bold text-ink">Team activity</h2>
            <div className="flex items-center gap-1">
              {[7, 30, 90].map((d) => (
                <button key={d} onClick={() => loadActivity(d)}
                  className={`rounded-md px-3 py-1.5 text-[15px] font-semibold transition ${days === d ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"}`}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-lg text-ink-dim">
            {act.from} to {act.to} · <b className="text-ink">{act.totals.activeMembers} of {act.totals.teamSize}</b> signed in ·
            {" "}{act.totals.logins} sign-ins · {act.totals.jobs} jobs · {rand(act.totals.cents)}
          </p>

          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-1">
            <table className="w-full text-base">
              <tbody>
                {act.members.map((m) => (
                  <tr key={m.email} className="border-b border-line last:border-0">
                    <td className="px-4 py-3.5">
                      <div className="text-lg font-semibold text-ink">{m.name || m.email}</div>
                      <div className="text-[14px] text-ink-faint">
                        {m.neverSignedIn
                          ? <span className="text-active">no sign-in in this window</span>
                          : <>last in {m.lastLogin} · {m.logins} sign-in{m.logins === 1 ? "" : "s"}</>}
                        {m.failed > 0 && <span className="text-alert"> · {m.failed} failed</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="tabular text-lg font-bold text-ink">{m.jobs} job{m.jobs === 1 ? "" : "s"}</div>
                      <div className="tabular text-[14px] text-ink-faint">{rand(m.cents)}</div>
                    </td>
                    <td className="hidden px-4 py-3.5 text-right text-[14px] text-ink-dim sm:table-cell">
                      {m.desks.length ? m.desks.slice(0, 2).map((d) => `${d.desk.replace(" on GAS", "")} ${d.jobs}`).join(" · ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[15px] text-ink-faint">
            Studio on GAS only. Media on GAS is a separate product with its own team controls and reporting, so its
            activity cannot appear here.
          </p>
        </section>
      )}
    </div>
  );
}
