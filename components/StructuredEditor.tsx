"use client";

// A generic, recursive editor for a proposal SECTION's structured content (Gary: edit the actual text by hand). It
// walks the section object and renders an editable control for every leaf: a textarea for each string (including
// strings inside arrays and nested objects), a checkbox for booleans, a number field for numbers. The structure is
// preserved exactly, so saving reconstructs the same shape with the human's edits. Used for the "Edit text" mode
// alongside the prompt-based "Refine and rewrite".

function humanize(label: string | number | null): string {
  if (label == null) return "";
  return String(label).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function FieldNode({ label, value, onChange }: { label: string | number | null; value: unknown; onChange: (v: unknown) => void }) {
  if (typeof value === "string") {
    return (
      <label className="block">
        {label != null && <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{humanize(label)}</span>}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={value.length > 90 ? 3 : 1}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-surface-1 px-3 py-2 text-base text-ink focus:border-accent focus:outline-none" />
      </label>
    );
  }
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-base text-ink-dim">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
        {humanize(label)}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <label className="block">
        {label != null && <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">{humanize(label)}</span>}
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
          className="mt-1 w-40 rounded-lg border border-line bg-surface-1 px-3 py-2 text-base text-ink focus:border-accent focus:outline-none" />
      </label>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {label != null && <div className="text-[13px] font-bold uppercase tracking-wide text-accent">{humanize(label)}</div>}
        {value.map((item, i) => (
          <div key={i} className="rounded-lg border border-line/70 bg-surface-2 p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{humanize(label)} {i + 1}</div>
            <FieldNode label={null} value={item} onChange={(nv) => { const c = [...value]; c[i] = nv; onChange(c); }} />
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="space-y-3">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <FieldNode key={k} label={k} value={v} onChange={(nv) => onChange({ ...(value as Record<string, unknown>), [k]: nv })} />
        ))}
      </div>
    );
  }
  return null;
}

export default function StructuredEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-4 rounded-lg border border-accent/30 bg-surface-2 p-4">
      {Object.entries(value).map(([k, v]) => (
        <FieldNode key={k} label={k} value={v} onChange={(nv) => onChange({ ...value, [k]: nv })} />
      ))}
    </div>
  );
}
