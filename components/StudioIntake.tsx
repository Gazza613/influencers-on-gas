"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
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
type BrandKit = { colors: Record<string, string>; fonts: { family: string; url: string }[]; logos: { variant: string; url: string }[]; compliance_text?: string | null } | null;

// LOCKED CANVASES, read off Gary's real exports and confirmed by him - NOT the sizes in the build spec,
// which said all five funnel statics were 1:1. They are not. The reference always wins over the spec.
const FUNNEL_PLACEMENTS = [
  { key: "funnel_banner", label: "Masthead", w: 1080, h: 811, hint: "the banner at the top of the funnel" },
  { key: "funnel_section1", label: "Section 1 hero", w: 1239, h: 1080, hint: "the first hero image" },
  { key: "funnel_section2", label: "Section 2 heroes", w: 1080, h: 1080, hint: "the 3 slider heroes" },
];

export default function StudioIntake({ initialClients }: { initialClients: Client[] }) {
  const [clients] = useState<Client[]>(initialClients);
  const [clientId, setClientId] = useState<string>(initialClients[0]?.id || "");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [brandKit, setBrandKit] = useState<BrandKit>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [compliance, setCompliance] = useState("");
  const [savedCompliance, setSavedCompliance] = useState(false);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    const d = await fetch(`/api/studio?clientId=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d) {
      setTemplates(d.templates || []); setAssets(d.assets || []); setBrandKit(d.brandKit || null);
      setCompliance(String(d.brandKit?.compliance_text || ""));
    }
  }, []);

  async function saveCompliance() {
    if (!clientId) return;
    setBusy("compliance");
    const r = await fetch("/api/studio/brand-kit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, compliance_text: compliance }),
    }).then((x) => x.json()).catch(() => null);
    setBusy("");
    if (r?.ok) { setSavedCompliance(true); await refresh(clientId); }
    else flex(r?.error || "Couldn't save the compliance line.");
  }

  useEffect(() => { refresh(clientId); }, [clientId, refresh]);

  // DIRECT-TO-STORAGE. A Vercel function's request body is capped at ~4.5MB, so posting a
  // full-resolution design export THROUGH our API failed before our code even ran (fonts and logos are
  // small, which is why only the masthead broke). The browser now uploads straight to Blob and we
  // register the finished file afterwards - so file size stops being a limit, and the server still reads
  // the real pixel dimensions off the bytes.
  async function send(files: FileList | null, kind: string, placement = "", variant = "") {
    if (!files?.length || !clientId) return;
    setBusy(kind);
    const list = Array.from(files);
    let done = 0;
    const failed: string[] = [];

    for (const f of list) {
      setProgress(`${f.name} (${done + 1}/${list.length})`);
      try {
        const blob = await upload(`studio/${kind}/${f.name}`, f, {
          access: "public",
          handleUploadUrl: "/api/studio/blob-upload",
        });
        const r = await fetch("/api/studio/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, kind, block: "funnel", placement, variant, url: blob.url, name: f.name, bytes: f.size }),
        }).then((x) => x.json()).catch(() => null);
        if (!r?.ok) failed.push(`${f.name}: ${r?.error || "could not register"}`);
      } catch (e) {
        failed.push(`${f.name}: ${String((e as Error)?.message || e).slice(0, 90)}`);
      }
      done++;
    }

    setBusy(""); setProgress("");
    if (failed.length) flex(failed[0]);
    else if (list.length) flex(`Uploaded ${list.length} file${list.length === 1 ? "" : "s"}.`);
    await refresh(clientId);
  }

  // Mark the ONE current, approved version of a layout. It becomes the design contract: the file the coded
  // template must be pixel-equivalent to at lock time. Approving one stands the others down.
  async function approveRef(templateId: string, approve: boolean) {
    const r = await fetch("/api/studio/approve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, templateId, approve }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { flex(r?.error || "Couldn't set the approved design."); return; }
    await refresh(clientId);
  }

  // READ THE SET AND DERIVE THE TEMPLATE. The uploads for a placement are CAMPAIGN VARIANTS, not drafts of
  // one design - so what is constant across them IS the locked design, and what changes between them IS the
  // slot list. The system works that out from the files rather than asking the team to describe it.
  async function analyse(placement: string) {
    setBusy(`analyse-${placement}`);
    const r = await fetch("/api/studio/analyse", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, placement }),
    }).then((x) => x.json()).catch(() => null);
    setBusy("");
    if (!r?.ok) { flex(r?.error || "Couldn't read that set."); return; }
    flex(`Read ${r.analysed} creatives and derived the template.`);
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

  // 48 font files listed one per line is a wall. Group them by FAMILY (the bit before the weight suffix,
  // e.g. MTNBrighterSans-BoldItalic -> MTNBrighterSans) and show the weight count, so you can see at a
  // glance that we hold the whole family rather than scrolling a list.
  const fontFamilies = Object.entries(
    fonts.reduce<Record<string, number>>((acc, f) => {
      const family = String(f.family || "").split("-")[0] || "Unknown";
      acc[family] = (acc[family] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-6 space-y-6">
      {/* CLIENT */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Client</div>
        {progress && <p className="mt-2 text-[12px] text-[#93c5fd]">Uploading {progress}…</p>}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Brand kit</div>
          {/* A standing receipt of what we hold, so you never have to wonder whether an upload landed. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`tabular rounded-full border px-2.5 py-1 text-[11px] font-bold ${fonts.length ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" : "border-[#f87171]/40 bg-[#f87171]/10 text-[#fca5a5]"}`}>
              {fonts.length} font{fonts.length === 1 ? "" : "s"}
            </span>
            <span className={`tabular rounded-full border px-2.5 py-1 text-[11px] font-bold ${logos.length ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" : "border-line text-ink-faint"}`}>
              {logos.length} logo{logos.length === 1 ? "" : "s"}
            </span>
            <span className={`tabular rounded-full border px-2.5 py-1 text-[11px] font-bold ${assets.filter((a) => a.kind === "deal_card").length ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" : "border-line text-ink-faint"}`}>
              {assets.filter((a) => a.kind === "deal_card").length} deal card{assets.filter((a) => a.kind === "deal_card").length === 1 ? "" : "s"}
            </span>
            <span className={`tabular rounded-full border px-2.5 py-1 text-[11px] font-bold ${templates.length ? "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#86efac]" : "border-line text-ink-faint"}`}>
              {templates.length} reference{templates.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

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
                onChange={(e) => send(e.target.files, "font")} />
            </label>
            {fontFamilies.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fontFamilies.map(([family, count]) => (
                  <li key={family} className="tabular text-[11px] text-[#86efac]">
                    ✓ {family} <span className="text-ink-faint">· {count} weight{count === 1 ? "" : "s"}</span>
                  </li>
                ))}
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
                onChange={(e) => send(e.target.files, "logo")} />
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
          Many versions of a layout pile up over time. Mark the ONE that is current and approved with ★ - that
          file becomes the design contract, the thing the coded template must match pixel for pixel at lock
          time. Recreating a stale version would bake a dead design into the contract, so it&apos;s your call,
          never a guess at whichever file is newest.
        </p>

        <div className="mt-4 space-y-3">
          {FUNNEL_PLACEMENTS.map((p) => {
            const got = refsFor(p.key);
            const approved = got.filter((t) => t.status === "locked").length;
            return (
              <div key={p.key} className="rounded-lg border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">
                      {p.label}
                      <span className="tabular ml-2 text-[11px] font-normal text-[#93c5fd]">{p.w}×{p.h} locked</span>
                      {approved > 0 && <span className="ml-2 text-[11px] font-bold text-[#86efac]">★ approved</span>}
                    </p>
                    <p className="text-[12px] text-ink-faint">{p.hint} · {got.length} uploaded</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {got.length > 1 && (
                      <button
                        onClick={() => analyse(p.key)}
                        disabled={!!busy}
                        title="Read every creative in this set and work out the locked design vs the editable slots"
                        className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-bold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-40"
                      >{busy === `analyse-${p.key}` ? "✨ Reading the set…" : "✨ Read the set"}</button>
                    )}
                  <label className="cursor-pointer rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10">
                    {busy === "reference" ? "Uploading…" : got.length ? "＋ Add more" : "＋ Upload"}
                    <input type="file" multiple accept="image/png,image/jpeg" className="hidden"
                      onChange={(e) => send(e.target.files, "reference", p.key)} />
                  </label>
                  </div>
                </div>
                {got.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {got.map((t) => {
                      const isApproved = t.status === "locked";
                      const wrongSize = t.width !== p.w || t.height !== p.h;
                      return (
                        <div key={t.id} className={`w-[132px] rounded-md p-1 ${isApproved ? "bg-[#4ade80]/10 ring-2 ring-[#4ade80]/60" : ""}`}>
                          {t.reference_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.reference_url} alt={t.name} className="w-full rounded-md border border-line bg-surface-1 object-contain" style={{ aspectRatio: `${p.w}/${p.h}` }} />
                          )}
                          <p className="tabular mt-1 truncate text-[10px] text-ink-dim" title={t.name}>{t.name}</p>
                          {/* A file that isn't on the locked canvas can't be the contract - say so plainly. */}
                          <p className={`tabular text-[10px] ${wrongSize ? "font-bold text-[#fca5a5]" : "text-ink-faint"}`}>
                            {t.width}×{t.height}{wrongSize ? " ⚠ off-canvas" : ""}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <button
                              onClick={() => approveRef(t.id, !isApproved)}
                              disabled={wrongSize && !isApproved}
                              title={wrongSize ? `This isn't ${p.w}×${p.h}, so it can't be the design contract.` : isApproved ? "Approved - this is the design contract" : "Make this the approved design"}
                              className={`text-[10px] font-bold disabled:opacity-30 ${isApproved ? "text-[#86efac]" : "text-[#93c5fd] hover:underline"}`}
                            >{isApproved ? "★ approved" : "☆ approve"}</button>
                            <button onClick={() => remove("template", t.id)} className="text-[10px] text-alert hover:underline">remove</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CLIENT COMPLIANCE LINE. Stored once at client level and reproduced VERBATIM on any creative that
          needs it. It is deliberately NOT given to the copy engine to rewrite: a financial-services
          disclosure that gets paraphrased is a compliance breach, so this text is a fixed block. */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Compliance line</div>
          {savedCompliance && <span className="tabular text-[11px] text-[#86efac]">saved ✓</span>}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          Paste the client&apos;s compliance sentence here (for example: <span className="text-ink-faint">Ts&amp;Cs Apply · Queries? 083135 · MTN JR AUTH FSP 46094</span>).
          It gets reproduced word for word on any creative that needs it. The copy engine can never rewrite
          or shorten it, so the disclosure stays intact on every asset.
        </p>
        <textarea
          value={compliance}
          onChange={(e) => { setCompliance(e.target.value); setSavedCompliance(false); }}
          rows={3}
          placeholder="Copy the compliance sentence here…"
          className="mt-3 w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none focus:border-[#60a5fa]"
        />
        <button
          onClick={saveCompliance}
          disabled={busy === "compliance" || !clientId}
          className="mt-2 rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10 disabled:opacity-40"
        >{busy === "compliance" ? "Saving…" : "Save compliance line"}</button>
      </div>

      {/* DEAL CARDS (the client's name for them; spec 5b calls them callouts). A designed deal card arrives
          as a flat image, and text baked into an image cannot be reliably edited by any system. So it is
          converted ONCE into a pixel-matched component with the offer text as an editable slot: after that
          the team changes the offer forever with zero design work, and the design stays locked to this
          reference. Deal cards serve the funnel AND the social sets. */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">Deal cards</div>
          <span className="tabular text-[11px] text-ink-faint">{assets.filter((a) => a.kind === "deal_card").length} uploaded</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          Your deal card designs. Upload each one and I recreate it as a pixel-matched component with the
          offer text as an editable slot, so the team can change &quot;R50 cashback&quot; to anything without a
          designer touching it, and the card still looks exactly like this reference. They&apos;re shared across
          the funnel and the social sets.
        </p>
        <label className="mt-3 inline-block cursor-pointer rounded-lg border border-[#60a5fa]/40 px-3 py-1.5 text-xs font-bold text-[#93c5fd] hover:bg-[#60a5fa]/10">
          {busy === "deal_card" ? "Uploading…" : "＋ Add deal cards"}
          <input type="file" multiple accept="image/png,image/jpeg,image/svg+xml" className="hidden"
            onChange={(e) => send(e.target.files, "deal_card")} />
        </label>
        {assets.filter((a) => a.kind === "deal_card").length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {assets.filter((a) => a.kind === "deal_card").map((a) => (
              <div key={a.id} className="w-[150px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name ?? "deal card"} className="w-full rounded-md border border-line bg-surface-2 object-contain p-2" />
                <p className="tabular mt-1 truncate text-[10px] text-ink-dim" title={a.name ?? ""}>{a.name}</p>
                <p className="tabular text-[10px] text-ink-faint">{a.meta?.width}×{a.meta?.height}</p>
                <button onClick={() => remove("asset", a.id)} className="mt-0.5 text-[10px] text-alert hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CI DOCUMENT */}
      <div className="rounded-xl border border-line bg-surface-1 p-5">
        <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">CI document</div>
        <p className="mt-2 text-[13px] text-ink-dim">The client&apos;s corporate identity guide. Kept attached to the templates as part of the design contract.</p>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink-dim hover:text-ink">
          {busy === "ci_doc" ? "Uploading…" : "＋ Add CI document"}
          <input type="file" multiple accept=".pdf,image/png,image/jpeg" className="hidden"
            onChange={(e) => send(e.target.files, "ci_doc")} />
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
