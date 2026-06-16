"use client";

import { useState } from "react";

// POPIA/GDPR consent gate (compliance.md). Blocks until express, recorded consent
// is captured. Checkboxes are discrete, affirmative, and NOT pre-ticked.
const AFFIRMATIONS = [
  "I confirm I have the right to use this person's image / voice.",
  "I consent to creating an AI likeness / voice clone from this material.",
  "I understand the purpose: producing marketing video content.",
  "I understand consent can be withdrawn and the data deleted at any time.",
];

export default function ConsentGate({
  dataType,
  onConfirm,
  onCancel,
}: {
  dataType: "image" | "voice";
  onConfirm: (consentId: string) => void;
  onCancel: () => void;
}) {
  const [subjectName, setSubjectName] = useState("");
  const [checks, setChecks] = useState<boolean[]>(AFFIRMATIONS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allTicked = checks.every(Boolean);
  const ready = subjectName.trim().length > 0 && allTicked && !busy;

  async function confirm() {
    if (!ready) return;
    setBusy(true);
    setError("");
    const r = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectName: subjectName.trim(), dataType, affirmed: true }),
    });
    setBusy(false);
    if (r.ok) onConfirm((await r.json()).id);
    else setError((await r.json().catch(() => ({})))?.error || "Could not record consent.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface-1 p-6">
        <h2 className="text-lg font-bold">Consent required</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Before uploading a real person&apos;s {dataType}, capture their express consent
          (POPIA / GDPR). This is recorded with a timestamp.
        </p>

        <label className="mt-5 block text-xs font-semibold text-ink-dim">Whose {dataType} is this?</label>
        <input
          autoFocus
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="Subject's full name"
          className="mt-1.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />

        <div className="mt-4 space-y-2.5">
          {AFFIRMATIONS.map((a, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="text-ink-dim">{a}</span>
            </label>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim hover:text-ink">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!ready}
            className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {busy ? "Recording…" : "Record consent & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
