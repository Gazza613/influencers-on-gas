"use client";

import { useCallback, useEffect, useState } from "react";
import { flex } from "@/lib/flex";

// TEMPLATE INTAKE. The team's hand-designed reference set comes in here and the system reads what it
// needs off the files - pixel dimensions, format, weight - rather than asking anyone to type them.
// Each reference creates a template DRAFT with the original file attached forever as the design contract.
//
// The funnel set is 5 statics per order: 1 masthead + 1 section-1 hero + 3 section-2 heroes, all 1:1.
// That is 3 unique LAYOUTS (section 2 renders three times), which is what we recreate and lock.

type Client = { id: string; name: string };
type Template = { id: string; name: string; block: string; placement: string; width: number; height: number; status: string; reference_url: string | null };
type Asset = { id: string; kind: string; name: string | null; url: string; meta: { width?: number; height?: number; bytes?: number } };
type BrandKit = { colors: Record<string, string>; fonts: { family: string; url: string }[]; logos: { variant: string; url: string }[] } | null;

const FUNNEL_PLACEMENTS = [
  { key: "funnel_banner", label: "Masthead", hint: "1:1 · the banner at the top of the funnel" },
  { key: "funnel_section1", label: "Section 1 hero", hint: "1:1 · the first hero image" },
  { key: "funnel_section2", label: "Section 2 heroes", hint: "1:1 · the 3 slider heroes (upload all 3)" },
];

export default function StudioIntake({ initialClients }: { initialClients: Client[] }) {
  const [clients] = useState<Client[]>(initialClients);
  const [clientId, setClientId] = useState<string>(initialClients[0]?.id || "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit>(null);
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d) { setTemplates(d.templates || []); setAssets(d.assets || []); setBrandKit(d.brandKit || null); }
  }, []);

  useEffect(() => { refresh(clientId); }, [clientId, refresh]);

  async function upload(files: FileList | null, kind: string, placement = "", variant = "") {
    if (!files?.length || !clientId) return;
    setBusy(kind);
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("kind", kind);
    fd.append("block", "funnel");
    if (placement) fd.append("placement", placement);
    if (variant) fd.append("variant", variant);
    for (const f of Array.from(files)) fd.append("files", f);
    const r = await fetch("/api/studio/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
    setBusy("");
    if (!r?.ok) { flex(r?.error || "Upload failed."); return; }
    const bad = (r.uploaded as { name: string; error?: string }[]).filter((u) => u.error);
    if (bad.length) flex(`${bad.length} file(s) had a problem: ${bad[0].error}`);
    await refresh(clientId);
  }

  async function remove(kind: "asset" | "template", id: string) {
    const q = kind === "template" ? `templateId=${id}` : `assetId=${id}`;
    await fetch(`/api/studio?clientId=${clientId}&${q}`, { method: "DELETE" }).catch(() => {});
    await refresh(clientId);
  }

  const fonts = brandKit?.fonts ?? [];
  const logos = brandKit?.logos ?? [];
  const refsFor = (p: string) => templates.filter((t) => t.placement === p);

  return (
    <div className="mt-6 space-y-6">
      {/* CLIENT */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Client</div>
        {clients.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No clients yet. A client is created in <a href="/setup/brains" className="text-[#93c5fd] underline">Brains</a> - one client record carries the brand, the brain and the Studio templates.
          </p>
        ) : (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}
            className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-[#60a5fa]">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* BRAND KIT - fonts first: without the licensed files, server-rendered text can never match the design. */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Brand kit</div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-bold text-ink">Licensed fonts <span className="text-[#f87171]">*</span></p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
              The real font files we render with (.woff2 / .otf / .ttf). Without these the rendered text
              cannot match the design, and no CSS fixes it. Upload every weight you use.
            </p>
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10">
              {busy === "font" ? "Uploading…" : "＋ Add font files"}
              <input type="file" multiple accept=".woff2,.woff,.otf,.ttf" className="hidden"
                onChange={(e) => upload(e.target.files, "font")} />
            </label>
            {fonts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fonts.map((f, i) => <li key={i} className="tabular text-[11px] text-ink-dim">✓ {f.family}</li>)}
              </ul>
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-ink">Approved logos</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
              The client&apos;s approved marks (transparent PNG, or SVG). Used by both the funnel and the
              social sets, so they live here once.
            </p>
            <label className="mt-2 inline-block cursor-pointer rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10">
              {busy === "logo" ? "Uploading…" : "＋ Add logos"}
              <input type="file" multiple accept="image/png,image/svg+xml,image/jpeg" className="hidden"
                onChange={(e) => upload(e.target.files, "logo")} />
            </label>
            {logos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {logos.map((l, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={l.url} alt={l.variant} className="h-8 rounded border border-line bg-surface-2 object-contain px-2" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* THE FUNNEL REFERENCE SET */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Funnel creatives — the reference set</div>
          <span className="tabular text-[11px] text-ink-faint">{templates.length} ingested</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          Upload the set your team designed by hand. The system reads each file&apos;s real pixel size and
          keeps the original attached forever as the design contract. I then recreate each layout as code
          and we lock it side by side against the reference.
        </p>

        <div className="mt-4 space-y-3">
          {FUNNEL_PLACEMENTS.map((p) => {
            const got = refsFor(p.key);
            return (
              <div key={p.key} className="rounded-lg border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{p.label}</p>
                    <p className="text-[12px] text-ink-faint">{p.hint}</p>
                  </div>
                  <label className="cursor-pointer rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10">
                    {busy === "reference" ? "Uploading…" : got.length ? "＋ Add more" : "＋ Upload"}
                    <input type="file" multiple accept="image/png,image/jpeg" className="hidden"
                      onChange={(e) => upload(e.target.files, "reference", p.key)} />
                  </label>
                </div>
                {got.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {got.map((t) => (
                      <div key={t.id} className="w-[132px]">
                        {t.reference_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.reference_url} alt={t.name} className="aspect-square w-full rounded-md border border-line object-cover" />
                        )}
                        <p className="tabular mt-1 truncate text-[10px] text-ink-dim" title={t.name}>{t.name}</p>
                        <p className="tabular text-[10px] text-ink-faint">{t.width}×{t.height}</p>
                        <button onClick={() => remove("template", t.id)} className="mt-0.5 text-[10px] text-alert hover:underline">Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CI DOCUMENT */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">CI document</div>
        <p className="mt-2 text-[13px] text-ink-dim">The client&apos;s corporate identity guide. Kept attached to the templates as part of the design contract.</p>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink-dim hover:text-ink">
          {busy === "ci_doc" ? "Uploading…" : "＋ Add CI document"}
          <input type="file" multiple accept=".pdf,image/png,image/jpeg" className="hidden"
            onChange={(e) => upload(e.target.files, "ci_doc")} />
        </label>
        <ul className="mt-2 space-y-1">
          {assets.filter((a) => a.kind === "ci_doc").map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[11px] text-ink-dim">
              <a href={a.url} target="_blank" rel="noreferrer" className="underline">{a.name}</a>
              <button onClick={() => remove("asset", a.id)} className="text-alert hover:underline">remove</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
