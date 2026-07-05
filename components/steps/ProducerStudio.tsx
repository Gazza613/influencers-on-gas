"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Uploader from "@/components/Uploader";
import Lightbox from "@/components/Lightbox";
import Celebration from "@/components/Celebration";
import VoicePicker from "@/components/VoicePicker";
import VoiceoverUpload from "@/components/VoiceoverUpload";
import { flex } from "@/lib/flex";

type Scene = {
  beat: string; role: "a-roll" | "b-roll" | "graphic"; start: string; end: string; location: string;
  talent: string[]; shot: string; blocking: string; performance: string; graphics: string[];
  vo_line: string; caption: string; motion_prompt: string; music_sfx: string; transition: string;
  vo_audio_url?: string; phone_screen_url?: string; hero?: string; ref_url?: string; live_bg?: string;
};
type Storyboard = { title: string; format: string; duration_seconds: number; tone: string; music_bed: string; full_vo: string; legal: string; scenes: Scene[] };
type Shot = { scene: number; role: string; beat: string; url: string | null; error?: string | null; reshooting?: boolean };
type Clip = { scene: number; role: string; beat: string; kind: string; url: string | null; status: string; error?: string | null; audio_url?: string | null; synced?: boolean; draft?: boolean };
type SceneCallout = { on?: boolean; kick?: string; line?: string; num?: string; suffix?: string; accent?: string; hold?: number };
type Production = { brief?: Record<string, unknown>; storyboard?: Storyboard; status?: string; shots?: Shot[]; shots_status?: string; clips?: Clip[]; clips_status?: string; final_url?: string | null; assembly_status?: string; assembly_error?: string | null; showreel_status?: string; music_url?: string | null; ambient_url?: string | null; audio_status?: string; audio_error?: string | null; wizard_approved?: string[]; dropped_scenes?: number[]; scene_callouts?: Record<string, SceneCallout> } | null;

const ROLE = {
  "a-roll": { label: "A-ROLL · presenter", cls: "bg-[#a855f7]/15 text-[#c79bff] border-[#a855f7]/30" },
  "b-roll": { label: "B-ROLL · scene", cls: "bg-[#60a5fa]/15 text-[#93c5fd] border-[#60a5fa]/30" },
  graphic: { label: "GRAPHIC", cls: "bg-active/15 text-active border-active/30" },
} as const;

type CreativeGuide = { url: string; role: string; ratio: string; scene: string; resolution: string };
export default function ProducerStudio({ influencerId, name, initialProduction, initialVoiceId = "", initialVoiceName = "", creatives = [], arollRef = "", brollRef = "", voiceModel: initialVoiceModel = "v2", mode = "all" }: { influencerId: string; name: string; initialProduction: Production; initialVoiceId?: string; initialVoiceName?: string; creatives?: CreativeGuide[]; arollRef?: string; brollRef?: string; voiceModel?: "v2" | "v3"; mode?: "all" | "foundation" | "studio" }) {
  // STAGE SPLIT: "foundation" = Script & Voice stage (brief -> storyboard -> voice); "studio" = The Final Cut
  // stage (shoot -> animate -> music -> stitch -> showreel). "all" = the legacy single page (unchanged).
  const isFoundation = mode !== "studio"; // show brief + concept + voice
  const isStudio = mode !== "foundation"; // show scene keyframes/animate + audio + stitch + showreel
  const showStep = (k: string) => (k === "concept" || k === "voice") ? isFoundation : isStudio;
  // Display step numbers restart at 1 within each stage (Studio's "Scenes" is step 1, not step 3).
  const VISIBLE_STEPS = (["concept", "voice", "scenes", "audio", "stitch", "showreel"] as const).filter(showStep);
  const stepNum = (k: string) => (VISIBLE_STEPS as readonly string[]).indexOf(k) + 1;
  const [production, setProduction] = useState<Production>(initialProduction);
  // Guide = a creative (made in the Creative section) the shoot anchors to (wardrobe/look/world). Persisted as aroll_ref_url/broll_ref_url.
  const [arollGuide, setArollGuide] = useState(arollRef);
  const [brollGuide, setBrollGuide] = useState(brollRef);
  // Wardrobe lock: the outfit read from the chosen guide, shown back so the producer SEES the selection took.
  const [wardrobeLock, setWardrobeLock] = useState(String((initialProduction as { wardrobe_lock?: string })?.wardrobe_lock || ""));
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState("");
  // The in-flight guide save (ref PATCH + wardrobe-lock read). A shoot MUST await this before it fires, else
  // the shoot reads a stale persona (no guide, no lock) and every scene drifts - the exact "it appears not to
  // submit before I run the scenes" bug. awaitGuideSave() (below) blocks each shoot on it.
  const guideSaveRef = useRef<Promise<void> | null>(null);
  async function awaitGuideSave() { if (guideSaveRef.current) { try { await guideSaveRef.current; } catch { /* proceed even if the lock read failed */ } } }
  async function setGuide(role: "a-roll" | "b-roll", url: string) {
    let done: () => void = () => {};
    guideSaveRef.current = new Promise<void>((res) => { done = res; });
    try {
      const next = (role === "a-roll" ? arollGuide : brollGuide) === url ? "" : url; // tap again to clear
      if (role === "a-roll") setArollGuide(next); else setBrollGuide(next);
      // AUTO-POPULATE the brief from the chosen creative's own description, so you don't re-type the world
      // that's already baked into the creative. Only fills empty fields - never clobbers what you typed.
      if (next) {
        const c = creatives.find((x) => x.url === next);
        if (c?.scene?.trim()) {
          if (!setting.trim()) { setSetting(c.scene.trim()); setAutoFilled(true); }
        }
      }
      await fetch(`/api/influencers/${influencerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: role === "a-roll" ? { aroll_ref_url: next } : { broll_ref_url: next } }) }).catch(() => {});
      // Read the outfit from the chosen guide RIGHT NOW and lock it in - so you SEE it registered (and the
      // shoot threads this exact outfit into every scene). Clearing the guide clears the lock.
      setLockErr("");
      if (!next) { setWardrobeLock(""); await fetch(`/api/influencers/${influencerId}/wardrobe-lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "" }) }).catch(() => {}); return; }
      setLockBusy(true);
      try {
        const r = await fetch(`/api/influencers/${influencerId}/wardrobe-lock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: next }) });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.wardrobe) setWardrobeLock(d.wardrobe); else setLockErr(d.error || "Could not lock the wardrobe - try another guide.");
      } catch { setLockErr("Could not lock the wardrobe - check your connection."); }
      setLockBusy(false);
    } finally { done(); }
  }
  const [autoFilled, setAutoFilled] = useState(false); // brief setting was auto-filled from a creative
  const [voiceId, setVoiceId] = useState(initialVoiceId);
  const [voiceName, setVoiceName] = useState(initialVoiceName);
  const [voicePreview, setVoicePreview] = useState("");
  // The full voiceover (one continuous take) the producer generates + listens to before animating.
  const [voiceoverUrl, setVoiceoverUrl] = useState<string>(String((initialProduction as { voiceover_url?: string })?.voiceover_url || ""));
  const [voBusy, setVoBusy] = useState(false);
  // v2 (Stable, WYSIWYG) vs v3 (Expressive, more realistic) ElevenLabs model - persisted on the influencer.
  const [voiceModel, setVoiceModelState] = useState<"v2" | "v3">(initialVoiceModel);
  async function setVoiceModel(m: "v2" | "v3") {
    setVoiceModelState(m); setVoiceoverUrl(""); // model changed → re-generate to hear the new delivery
    await fetch(`/api/influencers/${influencerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: { voice_model: m } }) }).catch(() => {});
  }
  // Voice SPEED (0.7–1.2, 1 = default). Faster often reads more natural; persisted + clears the take to re-gen.
  const [voiceSpeed, setVoiceSpeedState] = useState<number>(Number((initialProduction as { voice_speed?: number })?.voice_speed) || Number((initialProduction as { brief?: { voice_speed?: number } })?.brief?.voice_speed) || 1);
  async function setVoiceSpeed(s: number) {
    setVoiceSpeedState(s); setVoiceoverUrl(""); // speed changed → re-generate to hear it
    await fetch(`/api/influencers/${influencerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaPatch: { voice_speed: s } }) }).catch(() => {});
  }
  // TEST-THE-DELIVERY preview box: pull a scene's copy in, A/B v2 vs v3 (v3 gets expressive + accent tags),
  // hear which holds the accent before committing to the full voiceover.
  const firstVoLine = ((initialProduction?.storyboard?.scenes || []).find((s) => (s.vo_line || "").trim())?.vo_line || "").trim();
  const [previewText, setPreviewText] = useState(firstVoLine);
  const [previewSceneIdx, setPreviewSceneIdx] = useState<number | null>(null); // which scene's copy is loaded (so edits can be saved back to it)
  const [previewSaved, setPreviewSaved] = useState(false);
  const [previewAccent, setPreviewAccent] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState<"" | "v2" | "v3">("");
  const [previewErr, setPreviewErr] = useState("");
  async function runPreview(m: "v2" | "v3") {
    if (!previewText.trim() || previewBusy) return;
    setPreviewBusy(m); setPreviewErr(""); setPreviewUrl("");
    const r = await fetch(`/api/influencers/${influencerId}/voice/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: previewText.trim(), model: m, accent: previewAccent.trim(), speed: voiceSpeed }) }).then((x) => x.json()).catch(() => null);
    if (r?.url) setPreviewUrl(`${r.url}?t=${Date.now()}`); else setPreviewErr(r?.error || "Preview failed - try again.");
    setPreviewBusy("");
  }
  // Save the tested copy back to its scene so it actually SHIPS (the preview box alone is just a scratchpad;
  // the full voiceover reads each scene's line). Persists vo_line + matching caption, updates the board.
  async function savePreviewToScene() {
    if (previewSceneIdx == null || !previewText.trim() || previewSaved) return;
    const i = previewSceneIdx; const line = previewText.trim();
    setPreviewErr("");
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: i, reshoot: false, vo_line: line, caption: line }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.saved) {
      setProduction((p) => (p && p.storyboard ? { ...p, storyboard: { ...p.storyboard, scenes: p.storyboard.scenes.map((s, idx) => (idx === i ? { ...s, vo_line: line, caption: line } : s)) } } : p));
      setPreviewSaved(true);
    } else setPreviewErr(r?.error || "Couldn't save the copy to the scene.");
  }
  async function genVoiceover() {
    if (voBusy) return;
    setVoBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/voiceover`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    setVoBusy(false);
    if (r?.voiceover_url) setVoiceoverUrl(`${r.voiceover_url}?t=${Date.now()}`); // cache-bust; do NOT auto-approve - you listen first, then hit "✓ Accept & continue"
    else setErr(r?.error || "Could not generate the voiceover.");
  }
  const [editing, setEditing] = useState(!initialProduction?.storyboard);
  const [busy, setBusy] = useState(false);
  // Script-first: write + edit the spoken script before building the scenes.
  const [draftScript, setDraftScript] = useState<string>(String((initialProduction?.brief as { script?: string })?.script || ""));
  const [scriptBusy, setScriptBusy] = useState(false);
  const [err, setErr] = useState("");

  const [brand, setBrand] = useState(String((initialProduction?.brief as { brand?: string })?.brand || ""));
  const [offer, setOffer] = useState(String((initialProduction?.brief as { offer?: string })?.offer || ""));
  const [benefits, setBenefits] = useState(String((initialProduction?.brief as { benefits?: string })?.benefits || ""));
  const [briefBusy, setBriefBusy] = useState(false); // AI brief co-pilot in flight
  const [briefOpen, setBriefOpen] = useState(false); // guided-questions panel open
  const [briefAudience, setBriefAudience] = useState("");
  const [briefKeyMsg, setBriefKeyMsg] = useState("");
  const [briefProof, setBriefProof] = useState("");
  const [briefUsedBrain, setBriefUsedBrain] = useState(false);
  const [cta, setCta] = useState(String((initialProduction?.brief as { cta?: string })?.cta || ""));
  const [ctaCode, setCtaCode] = useState(String((initialProduction?.brief as { ctaCode?: string })?.ctaCode || ""));
  const [duration, setDuration] = useState<number>(Number((initialProduction?.brief as { durationSeconds?: number })?.durationSeconds) || 60);
  const [format, setFormat] = useState<"9:16" | "1:1">("9:16");
  const [setting, setSetting] = useState(String((initialProduction?.brief as { setting?: string })?.setting || ""));
  const [tone, setTone] = useState(String((initialProduction?.brief as { tone?: string })?.tone || "warm, confident, effortless"));
  const [logo, setLogo] = useState(String((initialProduction?.brief as { logo?: string })?.logo || ""));
  const [legal, setLegal] = useState(String((initialProduction?.brief as { legal?: string })?.legal || ""));
  const [clothingRef, setClothingRef] = useState<string | null>(String((initialProduction?.brief as { clothingRef?: string })?.clothingRef || "") || null);
  const [locationRef, setLocationRef] = useState<string | null>(String((initialProduction?.brief as { locationRef?: string })?.locationRef || "") || null);
  const [logoUrl, setLogoUrl] = useState<string | null>(String((initialProduction?.brief as { logoUrl?: string })?.logoUrl || "") || null);
  const [promoUrl, setPromoUrl] = useState<string | null>(String((initialProduction?.brief as { promoUrl?: string })?.promoUrl || "") || null);
  const [captions, setCaptions] = useState<boolean>((initialProduction?.brief as { captions?: boolean })?.captions !== false);
  const [endCardUrl, setEndCardUrl] = useState(String((initialProduction?.brief as { endCardUrl?: string })?.endCardUrl || ""));
  const [endCardKind, setEndCardKind] = useState<"image" | "video">((initialProduction?.brief as { endCardKind?: string })?.endCardKind === "image" ? "image" : "video");
  const [endCards, setEndCards] = useState<{ id: string; label: string; url: string; kind: "image" | "video" }[]>([]);
  useEffect(() => { fetch("/api/end-cards").then((r) => r.json()).then((d) => { if (Array.isArray(d?.endCards)) setEndCards(d.endCards); }).catch(() => {}); }, []);

  const sb = production?.storyboard;
  const shots = production?.shots ?? [];
  const shooting = production?.shots_status === "running";
  // WHICH role is being shot - so only that gallery shows the shooting state (a-roll and b-roll are
  // shot step by step, never both at once).
  const [shootingRole, setShootingRole] = useState<"a-roll" | "b-roll" | "">("");
  // EXACT scope of the current shoot so only the scenes truly being shot show a spinner: "all" = a
  // whole-board shoot, an array = just those scene indices (a per-scene re-shoot). Never spin the rest.
  const [shootScope, setShootScope] = useState<number[] | "all">("all");
  // ⚡ Priority (fast paid image queue) is now ALWAYS ON - the keyframe is the foundation of every shot and
  // ~1 credit is negligible on Ultra, so we never sit in the slow free queue. No user toggle.
  const priority = true;
  const shotFor = (i: number) => shots.find((s) => s.scene === i);
  const clips = production?.clips ?? [];
  const rendering = production?.clips_status === "running";
  const clipFor = (i: number) => clips.find((c) => c.scene === i);
  // Draft clips = fast 720p/DoP proxies that still need a full-quality conform before delivery.
  const draftClipCount = clips.filter((c) => c.url && c.status !== "failed" && c.draft).length;
  const shotsReady = shots.some((s) => s.url);
  const needsVoice = !!sb && sb.scenes.some((s) => (s.vo_line || "").trim().length > 0); // a-roll lip-sync AND b-roll VO-over both need the voice
  const voiceMissing = needsVoice && !voiceId;
  const assembling = production?.assembly_status === "running";
  const finalUrl = production?.final_url || null;

  // Dropped (rejected) reference scenes - declared BEFORE the wizard derivations below, which filter
  // on it (a const used before its declaration is a temporal-dead-zone crash at render).
  const [dropped, setDropped] = useState<Set<number>>(() => new Set((initialProduction?.dropped_scenes as number[] | undefined) ?? []));

  // ── 8-step wizard state ───────────────────────────────────────────────────
  const sceneList = sb?.scenes ?? [];
  const aRollIdx = sceneList.map((s, i) => ({ s, i })).filter((x) => x.s.role === "a-roll");
  const bRollIdx = sceneList.map((s, i) => ({ s, i })).filter((x) => x.s.role === "b-roll");
  const clipDone = (idx: number) => clips.some((c) => c.scene === idx && c.url);
  const aRollNone = !!sb && aRollIdx.length === 0;
  const bRollNone = !!sb && bRollIdx.length === 0;
  // Reference galleries: a role's refs are "kept" scenes (not dropped) that role; ready once at least
  // one kept scene of that role has a shot (so there's something to approve) and nothing's shooting.
  const aRollKept = aRollIdx.filter((x) => !dropped.has(x.i));
  const bRollKept = bRollIdx.filter((x) => !dropped.has(x.i));
  // Refs ready once EVERY kept scene of that role has a shot frame (or there's nothing to curate) and
  // nothing's shooting. EVERY (not some) so you can't advance to Animate with a missing keyframe -
  // that was the "Clip failed: no shot frame" trap. Re-shoot or reject the offending scene to proceed.
  const aRollRefsReady = !!sb && (aRollNone || aRollKept.length === 0 || (aRollKept.every((x) => shotFor(x.i)?.url) && !shooting));
  const bRollRefsReady = !!sb && (bRollNone || bRollKept.length === 0 || (bRollKept.every((x) => shotFor(x.i)?.url) && !shooting));
  // Animation steps ready when every KEPT scene of the role has a clip (or nothing to animate).
  const aRollReady = !!sb && (aRollNone || aRollKept.length === 0 || aRollKept.every((x) => clipDone(x.i)));
  const bRollReady = !!sb && (bRollNone || bRollKept.length === 0 || bRollKept.every((x) => clipDone(x.i)));
  const audioBusy = production?.audio_status === "running";
  const audioReady = production?.audio_status === "done" && !!(production?.music_url || production?.ambient_url);
  // Artifact-ready per step (the natural gate). "done" tick shows once approved.
  // A step is "ready" to Accept only when its artifact exists AND nothing is still rendering for it
  // (so you can't approve a board/clip/audio/stitch mid-run, before it has finished).
  // SCENE-BY-SCENE board: a scene is "done" when its (kept) keyframe + clip exist. The Scenes step is
  // ready once EVERY kept scene has a finished clip and nothing's shooting/rendering.
  const keptScenes = sceneList.map((s, i) => ({ s, i })).filter((x) => x.s.role !== "graphic" && !dropped.has(x.i));
  const builtCount = keptScenes.filter((x) => clipDone(x.i)).length;
  const scenesReady = !!sb && keptScenes.length > 0 && builtCount === keptScenes.length && !rendering && !shooting;
  const ready: Record<string, boolean> = {
    concept: !!sb, voice: !!sb && (!needsVoice || (!!voiceId && !!voiceoverUrl)), scenes: scenesReady,
    audio: audioReady, stitch: !!finalUrl && !assembling,
    showreel: production?.showreel_status === "accepted" || production?.showreel_status === "declined",
  };
  const ORDER = ["concept", "voice", "scenes", "audio", "stitch", "showreel"] as const;
  // Seed approvals: any step whose SUCCESSOR already has its artifact is auto-approved (you moved
  // past it); the frontier step waits for an explicit Accept. Recomputed when production changes.
  const seedApproved = () => {
    const set = new Set<string>();
    ORDER.forEach((k, idx) => { const next = ORDER[idx + 1]; if (next && ready[next]) set.add(k); });
    return set;
  };
  // Prefer the SAVED approvals (so returning restores the exact step); else infer from artifacts.
  const [approved, setApproved] = useState<Set<string>>(() => (initialProduction?.wizard_approved?.length ? new Set(initialProduction.wizard_approved) : seedApproved()));
  const [denied, setDenied] = useState<Set<string>>(new Set());
  // Scenes whose visual direction/toggles were changed but NOT yet re-rendered - their clip is stale, so we
  // flag "re-shoot to apply" (kills the "I toggled it and nothing happened" trap). Cleared on re-shoot/animate.
  const [dirtyScenes, setDirtyScenes] = useState<Set<number>>(new Set());
  const markDirty = (i: number) => setDirtyScenes((s) => new Set(s).add(i));
  const clearDirty = (i: number) => setDirtyScenes((s) => { const n = new Set(s); n.delete(i); return n; });
  const [renderingRole, setRenderingRole] = useState<"" | "a-roll" | "b-roll">("");
  // EXACT scope of the current animate so only the scenes truly rendering show a spinner: "all" = a
  // whole-board/role animate, an array = just those scene indices (a per-scene re-animate). Never spin the rest.
  const [clipScope, setClipScope] = useState<number[] | "all">("all");
  // CONCURRENT per-scene animate: which scenes are animating RIGHT NOW (fire one, then fire the next without
  // waiting). wholeBoardBusy = a whole-board Animate-all / role batch is running (blocks per-scene during it).
  const [animatingScenes, setAnimatingScenes] = useState<Set<number>>(new Set());
  const [wholeBoardBusy, setWholeBoardBusy] = useState(false);
  // When each scene's render was first OBSERVED (ms), for the live elapsed timer on the rendering card.
  // Reconciled from the render state below, so it survives a refresh (starts from when we re-observe it).
  const [renderStarts, setRenderStarts] = useState<Record<number, number>>({});
  // DRAFT SPEED: render a-roll clips at 720p (faster) while iterating. A 720p draft STAYS 720p in the final
  // unless "Render final quality" upgrades it, so there are two-click guards on Stitch + Showreel-Accept while
  // draft clips remain (P0-2), to stop an accidental 720p delivery. Default ON for fast iteration.
  const [speedMode, setSpeedMode] = useState(true);
  const [stitchArmed, setStitchArmed] = useState(false); // two-click confirm to stitch a still-draft cut
  const [showreelArmed, setShowreelArmed] = useState(false); // two-click confirm to accept a still-draft cut
  const [resetArmed, setResetArmed] = useState(false); // two-click confirm before "Reset if stuck" kills a job
  // ANY work in flight (incl. per-scene shoots that don't flip the global flags) - drives the busy
  // buttons + the red Reset control so it reflects per-scene + b-roll work too.
  const anyReshooting = (production?.shots ?? []).some((s) => s.reshooting);
  const busyAny = shooting || rendering || !!renderingRole || anyReshooting;
  // Curated reference galleries: keep the dropped set in sync with the server + chosen aspect ratio per role.
  useEffect(() => { setDropped(new Set(production?.dropped_scenes ?? [])); }, [production?.dropped_scenes]);
  // Record when each rendering scene STARTED (for the live elapsed timer). A scene reads as rendering if it's
  // in a per-scene animate, or a whole-board/role run is covering it and it has no good clip yet. Reconciled
  // on every state change: sets a start when rendering begins, clears it when the clip lands or fails. Survives
  // a refresh (re-observes and starts the clock fresh - a slight undercount, but never a false hang).
  useEffect(() => {
    const scenesArr = production?.storyboard?.scenes ?? [];
    const cl = production?.clips ?? [];
    setRenderStarts((prev) => {
      let next = prev; let touched = false;
      const mut = () => { if (next === prev) next = { ...prev }; };
      scenesArr.forEach((sc, i) => {
        const roleStr = String((sc as { role?: string }).role || "a-roll");
        const c = cl.find((x) => x.scene === i);
        const rendering = !dropped.has(i) && (animatingScenes.has(i) || (wholeBoardBusy && (renderingRole === "" || renderingRole === roleStr) && !c?.url && c?.status !== "failed"));
        if (rendering && next[i] == null) { mut(); next[i] = Date.now(); touched = true; }
        else if (!rendering && next[i] != null) { mut(); delete next[i]; touched = true; }
      });
      return touched ? next : prev;
    });
  }, [production, animatingScenes, wholeBoardBusy, renderingRole, dropped]);
  const [arollRatio, setArollRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [brollRatio, setBrollRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [boardRatio, setBoardRatio] = useState<"9:16" | "1:1" | "16:9">("9:16"); // one ratio for the whole scene board
  // Captions are opt-in at stitch (default OFF - they were appearing unrequested). The optional closing
  // clip/image reuses the brief's endCardUrl/endCardKind state so there's one source of truth.
  const [stitchCaptions, setStitchCaptions] = useState<boolean>(false);
  const [stitchCaptionStyle, setStitchCaptionStyle] = useState<string>(String((initialProduction?.brief as { captionStyle?: string })?.captionStyle || "bold"));
  // Offer callouts are now PER-SCENE (production.scene_callouts) - see openCallout/saveCallout below. The old
  // single global callout is gone; the stitch still honours a legacy brief.callout as a fallback only.
  async function toggleDrop(scene: number) {
    setDropped((s) => { const n = new Set(s); n.has(scene) ? n.delete(scene) : n.add(scene); return n; }); // optimistic
    // Confirm from the server so a later render/stitch can't race on a stale dropped list.
    const r = await fetch(`/api/influencers/${influencerId}/production/drop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene }) }).then((x) => x.json()).catch(() => null);
    if (Array.isArray(r?.dropped)) setDropped(new Set(r.dropped.map(Number)));
  }
  function persistApproved(s: Set<string>) {
    fetch(`/api/influencers/${influencerId}/production/approvals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: [...s] }) }).catch(() => {});
  }
  function accept(k: string) { setApproved((s) => { const n = new Set(s).add(k); persistApproved(n); return n; }); setDenied((s) => { const n = new Set(s); n.delete(k); return n; }); }
  function deny(k: string) { setDenied((s) => new Set(s).add(k)); setApproved((s) => { const n = new Set(s); n.delete(k); persistApproved(n); return n; }); }
  // A step's visual state: done (approved), active (artifact ready or all prior approved), else locked.
  function stepState(k: typeof ORDER[number]): "locked" | "active" | "done" {
    if (approved.has(k)) return "done";
    const idx = ORDER.indexOf(k);
    // STRICTLY LINEAR flow: each step opens only once the one before it (in ORDER) is approved -
    // Concept → Voice → A-roll refs → B-roll refs → Animate A → Animate B → Music → Stitch → Showreel.
    // Predictable: you can't skip B-roll refs into Animate, and nothing un-approved jumps the queue.
    const priorOk = idx === 0 || approved.has(ORDER[idx - 1]);
    return priorOk ? "active" : "locked";
  }
  const unlocked = (k: typeof ORDER[number]) => stepState(k) !== "locked";
  // Accept / Not-yet gate for a step. Shows once the step's artifact exists; Accept turns it green
  // and unlocks the next step, Not-yet shows an edit hint and keeps the next step locked.
  function renderGate(k: string, hint: string) {
    // HARD GATE: a step never shows the Accept / Not-yet controls until (a) the step before it is
    // approved (it's unlocked) AND (b) this step's own work actually exists. A locked step shows only
    // its "🔒 Approve the previous step" message - never an approve button that jumps the queue.
    if (stepState(k as typeof ORDER[number]) === "locked") return null;
    if (!ready[k]) return null;
    if (approved.has(k)) return (
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[12px] font-semibold text-ready">✓ Approved
        <button onClick={() => deny(k)} className="ml-1 rounded border border-line px-2 py-0.5 text-[10px] font-medium text-ink-faint hover:text-ink">undo</button>
      </div>
    );
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => accept(k)} className="rounded-lg border border-ready/50 px-3 py-1.5 text-xs font-bold text-ready hover:bg-ready/10">✓ Accept &amp; continue</button>
          <button onClick={() => deny(k)} className="rounded-lg border border-active/40 px-3 py-1.5 text-xs font-bold text-active hover:bg-active/10">✕ Not yet</button>
        </div>
        {denied.has(k) && <p className="mt-2 text-[11px] text-active">{hint}</p>}
      </div>
    );
  }

  const activePolls = useRef<Set<string>>(new Set());
  async function poll(setter: (d: Production) => void, statusKey: "shots_status" | "clips_status" | "assembly_status" | "audio_status") {
    if (activePolls.current.has(statusKey)) return; // already polling this - don't double up
    activePolls.current.add(statusKey);
    try {
      // ~58 min with a gentle back-off: must comfortably OUTLAST the SLOWEST render. b-roll (Higgsfield
      // DoP) can legitimately sit 20-40 min in its queue, so a shorter poll made a healthy render LOOK
      // stuck and pushed you to "Reset if stuck". 6s for the first ~6 min (frames land fast), then 12s.
      for (let i = 0; i < 320; i++) {
        await new Promise((res) => setTimeout(res, i < 60 ? 6000 : 12000));
        const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        if (d?.production) { setter(d.production); if (d.production[statusKey] !== "running") break; }
      }
    } finally { activePolls.current.delete(statusKey); }
  }

  // Resume polling whenever the page mounts OR the tab becomes visible again - the render runs
  // server-side regardless, but background tabs throttle/stop the poll, so re-sync on return.
  useEffect(() => {
    const resume = (p: Production) => {
      (["shots_status", "clips_status", "assembly_status", "audio_status"] as const).forEach((k) => { if (p?.[k] === "running") poll(setProduction, k); });
    };
    resume(initialProduction);
    // Also re-sync from the LIVE production on mount (the SSR snapshot can be a beat stale on a hard
    // refresh) so an in-flight stitch/render resumes its progress instead of looking stalled.
    fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.production) { setProduction(d.production); resume(d.production); } }).catch(() => {});
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.production) { setProduction(d.production); resume(d.production); } }).catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BRIEF AUTO-POPULATE on load: if you already chose a-roll/b-roll favourites on the Creatives page and
  // the setting is still blank, fill it from that creative's own description so you don't re-type it.
  useEffect(() => {
    if (setting.trim()) return;
    const ref = arollGuide || brollGuide;
    if (!ref) return;
    const c = creatives.find((x) => x.url === ref);
    if (c?.scene?.trim()) { setSetting(c.scene.trim()); setAutoFilled(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shoot ONE role's reference stills at the chosen aspect ratio. Keeps the other role's shots;
  // invalidates downstream clips/audio/final (board changed) and resets approvals back to concept.
  async function shootRole(role: "a-roll" | "b-roll", ratio: string) {
    if (shooting) return;
    setErr(""); setShootingRole(role); setShootScope("all"); // all scenes of this role
    setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).filter((s) => s.role !== role), shots_status: "running", clips: [], clips_status: "idle", music_url: null, ambient_url: null, audio_status: "idle", final_url: null, assembly_status: "idle" } : p));
    // Re-shooting THIS role's refs invalidates only its own approval + everything downstream
    // (animate/audio/stitch/showreel). Keep Concept, Voice AND the OTHER role's refs intact - and
    // persist, so a refresh restores the same place. (Fixes "shooting b-roll asks to re-approve voice".)
    const drop = new Set([role === "a-roll" ? "arollRefs" : "brollRefs", "aroll", "broll", "audio", "stitch", "showreel"]);
    setApproved((s) => { const n = new Set([...s].filter((k) => !drop.has(k))); persistApproved(n); return n; });
    setDenied(new Set());
    await awaitGuideSave(); // never shoot before the chosen guide + wardrobe lock have persisted
    const r = await fetch(`/api/influencers/${influencerId}/shots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleFilter: role, aspectRatio: ratio, priority, speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the shoot - give it another go, or use ⟳ Reset if stuck above."); setProduction((p) => (p ? { ...p, shots_status: "idle" } : p)); setShootingRole(""); return; }
    await poll(setProduction, "shots_status");
    setShootingRole("");
  }

  // FAST PATH: render every scene (a-roll + b-roll) in ONE parallel job, so the two roles render
  // concurrently instead of back-to-back (~halves the wait).
  async function renderRole(role: "a-roll" | "b-roll") { setClipScope("all");
    if (rendering || wholeBoardBusy) return;
    setErr(""); setRenderingRole(role); setWholeBoardBusy(true);
    setProduction((p) => (p ? { ...p, clips_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles: [role], speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the render - try again, or use ⟳ Reset if stuck above."); setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); setRenderingRole(""); setWholeBoardBusy(false); return; }
    await poll(setProduction, "clips_status");
    setRenderingRole(""); setWholeBoardBusy(false);
  }

  const [reflowBusy, setReflowBusy] = useState(false);
  // Continuity pass: re-flow the VO across the KEPT scenes so the script reads seamlessly after drops.
  async function reflowScript() {
    setReflowBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/production/reflow`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    setReflowBusy(false);
    if (r?.ok) { const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null); if (d?.production) setProduction(d.production); }
    else setErr(r?.error || "Couldn't re-flow the script.");
  }

  async function genAudio() {
    if (audioBusy) return;
    setErr("");
    setProduction((p) => (p ? { ...p, audio_status: "running", music_url: null, ambient_url: null } : p));
    const r = await fetch(`/api/influencers/${influencerId}/audio`, { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the audio - try again, or use ⟳ Reset if stuck above."); setProduction((p) => (p ? { ...p, audio_status: "idle" } : p)); return; }
    await poll(setProduction, "audio_status");
  }

  async function stitchCut() {
    if (assembling) return;
    setErr("");
    setProduction((p) => (p ? { ...p, final_url: null, assembly_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/assemble`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captions: stitchCaptions, captionStyle: stitchCaptionStyle, endCardUrl, endCardKind }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the stitch - try again, or use ⟳ Reset if stuck above."); setProduction((p) => (p ? { ...p, assembly_status: "idle" } : p)); return; }
    await poll(setProduction, "assembly_status");
  }

  // CONFORM to full quality for delivery: re-animate every DRAFT clip at 1080p (a-roll) / Veo (b-roll)
  // from its already-locked keyframe. Full-quality clips are skipped, so it only re-renders the proxies.
  async function finalizeClips() {
    if (rendering) return;
    setErr("");
    setProduction((p) => (p ? { ...p, clips_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ finalize: true }) }).then((x) => x.json()).catch(() => null);
    if (r?.nothingToDo) { setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); return; }
    if (!r?.queued) { setErr(r?.error || "Couldn't start the full-quality render - try again."); setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); return; }
    await poll(setProduction, "clips_status");
  }

  const [zoom, setZoom] = useState<string | null>(null);
  const [vzoom, setVzoom] = useState<string | null>(null);
  // Fire a celebration the moment a finished cut first appears.
  const [celebrate, setCelebrate] = useState(false);
  const prevFinal = useRef<string | null>(initialProduction?.final_url || null);
  useEffect(() => {
    const f = production?.final_url || null;
    if (f && !prevFinal.current) setCelebrate(true);
    prevFinal.current = f;
  }, [production?.final_url]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [ed, setEd] = useState({ location: "", blocking: "", shot: "", performance: "", motion: "", vo: "", caption: "", voAudio: "", phone: "", hero: "false", ref: "" });
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  // Close the edit panel but KEEP the scene you were on in view - collapsing the panel otherwise slides the
  // viewport onto a later scene (Gary's "Save jumps me to scene 6"). We stash the scene and scroll it back in
  // an EFFECT (after the panel has actually collapsed + re-laid-out) - a requestAnimationFrame alone fired too
  // early, against the OLD height, so the jump remained.
  const pendingScroll = useRef<number | null>(null);
  const returnToStrip = useRef(false); // an edit opened from the Scenes carousel returns THERE on save
  function closeEditKeep(i: number | null) {
    pendingScroll.current = i;
    setEditIdx(null);
  }
  useEffect(() => {
    if (editIdx !== null || pendingScroll.current == null) return;
    const i = pendingScroll.current; pendingScroll.current = null;
    const toStrip = returnToStrip.current; returnToStrip.current = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = toStrip ? document.getElementById("scenes-strip") : document.getElementById(`prod-scene-${i}`);
      el?.scrollIntoView({ block: toStrip ? "start" : "center", behavior: "smooth" });
    }));
  }, [editIdx]);
  // Edit a scene FROM the in-step carousel: jump up to its card (open the editor), then return to the strip on save.
  function editFromStrip(i: number, s: Scene) {
    returnToStrip.current = true;
    if (editIdx !== i) openEdit(i, s);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`prod-scene-${i}`)?.scrollIntoView({ block: "center", behavior: "smooth" })));
  }
  function openEdit(i: number, s: Scene) {
    if (editIdx === i) { closeEditKeep(i); return; }
    setEditIdx(i); setAiInstr("");
    setEd({ location: s.location || "", blocking: s.blocking || "", shot: s.shot || "", performance: s.performance || "", motion: s.motion_prompt || "", vo: s.vo_line || "", caption: s.caption || "", voAudio: s.vo_audio_url || "", phone: s.phone_screen_url || "", hero: s.hero || "false", ref: s.ref_url || "" });
  }
  function applyEditsLocally(i: number) {
    setProduction((p) => (p && p.storyboard ? { ...p, storyboard: { ...p.storyboard, scenes: p.storyboard.scenes.map((s, idx) => (idx === i ? { ...s, location: ed.location, blocking: ed.blocking, shot: ed.shot, performance: ed.performance, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone, hero: ed.hero, ref_url: ed.ref } : s)) } } : p));
  }
  async function aiRewrite(i: number) {
    setAiBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene/script`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: i, instruction: aiInstr }),
    }).then((x) => x.json()).catch(() => null);
    setAiBusy(false);
    if (typeof r?.vo_line === "string") setEd((e) => ({ ...e, vo: r.vo_line, caption: r.caption || e.caption }));
    else setErr(r?.error || "The producer couldn't rewrite that. Try again.");
  }
  async function saveScene(i: number) {
    setErr("");
    const before = production?.storyboard?.scenes?.[i] as Record<string, string> | undefined;
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: i, reshoot: false, location: ed.location, blocking: ed.blocking, shot: ed.shot, performance: ed.performance, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone, hero: ed.hero, ref_url: ed.ref }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.saved) {
      // A text-only save that changed VISUAL fields means the current keyframe/clip is now stale → flag it so
      // the user knows to re-shoot to apply (vs a pure script edit, which doesn't need a re-render).
      const visualChanged = !!before && (ed.location !== (before.location || "") || ed.blocking !== (before.blocking || "") || ed.shot !== (before.shot || "") || ed.performance !== (before.performance || "") || ed.motion !== (before.motion_prompt || "") || ed.hero !== (before.hero || "false") || ed.ref !== (before.ref_url || ""));
      if (visualChanged) markDirty(i);
      applyEditsLocally(i); closeEditKeep(i);
    } else setErr(r?.error || "Couldn't save.");
  }
  async function reshootScene(i: number) {
    setErr(""); setEditIdx(null); clearDirty(i);
    setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).map((s) => (s.scene === i ? { ...s, reshooting: true } : s)) } : p));
    const r = await fetch(`/api/influencers/${influencerId}/shots/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: i, location: ed.location, blocking: ed.blocking, shot: ed.shot, performance: ed.performance, motion_prompt: ed.motion, vo_line: ed.vo, caption: ed.caption, vo_audio_url: ed.voAudio, phone_screen_url: ed.phone, hero: ed.hero, ref_url: ed.ref }),
    }).then((x) => x.json()).catch(() => null);
    applyEditsLocally(i);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the re-shoot."); setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).map((s) => (s.scene === i ? { ...s, reshooting: false } : s)) } : p)); return; }
    const role: "a-roll" | "b-roll" = sb?.scenes?.[i]?.role === "b-roll" ? "b-roll" : "a-roll";
    // 1) wait for the new keyframe
    for (let k = 0; k < 45; k++) {
      await new Promise((res) => setTimeout(res, 6000));
      const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (d?.production) { setProduction(d.production); const sh = (d.production.shots ?? []).find((s: Shot) => s.scene === i); if (!sh?.reshooting) break; }
    }
    // 2) the re-shoot auto-renders this scene's clip too - wait for it and drop it into the preview
    setRenderingRole(role);
    await poll(setProduction, "clips_status");
    setRenderingRole("");
  }

  // SCENE-BY-SCENE: build ONE scene (shoot its keyframe AND animate its clip) using its STORED direction
  // (no edit form) - the reshoot job renders the keyframe then the clip.
  // Shoot ONE scene's REFERENCE IMAGE (keyframe) only - no video. Video comes later (after the voice).
  async function shootRefScene(i: number) {
    if (busyAny) return;
    setErr(""); setShootingRole(""); setShootScope([i]); clearDirty(i); // ONLY this scene is shooting
    setProduction((p) => {
      if (!p) return p;
      const list = p.shots ?? [];
      const shots = list.some((s) => s.scene === i)
        ? list.map((s) => (s.scene === i ? { ...s, reshooting: true } : s))
        : [...list, { scene: i, role: String(sb?.scenes?.[i]?.role || "a-roll"), beat: String(sb?.scenes?.[i]?.beat || ""), url: null, reshooting: true }];
      return { ...p, shots, shots_status: "running" };
    });
    await awaitGuideSave(); // never shoot before the chosen guide + wardrobe lock have persisted
    const r = await fetch(`/api/influencers/${influencerId}/shots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenes: [i], aspectRatio: boardRatio, priority, speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't shoot that reference image."); setProduction((p) => (p ? { ...p, shots: (p.shots ?? []).map((s) => (s.scene === i ? { ...s, reshooting: false } : s)), shots_status: "idle" } : p)); return; }
    await poll(setProduction, "shots_status");
  }
  // PER-SCENE offer callouts (frosted glass). Source of truth = production.scene_callouts, keyed by scene idx.
  const sceneCallouts = (production?.scene_callouts) || {};
  const [coOpen, setCoOpen] = useState<number | null>(null);
  const [coDraft, setCoDraft] = useState<SceneCallout>({ kick: "Limited offer", line: "", num: "", suffix: "FREE", accent: "#ffcb05" });
  function openCallout(i: number) {
    if (coOpen === i) { setCoOpen(null); return; }
    const ex = sceneCallouts[String(i)];
    setCoDraft(ex ? { kick: ex.kick ?? "", line: ex.line ?? "", num: ex.num ?? "", suffix: ex.suffix ?? "", accent: ex.accent ?? "#ffcb05" } : { kick: "Limited offer", line: "", num: "", suffix: "FREE", accent: "#ffcb05" });
    setCoOpen(i);
  }
  async function saveCallout(i: number, remove = false) {
    const body = remove ? { scene: i, callout: { on: false } } : { scene: i, callout: { on: true, ...coDraft } };
    const r = await fetch(`/api/influencers/${influencerId}/callout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (r?.scene_callouts) setProduction((p) => (p ? ({ ...p, scene_callouts: r.scene_callouts } as Production) : p));
    setCoOpen(null);
  }
  // Toggle a scene's Live background right on the card (a-roll only) - a text-only persist, no re-shoot. Off
  // by default and the slow/flaky lane, so it's opt-in per scene. Re-shoot + re-animate to apply the change.
  async function toggleLiveBg(i: number) {
    const s = production?.storyboard?.scenes?.[i] as Record<string, string> | undefined;
    if (!s) return;
    const next = String(s.live_bg) === "true" ? "false" : "true";
    setProduction((p) => (p?.storyboard ? { ...p, storyboard: { ...p.storyboard, scenes: p.storyboard.scenes.map((sc, idx) => (idx === i ? { ...sc, live_bg: next } : sc)) } } : p));
    markDirty(i); // the current clip doesn't reflect the new background - flag "re-shoot to apply"
    await fetch(`/api/influencers/${influencerId}/shots/scene`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scene: i, reshoot: false, live_bg: next }) }).catch(() => {});
  }
  // Animate ONE scene's clip from its existing keyframe (no re-shoot). CONCURRENT: fire it and return - you
  // can immediately fire the NEXT scene without waiting (the backend saves each clip atomically). Each scene
  // self-polls until ITS clip lands, so several can render at once, each with its own spinner.
  async function animateScene(i: number) {
    if (animatingScenes.has(i)) return; // only block re-firing THIS scene; a per-scene animate is independent
    // (each clip saves atomically via upsertClip), so you can fire it even while another scene - or a whole-
    // board run - is still rendering.
    setErr(""); clearDirty(i);
    const before = (production?.clips ?? []).find((c) => c.scene === i)?.url || null;
    setAnimatingScenes((s) => new Set(s).add(i));
    // Optimistically clear a prior FAILURE on this scene so the error banner disappears immediately and the
    // card flips to "rendering" - not left showing the old failure through the whole re-render.
    setProduction((p) => (p ? { ...p, clips: (p.clips ?? []).map((c) => (c.scene === i && c.status === "failed" ? { ...c, status: "pending", error: null } : c)) } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenes: [i], reanimate: true, speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't animate that scene."); setAnimatingScenes((s) => { const n = new Set(s); n.delete(i); return n; }); return; }
    // Self-poll THIS scene only (independent of the others), until its clip is new or has failed.
    for (let n = 0; n < 400; n++) {
      await new Promise((res) => setTimeout(res, n < 40 ? 4000 : 8000));
      const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (d?.production) {
        setProduction(d.production);
        const c = (d.production.clips ?? []).find((x: { scene?: number }) => x.scene === i) as { url?: string | null; status?: string } | undefined;
        if (c && ((c.url && c.url !== before) || c.status === "failed")) break;
      }
    }
    setAnimatingScenes((s) => { const n = new Set(s); n.delete(i); return n; });
  }
  // Batch: shoot EVERY scene's keyframe (parallel), then you Animate all.
  async function shootAll(ratio: string) {
    if (shooting) return;
    setErr(""); setShootingRole(""); setShootScope("all"); // whole-board shoot
    setProduction((p) => (p ? { ...p, shots: [], shots_status: "running", clips: [], clips_status: "idle", music_url: null, ambient_url: null, audio_status: "idle", final_url: null, assembly_status: "idle" } : p));
    setApproved((s) => { const n = new Set([...s].filter((k) => k === "concept" || k === "voice")); persistApproved(n); return n; });
    await awaitGuideSave(); // never shoot before the chosen guide + wardrobe lock have persisted
    const r = await fetch(`/api/influencers/${influencerId}/shots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aspectRatio: ratio, priority, speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (!r?.queued) { setErr(r?.error || "Couldn't start the shoot."); setProduction((p) => (p ? { ...p, shots_status: "idle" } : p)); return; }
    await poll(setProduction, "shots_status");
  }
  // Batch: animate EVERY kept scene's clip (parallel).
  // force=false (default) only animates scenes that don't already have a good clip (finishes a partial
  // run cheaply); force=true re-animates the whole board (a deliberate, paid redo).
  async function animateAll(force = false) {
    if (rendering || shooting || wholeBoardBusy || animatingScenes.size) return;
    if (force && !confirm("Re-animate EVERY scene from scratch? This re-renders clips you already have and costs more. To just finish the missing ones, use Animate remaining instead.")) return;
    setErr(""); setRenderingRole(""); setClipScope("all"); setWholeBoardBusy(true);
    setProduction((p) => (p ? { ...p, clips_status: "running" } : p));
    const r = await fetch(`/api/influencers/${influencerId}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(force ? { force: true, speed: speedMode } : { speed: speedMode }) }).then((x) => x.json()).catch(() => null);
    if (r?.nothingToDo) { setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); setRenderingRole(""); setWholeBoardBusy(false); return; } // every scene already has a clip
    if (!r?.queued) { setErr(r?.error || "Couldn't start animating."); setProduction((p) => (p ? { ...p, clips_status: "idle" } : p)); setRenderingRole(""); setWholeBoardBusy(false); return; }
    // Ground truth: show exactly how many scenes the server decided to render (not perceived spinners).
    if (typeof r.animating === "number") flex(`🎞️ Animating ${r.animating} scene${r.animating === 1 ? "" : "s"}${force ? " (full redo)" : ""}`, { milestone: true });
    await poll(setProduction, "clips_status"); setRenderingRole(""); setWholeBoardBusy(false);
  }

  async function resetStuck() {
    setErr("");
    await fetch(`/api/influencers/${influencerId}/production/reset`, { method: "POST" }).catch(() => {});
    const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (d?.production) setProduction(d.production);
  }
  // Drop every existing clip + the final cut (leftover videos from earlier testing) so the board is clean
  // reference images again. Keeps the storyboard, shots, voice + approvals - only the videos go.
  async function clearStaleClips() {
    if (busyAny) return;
    if (!confirm("Clear all existing clips and the final cut? Your storyboard, reference images and voice stay - only the rendered videos are removed, so you can re-animate from clean stills.")) return;
    setErr("");
    await fetch(`/api/influencers/${influencerId}/production/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearClips: true }) }).catch(() => {});
    const d = await fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (d?.production) setProduction(d.production);
  }

  async function decideShowreel(decision: "accept" | "decline") {
    setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/showreel`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.showreel_status) setProduction((p) => (p ? { ...p, showreel_status: r.showreel_status } : p));
    else setErr(r?.error || "Couldn't record the decision.");
  }

  // AI BRIEF CO-PILOT: draft/sharpen the offer, key benefits, CTA + tone from the brand + this influencer.
  async function draftBriefAI() {
    if (briefBusy) return;
    if (!brand.trim()) { setErr("Add the brand / product first, then I can draft a world-class brief."); return; }
    setBriefBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/producer/brief`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, offer, benefits, cta, tone, durationSeconds: duration, audience: briefAudience, keyMessage: briefKeyMsg, proof: briefProof }),
    }).then((x) => x.json()).catch(() => null);
    setBriefBusy(false);
    if (r && typeof r.benefits === "string") {
      if (r.offer) setOffer(r.offer); if (r.benefits) setBenefits(r.benefits); if (r.cta) setCta(r.cta); if (r.tone) setTone(r.tone);
      setBriefUsedBrain(!!r.usedBrain); setBriefOpen(false);
    } else setErr(r?.error || "Couldn't draft the brief - give it another go.");
  }
  async function writeScript() {
    if (!brand.trim() || !offer.trim() || scriptBusy) { if (!brand.trim() || !offer.trim()) setErr("I need at least the brand and the core offer to write the script."); return; }
    setScriptBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/script`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, offer, benefits, cta, ctaCode, durationSeconds: duration, tone, setting }),
    }).then((x) => x.json()).catch(() => null);
    setScriptBusy(false);
    if (r?.script) setDraftScript(r.script); else setErr(r?.error || "Couldn't write the script. Try again.");
  }
  // VOICE-FIRST: upload a real recording → Scribe transcribes it → the transcript becomes the script,
  // and the recording is remembered so the Voice step slices THAT audio per scene (your real voice).
  async function scriptFromVoice(audioUrl: string) {
    setScriptBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/script/from-voice`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioUrl }),
    }).then((x) => x.json()).catch(() => null);
    setScriptBusy(false);
    if (r?.script) {
      setDraftScript(r.script);
      fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((x) => x.json()).then((d) => { if (d?.production) setProduction(d.production); }).catch(() => {});
    } else setErr(r?.error || "Couldn't transcribe that recording.");
  }
  async function generate() {
    if (!brand.trim() || !offer.trim() || busy) { if (!brand.trim() || !offer.trim()) setErr("I need at least the brand and the core offer."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/influencers/${influencerId}/storyboard`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand, offer, benefits, cta, ctaCode, durationSeconds: duration, format, setting, tone, logo, legal, script: draftScript || "", clothingRef: clothingRef || "", locationRef: locationRef || "", logoUrl: logoUrl || "", promoUrl: promoUrl || "", captions, endCardUrl, endCardKind }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.production?.storyboard) { setProduction(r.production); setEditing(false); setApproved(new Set()); setDenied(new Set()); persistApproved(new Set()); }
    else setErr(r?.error || "Couldn't draft the storyboard. Try again.");
  }

  return (
    <div className="space-y-5">
      {/* The Producer */}
      <div className="flex items-start gap-3 rounded-xl border border-[#a855f7]/30 bg-gradient-to-r from-[#a855f7]/12 to-[#60a5fa]/8 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#a855f7]/20 text-2xl">🎬</div>
        <div>
          <div className="text-sm font-extrabold text-white">{mode === "foundation" ? "Script & Voice" : mode === "studio" ? "The Final Cut" : "Your Producer"}</div>
          <p className="mt-1 text-sm text-ink-dim">
            {mode === "foundation"
              ? `Write the ad and lock the voice - the foundation everything else is built to. Tell me about the ad and I'll direct ${name}'s storyboard, shot by shot; then pick the voice and generate the voiceover.`
              : mode === "studio"
              ? `Shoot, animate and cut - built to ${name}'s locked script + voice. Work scene by scene on the cards, then music and the final stitch.`
              : editing
              ? `Tell me about the ad and I'll direct a full storyboard for ${name}, shot by shot, in our house style. Then we shoot it together.`
              : `Here's the storyboard I've directed for ${name}. Review the scenes, regenerate anything, and when you're happy we'll shoot it.`}
          </p>
        </div>
      </div>

      {editing ? (
        mode === "studio" ? (
          /* Studio opened before the script exists → send them to Script & Voice first. */
          <a href={`/setup/influencers/${influencerId}/voice`} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] px-4 py-4 text-sm font-bold text-[#fbbf24]">⚠ Start with Script &amp; Voice - write the script and lock the voice first, then come back to The Final Cut →</a>
        ) : (
        /* Brief */
        <div className="space-y-4 rounded-xl border border-line bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="tabular text-xs uppercase tracking-[0.2em] text-ink-faint">The brief</div>
            <span className="text-[10px] text-ink-faint"><span className="text-alert">*</span> required - the rest is optional</span>
          </div>

          {/* ── Core (required) ── */}
          <div className="space-y-3">
            <div className="eyebrow">Core</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand / product *" v={brand} set={setBrand} placeholder="e.g. MTN MoMo App" />
              <Field label="Core offer / hook *" v={offer} set={setOffer} placeholder="e.g. register and get 1GB free" />
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Duration</div>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map((d) => (
                    <button key={d} onClick={() => setDuration(d)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${duration === d ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{d}s</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Format</div>
                <div className="flex gap-2">
                  {(["9:16", "1:1"] as const).map((f) => (
                    <button key={f} onClick={() => setFormat(f)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${format === f ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{f}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Story & messaging ── */}
          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="eyebrow">Story &amp; messaging</div>
              <button onClick={() => setBriefOpen((v) => !v)} disabled={briefBusy} title="Answer 2-3 quick questions and I draft a world-class brief - sharper offer, concrete benefits, CTA + tone (uses the client's brain if one is connected)" className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] transition hover:bg-[#a855f7]/10 disabled:opacity-50">{briefBusy ? "✨ Drafting the brief…" : briefOpen ? "✕ Close" : "✨ Draft with AI"}</button>
            </div>
            {briefOpen && !briefBusy && (
              <div className="space-y-2 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/[0.06] p-3">
                <p className="text-[11px] text-ink-dim">Answer a couple (all optional) and I&apos;ll draft a world-class brief — a sharper offer, concrete benefits, the CTA and tone. If the client has a connected brain, I&apos;ll ground it in those facts too.</p>
                <Field label="Who is it for? (audience)" v={briefAudience} set={setBriefAudience} placeholder="e.g. first-time bettors who think racing isn't for them" />
                <Field label="The ONE thing to land" v={briefKeyMsg} set={setBriefKeyMsg} placeholder="e.g. you can get in the draw from just R50" />
                <Field label="Proof / credibility to lean on" v={briefProof} set={setBriefProof} placeholder="e.g. R2.5m prize pool, official Durban July partner" />
                <button onClick={draftBriefAI} disabled={briefBusy || !brand.trim()} className="btn-brand rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50">✨ Draft the brief →</button>
                {!brand.trim() && <p className="text-[10px] text-amber-400">Add the brand / product up top first.</p>}
              </div>
            )}
            {briefUsedBrain && <p className="text-[11px] text-[#93c5fd]">🧠 Grounded in the client&apos;s brain. Edit anything below.</p>}
            <p className="text-[11px] text-ink-faint">The co-pilot sharpens the offer and fills the benefits, CTA and tone — edit anything after. Works with or without a client brain.</p>
            <Area label="Key benefits (comma separated)" v={benefits} set={setBenefits} placeholder="airtime, data, payments, vouchers, all in one app" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Primary CTA" v={cta} set={setCta} placeholder="Download the MTN MoMo App, register today" />
              <Field label="CTA mechanic / code" v={ctaCode} set={setCtaCode} placeholder="dial *120*151#" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Setting / world (one place, optional)" v={setting} set={setSetting} placeholder="upscale sunlit coffee shop, daytime" />
              <Field label="Tone words" v={tone} set={setTone} placeholder="warm, confident, effortless" />
            </div>
            {autoFilled
              ? <p className="text-[11px] text-[#93c5fd]">✨ Setting auto-filled from your chosen creative, so you do not have to re-type it. Edit or clear it if you want something different. Your characters (for example Mary and her daughter) come from your concept and script: the producer keeps a-roll solo and writes the companions into the b-roll.</p>
              : (arollRef || brollRef)
                ? <p className="text-[11px] text-ink-faint">You set a reference look in the creatives, so the shoot already anchors to its world, lighting and wardrobe. Setting is optional here, use it only to add or override detail. Your characters (for example Mary and her daughter) come from your concept and script, not the reference, so describe them there: the producer keeps a-roll solo and writes the companions into the b-roll.</p>
                : <p className="text-[11px] text-ink-faint">Optional. One consistent world for the whole ad. Leave it blank and the producer picks one to suit the character.</p>}
          </div>

          {/* ── Look & assets (optional, collapsed) ── */}
          <details className="group border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="eyebrow">Look &amp; assets <span className="normal-case tracking-normal text-ink-faint">· optional</span></span>
              <span className="text-ink-faint transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Uploader kind="clothing" label="Clothing reference" current={clothingRef} onUploaded={setClothingRef} />
                <Uploader kind="location" label="Scene / location reference" current={locationRef} onUploaded={setLocationRef} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Uploader kind="logo" label="Brand logo - top-left (transparent PNG)" current={logoUrl} onUploaded={setLogoUrl} />
                <Uploader kind="promo" label="Promo image - top-right" current={promoUrl} onUploaded={setPromoUrl} />
              </div>
              <p className="-mt-1 text-[10px] text-ink-faint">Logo + promo are placed and sized for you in the top corners, over the whole video. A logo only shows if you upload one.</p>
              <Field label="Brand-name text (shown only if no logo is uploaded)" v={logo} set={setLogo} placeholder='"MoMo from MTN"' />
            </div>
          </details>

          {/* ── Finishing (optional, collapsed) ── */}
          <details className="group border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <span className="eyebrow">Finishing <span className="normal-case tracking-normal text-ink-faint">· optional</span></span>
              <span className="text-ink-faint transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Closing / end card</div>
                {endCards.length === 0 ? (
                  <p className="text-[11px] text-ink-faint">Pick a reusable close from <a href="/end-cards" className="text-accent">End Cards</a>, or just upload one at the final <b>Stitch</b> step.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { setEndCardUrl(""); }} className={`flex aspect-[9/16] w-16 items-center justify-center rounded-lg border text-[10px] ${!endCardUrl ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-faint hover:border-line-strong"}`}>None</button>
                    {endCards.map((c) => (
                      <button key={c.id} onClick={() => { setEndCardUrl(c.url); setEndCardKind(c.kind); }} title={c.label} className={`relative aspect-[9/16] w-16 overflow-hidden rounded-lg border ${endCardUrl === c.url ? "border-[#a855f7] ring-2 ring-[#a855f7]/50" : "border-line hover:border-line-strong"}`}>
                        {c.kind === "video"
                          ? <video src={c.url} muted playsInline className="h-full w-full object-cover" />
                          /* eslint-disable-next-line @next/next/no-img-element */
                          : <img src={c.url} alt={c.label} className="h-full w-full object-cover" />}
                        {endCardUrl === c.url && <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#a855f7] text-[9px] text-white">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Area label="Compliance / legal line (verbatim)" v={legal} set={setLegal} placeholder="Used exactly as written. Optional." />
              <p className="text-[10px] text-ink-faint">Captions and the closing clip are also controlled at the final <b>Stitch</b> step.</p>
            </div>
          </details>
          {/* SCRIPT-FIRST: the producer writes the spoken script from your concept; edit it, then build the scenes around it. */}
          <div className="rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 p-3">
            <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Script</div>
            <p className="mb-2 text-[12px] text-ink-dim">Have the producer write the {duration}s script from your concept, then edit it until it reads right - the scenes (a-roll + b-roll) get built around these exact words. (Optional: skip it and the storyboard will write its own.)</p>
            <button onClick={writeScript} disabled={scriptBusy} className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{scriptBusy ? "✍️ Working…" : draftScript ? "↻ Re-write the script" : "✍️ Write the script"}</button>
            {draftScript && <textarea value={draftScript} onChange={(e) => setDraftScript(e.target.value)} rows={6} className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#a855f7]" placeholder="The spoken script…" />}
            {/* VOICE-FIRST: record naturally, we transcribe → that's the script, and your real voice is used in the video. */}
            <div className="mt-2 border-t border-line/60 pt-2">
              <p className="mb-1.5 text-[11px] text-ink-faint">…or <b>upload a voice recording</b> and we&apos;ll script from it - your real voice is transcribed into the script, then used in the video (sliced per scene at the Voice step). Just speak naturally.</p>
              <Uploader kind="my-vo" accept="audio" label="🎙️ Upload a voice recording → script from it" onUploaded={scriptFromVoice} />
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">🔊 You pick or create the voice (library, design your own, upload or clone) in the very next step, <b>Voice</b> — it runs before any scene is shot. Build the storyboard here first, then set the voice.</p>
          </div>
          {err && <p className="text-xs text-alert">{err}</p>}
          <button onClick={generate} disabled={busy} className="btn-brand rounded-lg px-5 py-3 text-sm font-bold disabled:opacity-50">{busy ? "Directing the storyboard…" : draftScript ? "🎬 Build the scenes from this script" : "🎬 Direct the storyboard"}</button>
        </div>
        )
      ) : sb ? (
        /* Storyboard */
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-1 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-extrabold text-white">{sb.title}</div>
                <div className="tabular mt-1 text-[11px] uppercase tracking-[0.15em] text-ink-faint">{sb.format} · {sb.duration_seconds}s · {sb.scenes.length} scenes · {sb.tone}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (!resetArmed) { setResetArmed(true); setTimeout(() => setResetArmed(false), 4000); return; } setResetArmed(false); resetStuck(); }} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${resetArmed ? "border-alert bg-alert/15 text-alert" : (busyAny || assembling || audioBusy) ? "border-alert/50 text-alert hover:bg-alert/10" : "border-line text-ink-faint hover:text-ink"}`} title="Only if a job is genuinely stuck for many minutes: this cancels the CURRENT render (your finished clips are kept). A render often just takes a while - check the timer first.">{resetArmed ? "⚠ Confirm - cancel the current job?" : "⟳ Reset if stuck"}</button>
                {clips.length > 0 && <button onClick={clearStaleClips} disabled={busyAny} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-40" title="Drop all existing clips + the final cut (leftover videos) and go back to clean reference images. Keeps the storyboard, stills and voice.">🧹 Clear clips</button>}
                {/* Script edits (New brief / Regenerate) live in the Script & Voice stage - hidden in The Final Cut
                    so a locked script can't be blown away mid-build. */}
                {isFoundation && <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">✎ New brief</button>}
                {isFoundation && <button onClick={generate} disabled={busy} className="rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{busy ? "Re-directing…" : "↻ Regenerate"}</button>}
              </div>
            </div>
            {sb.music_bed && <p className="mt-2 text-[12px] text-ink-faint">🎵 {sb.music_bed}</p>}
            {/* Plain-English glossary - define the two shot types once, up front */}
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-md border border-[#a855f7]/30 bg-[#a855f7]/10 px-2 py-1 text-[#c79bff]"><b>A-roll</b> = talking shots - {name} speaking to camera, lip-synced</span>
              <span className="rounded-md border border-[#60a5fa]/30 bg-[#60a5fa]/10 px-2 py-1 text-[#93c5fd]"><b>B-roll</b> = scene shots - the world and movement around her, no talking</span>
            </div>
            {dropped.size > 0 && (
              <div className="mt-2 rounded-lg border border-active/30 bg-active/5 px-3 py-2 text-[11px] text-active">⚠ {dropped.size} reference{dropped.size === 1 ? "" : "s"} rejected - those scenes are left out of the final cut, so it&apos;ll be shorter. Re-flow the script in the Voice step so the voiceover still reads smoothly.</div>
            )}
          </div>

          {/* Reference-image shoot (keyframes) - The Final Cut stage only (foundation is script + voice). */}
          {isStudio && (<div className="rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/[0.04] px-3 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[12px] font-semibold text-ink">📸 Reference images</span>
              {/* Priority queue is now ALWAYS ON (the fast paid image model) - a keyframe is the foundation of
                  every shot and ~1 credit is negligible on the Ultra plan, so there's no reason to sit in the
                  slow free queue. No toggle needed. */}
              {/* Draft speed: animation-only proxy (a-roll 720p, b-roll fast DoP). Keyframes stay FULL quality;
                  the "Render final quality" conform at the Stitch step upgrades drafts to 1080p/Veo, no drift. */}
              <button
                onClick={() => setSpeedMode((v) => !v)}
                title="Draft speed: render your PREVIEW clips fast + cheap (a-roll at 720p, b-roll on the quick DoP engine) so your team can review quickly. Your keyframes stay FULL quality, so nothing about the shot is lost. When you're happy, hit 'Render final quality' at the Stitch step - it conforms every draft to 1080p / Veo from the SAME keyframe (same shot, no drift). Turn OFF to render at full quality from the start."
                className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition ${speedMode ? "border-[#a855f7] bg-[#a855f7]/15 text-[#d8b4fe]" : "border-line bg-surface-2/50 text-ink-faint hover:text-ink"}`}
              >
                <span aria-hidden>⚡</span> Draft speed
                <span className={`tabular ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${speedMode ? "bg-[#a855f7] text-black" : "bg-surface-2 text-ink-faint"}`}>{speedMode ? "ON" : "OFF"}</span>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <RatioPicker value={boardRatio} onChange={setBoardRatio} />
                <button onClick={() => shootAll(boardRatio)} disabled={busyAny} className="btn-brand rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50">{shooting && shootingRole === "" ? "📸 Shooting references…" : "📸 Shoot all reference images"}</button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">Shoot each scene&apos;s still here - your talking (a-roll) and scene (b-roll) references all shoot together in one pass. No video yet, that comes after you set the voice. Shoot all at once, or one scene at a time on the cards below.</p>
            {/* REFERENCE GUIDE + WARDROBE LOCK - set this BEFORE shooting so every scene matches the look + outfit. */}
            {creatives.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-[#a855f7]/15 pt-3">
                <div className="text-[11px] font-semibold text-ink-dim">🎯 Reference guide <span className="text-ink-faint font-normal">(optional, but set it BEFORE you shoot)</span> - pick one of your creatives to lock her look + wardrobe across every scene.</div>
                <GuidePicker role="a-roll" creatives={creatives} selected={arollGuide} onPick={setGuide} onZoom={setZoom} />
                <GuidePicker role="b-roll" creatives={creatives} selected={brollGuide} onPick={setGuide} onZoom={setZoom} />
                {lockBusy ? (
                  <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-ink-dim">🔎 Reading the outfit from your guide…</div>
                ) : wardrobeLock ? (
                  <div className="rounded-lg border border-[#a855f7]/45 bg-gradient-to-r from-[#a855f7]/20 via-[#8b5cf6]/12 to-[#6366f1]/16 px-3 py-2 text-[12px] text-ink"><span className="font-bold text-[#c4b5fd]">🔒 Wardrobe locked in</span> - every scene will use this exact outfit: <span className="text-ink-dim">{wardrobeLock}</span></div>
                ) : (arollGuide || brollGuide) ? (
                  <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[12px] text-ink-faint">Guide selected. {lockErr || "Locking the wardrobe…"}</div>
                ) : null}
                {lockErr && (wardrobeLock || (!arollGuide && !brollGuide)) ? <div className="text-[11px] text-red-400">{lockErr}</div> : null}
                {brollGuide ? (
                  <div className="rounded-lg border border-[#a855f7]/40 bg-gradient-to-r from-[#a855f7]/16 via-[#8b5cf6]/10 to-[#6366f1]/14 px-3 py-2 text-[12px] text-ink"><span className="font-bold text-[#c4b5fd]">🔒 B-roll cast + scene locked</span> - the companion (e.g. her daughter) and the setting from your chosen b-roll creative will carry into every b-roll scene. Her outfit stays the locked wardrobe above.</div>
                ) : null}
              </div>
            )}
          </div>)}

          <div className="space-y-3">
            {sb.scenes.map((s, i) => {
              const role = ROLE[s.role] ?? ROLE["a-roll"];
              const shot = shotFor(i);
              const clip = clipFor(i);
              // Has the wizard step for THIS scene's role been reached? A clip only reads as
              // "failed" once you're on/past its step - before that a stale clip shows as pending.
              const stepReached = unlocked("scenes");
              const clipFailed = clip?.status === "failed" && stepReached;
              return (
                <div key={i} id={`prod-scene-${i}`} className="flex gap-4 rounded-xl border border-line bg-surface-1 p-4">
                  {isStudio && s.role !== "graphic" && (
                    <div className="w-32 shrink-0">
                      {shot?.reshooting ? (
                        <div className="relative">
                          {shot.url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={shot.url} alt="" className="aspect-[9/16] w-full rounded-lg border border-line object-cover opacity-25" />
                            : <div className="aspect-[9/16] w-full rounded-lg border border-line bg-surface-2" />}
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-[10px] text-[#c79bff]"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" />re-shooting…</div>
                        </div>
                      ) : clip?.url ? (
                        <div className="relative">
                          <ClipPreview clip={clip} className="aspect-[9/16] w-full rounded-lg border border-ready/40 bg-black object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-ready/80 px-1 py-0.5 text-[8px] font-bold text-black">{clip.kind === "a-roll" ? "▶ A-ROLL" : "▶ B-ROLL"}</span>
                          {clip.draft && <span className="absolute right-1 bottom-1 rounded bg-[#f59e0b]/90 px-1 py-0.5 text-[8px] font-bold text-black" title="Draft preview (720p a-roll / fast DoP b-roll). Render final quality at the Stitch step before delivery.">720p DRAFT</span>}
                          {dirtyScenes.has(i) && <span className="absolute inset-x-1 top-1 z-10 rounded bg-[#a855f7]/90 px-1 py-0.5 text-center text-[8px] font-bold text-white" title="You changed this scene's direction or background - re-shoot/re-animate to apply it to the clip.">⟳ changed - re-render to apply</span>}
                          {clip.audio_url && clip.synced !== true && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-[#7dd3fc]" title="This clip renders silent; her voiceover is overlaid here and baked in at the final stitch.">🔊 voice overlaid</span>}
                          <button onClick={() => setZoom(clip.url!)} title="Preview full size" className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[11px] text-white transition hover:bg-black/90">👁</button>
                          {/* RE-ANIMATING this scene (it already has a clip): overlay feedback so it's clearly working.
                              ONLY for an explicit per-scene list (clipScope is an array with this scene) - a whole-board
                              "all" run never re-renders scenes that already have a clip, so it must NOT light them up. */}
                          {animatingScenes.has(i) && (
                            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/65 text-[10px] font-semibold text-white"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#60a5fa]/40 border-t-[#60a5fa]" />re-animating…<RenderTimer start={renderStarts[i] ?? Date.now()} hint={String((s as { live_bg?: string }).live_bg) === "true" ? "10-25 min" : s.role === "a-roll" ? "2-6 min" : String((s as { hero?: string }).hero) === "true" ? "10-25 min" : speedMode ? "3-8 min" : "10-40 min"} /></div>
                          )}
                        </div>
                      ) : !clip?.url && (animatingScenes.has(i) || (wholeBoardBusy && (renderingRole === "" || renderingRole === s.role))) ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 text-center text-[10px] text-ink-faint"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#60a5fa]/40 border-t-[#60a5fa]" />rendering…<RenderTimer start={renderStarts[i] ?? Date.now()} hint={String((s as { live_bg?: string }).live_bg) === "true" ? "10-25 min" : s.role === "a-roll" ? "2-6 min" : String((s as { hero?: string }).hero) === "true" ? "10-25 min" : speedMode ? "3-8 min" : "10-40 min"} /></div>
                      ) : shot?.url ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={shot.url} alt={`scene ${i + 1}`} onClick={() => setZoom(shot.url!)} className="aspect-[9/16] w-full cursor-zoom-in rounded-lg border border-line object-cover transition hover:brightness-110" title="Click to preview full size" />
                          {/* The reference image is the HERO. Only once you're at the animate step do we badge the clip
                              state (pending / failed) - we never hide a good still behind a clip message. */}
                          {stepReached && <span className={`tabular absolute left-1 top-1 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${clipFailed ? "bg-alert/85 text-black" : "bg-black/65 text-ink-dim"}`} title={clipFailed ? (clip?.error || "") : ""}>{clipFailed ? "⚠ clip failed - re-animate" : `⏳ ${s.role} clip pending`}</span>}
                        </div>
                      ) : clipFailed ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-alert/30 bg-surface-2 p-1 text-center text-[9px] text-alert" title={clip.error || ""}>clip failed</div>
                      ) : (shooting && (shootScope === "all" ? !anyReshooting : shootScope.includes(i)) && (shootingRole === "" || shootingRole === s.role)) ? (
                        <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 text-center text-[10px] text-ink-faint"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" />shooting…</div>
                      ) : shot?.error ? (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-alert/30 bg-surface-2 text-center text-[10px] text-alert">shot failed</div>
                      ) : (
                        <div className="flex aspect-[9/16] w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface-2 text-center text-[10px] text-ink-faint">not shot yet</div>
                      )}
                      {/* Per-scene controls: shoot the reference image (keyframe) here; animation comes after the voice. */}
                      {!shot?.reshooting && (
                        <div className="mt-1.5 space-y-1">
                          <button
                            onClick={() => shootRefScene(i)}
                            disabled={busyAny || dropped.has(i)}
                            className="w-full rounded-md btn-brand px-2 py-1 text-[10px] font-bold disabled:opacity-40"
                          >{shot?.url ? "↻ Re-shoot reference" : "📸 Shoot reference"}</button>
                          {shot?.url && (
                            <button
                              onClick={() => animateScene(i)}
                              disabled={animatingScenes.has(i) || dropped.has(i) || !approved.has("voice") || !!shot?.reshooting}
                              title={approved.has("voice") ? "Animate this scene into video" : "Finish Script & Voice first (animation lip-syncs + times to the locked voice), then animate"}
                              className="w-full rounded-md border border-[#60a5fa]/40 px-2 py-1 text-[10px] font-semibold text-[#93c5fd] hover:bg-[#60a5fa]/10 disabled:opacity-40"
                            >{!approved.has("voice") ? "🎞️ Animate (after voice)" : clip?.url ? "↻ Re-animate" : "🎞️ Animate"}</button>
                          )}
                          {/* LIVE BACKGROUND (a-roll only) - moved here from the edit box for a cleaner journey.
                              Off by default; it's the slow/flaky Kling lane, so opt in per scene for hero beats. */}
                          {s.role === "a-roll" && (
                            <button
                              onClick={() => toggleLiveBg(i)}
                              disabled={dropped.has(i)}
                              title="Live background: the whole world moves behind her (Kling 3.0) instead of a still background - cinematic, but the SLOW, flaky lane (~10-20 min, no fast option). Use for hero moments. Off = fast, reliable HeyGen talking-head (still background). Re-shoot + re-animate to apply."
                              className={`w-full rounded-md border px-2 py-1 text-[10px] font-semibold disabled:opacity-40 ${String(s.live_bg) === "true" ? "border-[#60a5fa] bg-[#60a5fa]/15 text-[#93c5fd]" : "border-line text-ink-dim hover:border-line-strong"}`}
                            >{String(s.live_bg) === "true" ? "🎬 Live bg · Kling ✓" : "🎬 Live background"}</button>
                          )}
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(i, s)} className="flex-1 rounded-md border border-[#a855f7]/40 px-1.5 py-1 text-[10px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">✎ Edit</button>
                            <button onClick={() => toggleDrop(i)} title={dropped.has(i) ? "Rejected - tap to keep" : "Kept - tap to reject"} className={`flex-1 rounded-md border px-1.5 py-1 text-[10px] font-semibold ${dropped.has(i) ? "border-alert/50 text-alert hover:bg-alert/10" : "border-line text-ink-dim hover:text-ink"}`}>{dropped.has(i) ? "✗ Rejected" : "✓ Keep"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="tabular text-xs font-bold text-ink">Scene {i + 1}</span>
                    <span className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-faint">{s.start}-{s.end}</span>
                    <span className="text-[11px] font-semibold text-ink-dim">{s.beat}</span>
                    <span className={`tabular rounded border px-1.5 py-0.5 text-[9px] font-bold ${role.cls}`}>{role.label}</span>
                    {s.role !== "graphic" && (
                      <span className="ml-auto flex gap-1.5">
                        {isStudio && <button onClick={() => openCallout(i)} title="Add a frosted-glass offer callout that appears ON this scene (each scene can have its own)" className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${sceneCallouts[String(i)] ? "border-[#ffcb05]/60 bg-[#ffcb05]/10 text-[#ffcb05]" : "border-line text-ink-dim hover:text-ink"}`}>{coOpen === i ? "Close" : sceneCallouts[String(i)] ? "🪟 Callout ✓" : "🪟 Callout"}</button>}
                        <button onClick={() => openEdit(i, s)} className="rounded-md border border-[#a855f7]/40 px-2 py-0.5 text-[10px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">{editIdx === i ? "Close" : "✎ Edit scene"}</button>
                      </span>
                    )}
                  </div>
                  {/* PER-SCENE offer callout editor (frosted glass), appears ON this scene during the cut. */}
                  {coOpen === i && (
                    <div className="mb-2 rounded-lg border border-[#ffcb05]/30 bg-[#ffcb05]/[0.04] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-[#fbbf24]">🪟 On-screen callout for Scene {i + 1}</span>
                        <span className="tabular text-[10px] uppercase tracking-[0.15em] text-ink-faint">frosted glass · animated</span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <label className="text-[10px] text-ink-faint">Eyebrow<input value={coDraft.kick} onChange={(e) => setCoDraft((c) => ({ ...c, kick: e.target.value }))} maxLength={40} placeholder="Limited offer" className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] text-ink outline-none focus:border-[#ffcb05]" /></label>
                            <label className="text-[10px] text-ink-faint">Headline<input value={coDraft.line} onChange={(e) => setCoDraft((c) => ({ ...c, line: e.target.value }))} maxLength={80} placeholder="Download MoMo & register" className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] text-ink outline-none focus:border-[#ffcb05]" /></label>
                            <label className="text-[10px] text-ink-faint">Offer (chip)<input value={coDraft.num} onChange={(e) => setCoDraft((c) => ({ ...c, num: e.target.value }))} maxLength={24} placeholder="1GB" className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] font-bold text-ink outline-none focus:border-[#ffcb05]" /></label>
                            <label className="text-[10px] text-ink-faint">Offer suffix<input value={coDraft.suffix} onChange={(e) => setCoDraft((c) => ({ ...c, suffix: e.target.value }))} maxLength={24} placeholder="FREE" className="mt-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[13px] text-ink outline-none focus:border-[#ffcb05]" /></label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-ink-faint">Accent</span>
                            {["#ffcb05", "#22c55e", "#5aa2ff", "#ff7ac0", "#ffffff"].map((h) => (
                              <button key={h} onClick={() => setCoDraft((c) => ({ ...c, accent: h }))} title={h} style={{ background: h }} className={`h-6 w-6 rounded-md border-2 transition ${coDraft.accent === h ? "border-ink" : "border-transparent"}`} />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button onClick={() => saveCallout(i)} className="rounded-lg border border-ready/50 px-3 py-1.5 text-xs font-bold text-ready hover:bg-ready/10">Save callout</button>
                            {sceneCallouts[String(i)] && <button onClick={() => saveCallout(i, true)} className="rounded-lg border border-alert/40 px-3 py-1.5 text-xs font-semibold text-alert hover:bg-alert/10">Remove</button>}
                            <button onClick={() => setCoOpen(null)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink">Cancel</button>
                          </div>
                          <p className="text-[10px] text-ink-faint">Re-stitch after saving to see it. It slides in near the top while this scene plays.</p>
                        </div>
                        {/* live mini-preview */}
                        <div className="relative flex h-[150px] w-[84px] items-start justify-center overflow-hidden rounded-lg border border-line bg-gradient-to-br from-[#1b2338] via-[#241a2e] to-[#0d1017]">
                          <div className="mt-3 w-[74px] rounded-[8px] border border-white/40 bg-gradient-to-b from-white/[0.16] to-white/[0.05] px-1.5 py-1 text-center shadow-lg">
                            {coDraft.kick && <div className="text-[5px] font-bold uppercase tracking-[0.12em] text-white/90">{coDraft.kick}</div>}
                            {coDraft.line && <div className="mt-0.5 text-[7px] font-bold leading-tight text-white">{coDraft.line}</div>}
                            {(coDraft.num || coDraft.suffix) && (
                              <div className="mt-1">
                                {coDraft.num && <span className="rounded-[4px] px-1 py-0.5 text-[11px] font-extrabold leading-none text-[#0c0d10]" style={{ background: coDraft.accent }}>{coDraft.num}</span>}
                                {coDraft.suffix && <span className="ml-0.5 align-middle text-[6px] font-extrabold text-white">{coDraft.suffix}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="text-[13px] text-ink-dim"><span className="text-ink-faint">📍 {s.location}</span></div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎥</span> {s.shot}</div>
                  <div className="mt-1 text-[13px] text-ink-dim"><span className="text-ink-faint">🎬</span> {s.blocking} <span className="text-ink-faint">· {s.performance}</span></div>
                  {s.vo_line && <div className="mt-2 rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 px-3 py-2 text-[13px] text-ink">🎙️ “{s.vo_line}”</div>}
                  {s.role === "b-roll" && (() => {
                    // Prefer the REAL TTS slice duration once the voiceover exists (exact gate); before that,
                    // estimate from word count at ~2.5 words/sec. Flag anything genuinely over the 8s b-roll cap.
                    const real = (production as { scene_audio?: { scene: number; duration?: number }[] })?.scene_audio?.find?.((e) => Number(e.scene) === i)?.duration;
                    const words = (s.vo_line || "").trim().split(/\s+/).filter(Boolean).length;
                    const hasReal = typeof real === "number" && real > 0;
                    const secs = hasReal ? real : words / 2.5;
                    const over = hasReal ? real > 8.3 : words > 20;
                    return over ? <div className="mt-1 text-[11px] font-semibold text-amber-400">⚠ This b-roll VO is ~{secs.toFixed(0)}s{hasReal ? " (measured)" : ` (${words} words)`} — over the 8s b-roll cap. Tighten it via ✎ Edit scene → ✨ Rewrite with AI so it fits one clip.</div> : null;
                  })()}
                  {s.caption && <div className="mt-1 text-[12px] text-ink-faint">CC: {String(s.caption).replace(/\s*\|\s*/g, ", ").replace(/\s+([,.;:!?])/g, "$1")}</div>}
                  {s.motion_prompt && <div className="mt-1 text-[12px] text-ink-faint">↗ Motion: {s.motion_prompt}</div>}
                  {s.graphics?.length > 0 && <div className="mt-1 text-[12px] text-ink-faint">▣ {s.graphics.join(" · ")}</div>}
                  <div className="mt-1 text-[12px] text-ink-faint">🎵 {s.music_sfx} {s.transition ? `· ⟶ ${s.transition}` : ""}</div>
                  {clipFailed && clip?.error && <div className="mt-2 break-words rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 text-[11px] text-alert">⚠ Clip failed: {clip.error}</div>}
                  {editIdx === i && (
                    <div className="mt-3 space-y-3 rounded-lg border border-[#a855f7]/30 bg-[#a855f7]/5 p-3">
                      {/* Script */}
                      <div className="space-y-2">
                        <div className="tabular text-[10px] uppercase tracking-[0.2em] text-[#c79bff]">Script for this scene</div>
                        <Area label="Voiceover line (spoken)" v={ed.vo} set={(x) => setEd((e) => ({ ...e, vo: x }))} />
                        <Field label="Caption (burned-in)" v={ed.caption} set={(x) => setEd((e) => ({ ...e, caption: x }))} />
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[150px] flex-1"><Field label="Ask the producer to rewrite (optional)" v={aiInstr} set={setAiInstr} placeholder="e.g. punchier, lead with the free data" /></div>
                          <button onClick={() => aiRewrite(i)} disabled={aiBusy} className="rounded-lg border border-[#a855f7]/40 px-3 py-2 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{aiBusy ? "✨ Writing…" : "✨ Rewrite with AI"}</button>
                        </div>
                        <Uploader kind="vo" accept="audio" label="Upload my own VO (ElevenLabs file) - recommended" current={ed.voAudio || null} onUploaded={(u) => setEd((e) => ({ ...e, voAudio: u }))} />
                        <p className="text-[10px] text-ink-faint">Optional. If you drop your own read here, I lip-sync the clip to it; otherwise I generate the voice in-platform.</p>
                      </div>
                      {/* Scene direction (the visual prompt) = The Final Cut only. In Script & Voice you edit only
                          the words above (a re-shoot belongs to the visual build, not the script stage). */}
                      {isStudio && (<div className="space-y-2 border-t border-line pt-3">
                        <div className="tabular text-[10px] uppercase tracking-[0.2em] text-[#c79bff]">Scene direction - the full prompt (changing these needs a re-shoot)</div>
                        {creatives.length > 0 && (
                          <div>
                            <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Scene reference (optional) - pin a Set &amp; Wardrobe image to lock THIS scene&apos;s face, outfit &amp; set (overrides the global guide here)</div>
                            <div className="flex flex-wrap gap-2">
                              {creatives.slice(0, 12).map((c) => (
                                <button key={c.url} type="button" onClick={() => setEd((e) => ({ ...e, ref: e.ref === c.url ? "" : c.url }))}
                                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition ${ed.ref === c.url ? "border-[#a855f7]" : "border-line hover:border-[#a855f7]/50"}`}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={c.url} alt="scene reference" className="h-full w-full object-cover" />
                                  {ed.ref === c.url && <span className="absolute inset-0 flex items-center justify-center bg-[#a855f7]/40 text-base font-bold text-white">✓</span>}
                                </button>
                              ))}
                            </div>
                            {ed.ref && <button type="button" onClick={() => setEd((e) => ({ ...e, ref: "" }))} className="mt-1 text-[10px] text-ink-faint hover:text-ink">✕ Clear scene reference (use the global guide)</button>}
                          </div>
                        )}
                        <Field label="Location / world" v={ed.location} set={(x) => setEd((e) => ({ ...e, location: x }))} />
                        <Uploader kind="phone" accept="image" label="Phone screen image (optional) - shown on the phone if she holds one" current={ed.phone || null} onUploaded={(u) => setEd((e) => ({ ...e, phone: u }))} />
                        <Area label="Action / blocking" v={ed.blocking} set={(x) => setEd((e) => ({ ...e, blocking: x }))} />
                        <Field label="Shot / framing" v={ed.shot} set={(x) => setEd((e) => ({ ...e, shot: x }))} />
                        <Area label="Performance / expression" v={ed.performance} set={(x) => setEd((e) => ({ ...e, performance: x }))} />
                        <Field label="Motion" v={ed.motion} set={(x) => setEd((e) => ({ ...e, motion: x }))} />
                        {/* HERO shot (b-roll only): render this scene in Veo 3.1 (4K + native audio) instead of Kling */}
                        {s.role === "b-roll" && (
                          <div>
                            <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Quality</div>
                            <button onClick={() => setEd((e) => ({ ...e, hero: e.hero === "true" ? "false" : "true" }))} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${ed.hero === "true" ? "border-[#60a5fa] bg-[#60a5fa]/15 text-[#93c5fd]" : "border-line text-ink-dim hover:border-line-strong"}`}>{ed.hero === "true" ? "✨ Hero shot · Veo 4K ✓" : "✨ Make this a Hero shot (Veo 4K)"}</button>
                            <p className="mt-1 text-[10px] text-ink-faint">Renders this b-roll in Veo 3.1 (4K, native ambient audio) - premium, slower + pricier. Needs a re-shoot.</p>
                          </div>
                        )}
                        {/* Live background moved to the per-scene controls under the preview image (left) - a
                            cleaner user journey than buried in the edit box. See toggleLiveBg below. */}
                      </div>)}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => saveScene(i)} className="rounded-lg border border-ready/50 px-3 py-1.5 text-xs font-bold text-ready hover:bg-ready/10">Save changes</button>
                        {isStudio && <button onClick={() => reshootScene(i)} className="btn-brand rounded-lg px-3 py-1.5 text-xs font-bold">↻ Re-shoot this scene</button>}
                        <button onClick={() => closeEditKeep(editIdx)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:text-ink">Cancel</button>
                      </div>
                      <p className="text-[10px] text-ink-faint">{isStudio ? "Save changes keeps the image and just updates the script. Re-shoot re-renders only this scene. The rest stay untouched." : "Edit the words for this scene, then Save changes. The visual build (framing, re-shoot) happens in The Final Cut."}</p>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>

          {sb.legal && <div className="rounded-xl border border-line bg-surface-2 p-3 text-[11px] text-ink-faint"><b>Legal (verbatim):</b> {sb.legal}</div>}

          {/* ── The 8-step gated production wizard ── */}
          <div className="space-y-3">
            <WizardSpine
              steps={([["concept", "Script"], ["voice", "Voice"], ["scenes", "Scenes"], ["audio", "Music"], ["stitch", "Stitch"], ["showreel", "Showreel"]] as const).filter(([key]) => showStep(key)).map(([key, label], idx) => ({ key, label, n: idx + 1, state: stepState(key) }))}
              onJump={(k) => document.getElementById(`step-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
            {/* 1 · Brief & concept (foundation stage) */}
            {showStep("concept") && <StepShell n={stepNum("concept")} title="Brief & concept" desc={`Tell me about the video and I direct an expert shot plan for ${name} - talking (a-roll) scenes and scene (b-roll) shots. Review the scenes above, edit any with ✎ Edit scene (the full prompt - location, framing, action, performance, motion + script), or ↻ Regenerate, then approve.`} state={stepState("concept")} anchor="step-concept" gate={renderGate("concept", "No problem - tweak any scene above or hit ↻ Regenerate at the top, then Accept when it reads right.")} />}

            {/* 2 · Voice (foundation stage) */}
            {showStep("voice") && (<>
            <StepShell n={stepNum("voice")} title="Voice" desc={`Pick the voice ${name} speaks in, then generate the full voiceover - every talking (a-roll) scene is lip-synced to it and the scenes are built to its real timing.`} state={stepState("voice")} anchor="step-voice" gate={renderGate("voice", "Set a voice above (auto-match or choose one), then Accept.")}>
              {unlocked("voice") ? (
                !needsVoice ? (
                  <p className="text-[12px] text-ink-faint">No talking scenes in this storyboard, so no voice is needed.</p>
                ) : (
                  <>
                    {/* Continuity pass: re-flow the script so the kept scenes read as one seamless script */}
                    <div className="mb-3 rounded-lg border border-[#a855f7]/20 bg-[#a855f7]/5 p-3">
                      <p className="text-[12px] text-ink-dim">Optional producer pass: re-flow the voiceover so it reads as one seamless script before you voice it.</p>
                      <button onClick={reflowScript} disabled={reflowBusy} className="mt-2 rounded-lg border border-[#a855f7]/40 px-3 py-1.5 text-xs font-semibold text-[#c79bff] hover:bg-[#a855f7]/10 disabled:opacity-50">{reflowBusy ? "✨ Re-flowing the script…" : "✨ Re-flow script for continuity"}</button>
                    </div>
                    <VoicePicker influencerId={influencerId} name={name} voiceId={voiceId} voiceName={voiceName} voicePreview={voicePreview}
                      onSet={(v) => {
                        setVoiceId(v.voice_id); setVoiceName(v.voice_name); setVoicePreview(v.preview_url || "");
                        // The server clears stale (old-voice) clips on a voice change - pull the fresh
                        // production so the wizard shows the animate steps need re-rendering with the new voice.
                        fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.production) setProduction(d.production); }).catch(() => {});
                        setVoiceoverUrl(""); // voice changed → the old full take no longer applies; re-generate
                        // Do NOT auto-approve on selection - it jumped past the test. You test (v2/v3,
                        // generate + listen) and then Accept (or generating the full voiceover approves it).
                      }} />
                    {/* Voice model: v2 stable vs v3 expressive. Always visible in the Voice step. */}
                    <div className="mt-3 rounded-lg border border-line bg-surface-2/40 p-3">
                      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Voice model</div>
                      <div className="flex gap-2">
                        {([["v2", "Stable", "Rock-solid + consistent. What you hear is exactly what ships."], ["v3", "Expressive", "More realistic, dynamic delivery + audio tags. Best on Designed/Instant voices (not a PVC)."]] as const).map(([m, label, desc]) => (
                          <button key={m} onClick={() => setVoiceModel(m)} className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs ${voiceModel === m ? "border-[#a855f7] bg-[#a855f7]/10 text-ink" : "border-line text-ink-dim hover:border-[#a855f7]/40"}`}>
                            <div className="font-bold">{label} <span className="text-ink-faint">({m})</span></div>
                            <div className="mt-0.5 text-[10px] leading-tight text-ink-faint">{desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* TEST THE DELIVERY: A/B v2 vs v3 on the real scene copy before committing to the take. */}
                    <div className="mt-3 rounded-lg border border-line bg-surface-2/40 p-3">
                      <div className="tabular mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                        <span>🎧 Voice preview <span className="font-normal normal-case tracking-normal text-ink-faint">· doesn&apos;t change your script</span></span>
                        {sb && sb.scenes.some((s) => (s.vo_line || "").trim()) && (
                          <select onChange={(e) => { const v = e.target.value; if (v === "") { setPreviewSceneIdx(null); return; } const idx = Number(v); setPreviewSceneIdx(idx); setPreviewText(String(sb?.scenes?.[idx]?.vo_line || "")); setPreviewSaved(false); }} value={previewSceneIdx == null ? "" : String(previewSceneIdx)} className="rounded border border-line bg-surface-1 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-ink-dim">
                            <option value="">Load a scene line…</option>
                            {sb.scenes.map((s, i) => (s.vo_line || "").trim() ? <option key={i} value={i}>Scene {i + 1}</option> : null)}
                          </select>
                        )}
                      </div>
                      <textarea value={previewText} onChange={(e) => { setPreviewText(e.target.value); setPreviewSaved(false); }} rows={2} placeholder="Type or load a scene line to test…" className="w-full resize-none rounded-lg border border-line bg-surface-1 px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint" />
                      <input value={previewAccent} onChange={(e) => setPreviewAccent(e.target.value)} placeholder="Accent cue for v3 (e.g. South African) — optional" className="mt-2 w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint" />
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => runPreview("v2")} disabled={!!previewBusy || !previewText.trim()} className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-dim hover:border-[#a855f7]/40 hover:text-ink disabled:opacity-50">{previewBusy === "v2" ? "Synthesising…" : "▶ Preview v2 (Stable)"}</button>
                        <button onClick={() => runPreview("v3")} disabled={!!previewBusy || !previewText.trim()} className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-dim hover:border-[#a855f7]/40 hover:text-ink disabled:opacity-50">{previewBusy === "v3" ? "Synthesising…" : "▶ Preview v3 (Expressive)"}</button>
                      </div>
                      {(() => {
                        const edited = previewSceneIdx != null && !previewSaved && previewText.trim() !== String(sb?.scenes?.[previewSceneIdx]?.vo_line || "").trim();
                        return previewSceneIdx != null ? (
                          <>
                            {edited && <p className="mt-2 text-[11px] font-semibold text-[#fbbf24]">⚠ You&apos;ve changed this line - it won&apos;t ship until you save it to the scene.</p>}
                            <button onClick={savePreviewToScene} disabled={previewSaved || !previewText.trim()} className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-xs font-bold transition ${previewSaved ? "border-ready/50 text-ready" : edited ? "border-[#f59e0b] bg-[#f59e0b]/15 text-[#fbbf24]" : "border-[#a855f7]/50 text-[#c79bff] hover:bg-[#a855f7]/10"} disabled:opacity-60`}>{previewSaved ? `✓ Saved to Scene ${previewSceneIdx + 1} — re-run the voiceover to hear it` : `💾 Save this line to Scene ${previewSceneIdx + 1} (so it ships)`}</button>
                          </>
                        ) : null;
                      })()}
                      {previewUrl && <audio key={previewUrl} src={previewUrl} controls autoPlay className="mt-2 h-9 w-full" />}
                      {previewErr && <p className="mt-1.5 text-[11px] text-red-400">{previewErr}</p>}
                      <p className="mt-1.5 text-[10px] leading-tight text-ink-faint">This is a <b>preview only</b> - to change what ships, load a scene, edit it, then <b>Save this line to the scene</b> (or use ✎ Edit scene), and <b>re-run the voiceover</b>. v3 adds expressive tags (+ the accent cue).</p>
                    </div>
                    {/* Voice SPEED: default + slower/faster. Faster often reads more natural/energetic. */}
                    <div className="mt-3 rounded-lg border border-line bg-surface-2/40 p-3">
                      <div className="tabular mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-ink-faint"><span>Voice speed</span><span className="tabular text-[#93c5fd]">{voiceSpeed === 1 ? "Default (1.0×)" : `${voiceSpeed.toFixed(2)}×`}</span></div>
                      <div className="flex gap-2">
                        {([[0.9, "Slower"], [1, "Default"], [1.1, "Faster"], [1.2, "Fastest"]] as const).map(([s, label]) => (
                          <button key={s} onClick={() => setVoiceSpeed(s)} className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs ${Math.abs(voiceSpeed - s) < 0.001 ? "border-[#60a5fa] bg-[#60a5fa]/10 text-ink" : "border-line text-ink-dim hover:border-[#60a5fa]/40"}`}>
                            <div className="font-bold">{label}</div>
                            <div className="mt-0.5 text-[10px] text-ink-faint tabular">{s.toFixed(2)}×</div>
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] text-ink-faint">A little faster often sounds more natural and energetic. Changing it clears the take so you re-generate to hear it.</p>
                    </div>
                    {/* THE FULL VOICEOVER: one continuous take the producer listens to before animating. */}
                    {voiceId && (
                      <div className="mt-3 rounded-lg border border-line bg-surface-2/40 p-3">
                        <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Full voiceover</div>
                        <p className="mb-2 text-[12px] text-ink-dim">Generate the ENTIRE script as one continuous take and listen to it - this exact audio is what ships, and every scene is sliced from it, so the voice stays identical throughout. Re-run until it sounds right.</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={genVoiceover} disabled={voBusy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{voBusy ? "🎙️ Generating the full voiceover…" : voiceoverUrl ? "↻ Re-run the voiceover" : "🎙️ Generate the full voiceover"}</button>
                          {voiceoverUrl && <audio src={voiceoverUrl} controls className="h-9" />}
                        </div>
                        {voiceoverUrl && <p className="mt-2 text-[11px] text-ready">✓ Generated - have a listen. Re-run until it sounds right, then hit <b>✓ Accept &amp; continue</b> below. This exact take is what ships (every a-roll lip-syncs to it, b-roll narrates over it), so the voice stays identical across all scenes.</p>}
                      </div>
                    )}
                    {/* Use your OWN recorded voice instead - Scribe aligns + we slice it per scene. */}
                    <VoiceoverUpload influencerId={influencerId} presetUrl={String((production as { my_vo_url?: string })?.my_vo_url || "")} onDone={() => {
                      fetch(`/api/influencers/${influencerId}/storyboard`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d?.production) { setProduction(d.production); setVoiceoverUrl(`${d.production.voiceover_url || ""}${d.production.voiceover_url ? `?t=${Date.now()}` : ""}`); } }).catch(() => {});
                      accept("voice");
                    }} />
                  </>
                )
              ) : <LockHint />}
            </StepShell>
            {/* Foundation stage done → hand off to The Final Cut for the visual build. */}
            {mode === "foundation" && approved.has("voice") && (
              <a href={`/setup/influencers/${influencerId}/producer`} className="btn-brand mt-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold">🎬 Script &amp; voice locked - continue to The Final Cut →</a>
            )}
            </>)}

            {/* 3 · Scenes - the scene-by-scene build board (per-scene controls live on the cards above) */}
            {showStep("scenes") && (<>
            {mode === "studio" && !approved.has("voice") && (
              <a href={`/setup/influencers/${influencerId}/voice`} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] px-4 py-3 text-sm font-bold text-[#fbbf24]">🎙️ You can shoot keyframes now, but animation waits for the locked voice - finish Script &amp; Voice →</a>
            )}
            <StepShell n={stepNum("scenes")} title="Build the scenes" desc={`Shoot each scene's keyframe and animate it. Work scene by scene on the cards above (🎬 build · 🎞️ animate · ✎ edit · ✓ keep / ✗ reject), or build the whole board at once here. Talking (a-roll) scenes lip-sync to the voice; scene (b-roll) shots get natural motion.`} state={stepState("scenes")} anchor="step-scenes" gate={renderGate("scenes", "Every kept scene needs a finished clip. Build any that are still missing (or reject a scene), then Accept.")}>
              {unlocked("scenes") ? (
                <div className="space-y-3">
                  <div>
                    <div className="tabular mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Frame size</div>
                    <RatioPicker value={boardRatio} onChange={setBoardRatio} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => shootAll(boardRatio)} disabled={shooting || rendering} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{shooting && shootingRole === "" ? "📸 Shooting all keyframes…" : "📸 Shoot all keyframes"}</button>
                    <button onClick={() => animateAll(false)} disabled={shooting || wholeBoardBusy || animatingScenes.size > 0 || builtCount === keptScenes.length} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{wholeBoardBusy ? "🎞️ Animating…" : builtCount === keptScenes.length && keptScenes.length > 0 ? "✓ All scenes animated" : builtCount > 0 ? `🎞️ Animate remaining (${keptScenes.length - builtCount})` : "🎞️ Animate all"}</button>
                    {builtCount > 0 && <button onClick={() => animateAll(true)} disabled={shooting || wholeBoardBusy || animatingScenes.size > 0} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-dim hover:text-ink disabled:opacity-50" title="Re-render EVERY clip from scratch (costs more) - only if you want a full redo">↻ Re-animate all</button>}
                    <button onClick={() => setSpeedMode((v) => !v)} title="Draft speed renders PREVIEW clips fast (a-roll 720p, b-roll on the quick DoP engine) for quick team review. Keyframes stay full quality. When happy, 'Render final quality' at the Stitch step conforms every draft to 1080p / Veo from the same keyframe - no drift. Turn OFF to render full quality from the start." className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition ${speedMode ? "border-[#60a5fa] bg-[#60a5fa]/15 text-[#bfdbfe]" : "border-line bg-surface-2/50 text-ink-faint hover:text-ink"}`}><span aria-hidden>⚡</span> Draft speed <span className={`tabular ml-0.5 rounded px-1.5 py-0.5 text-[10px] font-extrabold ${speedMode ? "bg-[#60a5fa] text-black" : "bg-surface-2 text-ink-faint"}`}>{speedMode ? "720p" : "1080p"}</span></button>
                  </div>
                  {speedMode && <p className="text-[11px] text-[#93c5fd]">⚡ Draft speed ON - previews render fast (a-roll 720p, b-roll on the quick engine) for review. Important: a 720p draft clip STAYS 720p in the final unless you upgrade it - hit <b>🎬 Render final quality</b> at the Stitch step before delivery, or turn Draft speed OFF and re-animate.</p>}
                  <p className="text-[12px] text-ink-faint"><b className="text-ready">{builtCount}/{keptScenes.length}</b> kept scenes have a finished clip. <b>Animate remaining</b> only renders the missing ones (it never re-runs clips you already have).</p>
                  {(rendering || wholeBoardBusy || animatingScenes.size > 0) && <p className="rounded-md border border-[#38bdf8]/25 bg-[#38bdf8]/[0.06] px-3 py-1.5 text-[11px] text-[#7dd3fc]">🛈 Safe to close this tab or come back later - rendering keeps running on our servers, and everything will be here when you return. A b-roll clip can take up to ~40 min when the queue is busy.</p>}
                  {/* IN-STEP SCENE CAROUSEL: every scene at a glance - edit or re-animate any without scrolling
                      up. ✎ Edit jumps to the scene's card (opens the editor); on Save it returns you here. */}
                  <div id="scenes-strip">
                    <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Every scene - edit or re-animate right here</div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {sb.scenes.map((s, i) => {
                        if (dropped.has(i) || s.role === "graphic") return null;
                        const rl = ROLE[s.role] ?? ROLE["a-roll"];
                        const clip = clipFor(i); const shot = shotFor(i);
                        const failed = clip?.status === "failed";
                        const isRendering = animatingScenes.has(i) || (wholeBoardBusy && !clip?.url && clip?.status !== "failed" && (renderingRole === "" || renderingRole === s.role));
                        return (
                          <div key={i} className="w-[104px] shrink-0 rounded-lg border border-line bg-surface-1 p-1.5">
                            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-md bg-black">
                              {clip?.url
                                ? <video src={clip.url} muted playsInline className="h-full w-full object-cover" />
                                /* eslint-disable-next-line @next/next/no-img-element */
                                : shot?.url ? <img src={shot.url} alt="" className="h-full w-full object-cover" />
                                : <div className="flex h-full items-center justify-center text-[9px] text-ink-faint">not shot</div>}
                              {isRendering && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"><RenderTimer start={renderStarts[i] ?? Date.now()} hint={String((s as { live_bg?: string }).live_bg) === "true" ? "10-25m" : s.role === "a-roll" ? "2-6m" : speedMode ? "3-8m" : "10-40m"} /></div>}
                              {!isRendering && (clip?.url || shot?.url) && <button onClick={() => (clip?.url ? setVzoom(clip.url as string) : setZoom(shot!.url as string))} title={clip?.url ? "Play this scene full size" : "Preview the keyframe full size"} className="absolute right-0.5 top-0.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-[10px] text-white transition hover:bg-black/90">👁</button>}
                              {!isRendering && failed && <div className="absolute inset-0 flex items-center justify-center bg-alert/25 text-[9px] font-bold text-alert">⚠ failed</div>}
                              {!isRendering && !failed && clip?.url && !dirtyScenes.has(i) && <span className="absolute bottom-0.5 left-0.5 rounded bg-ready/80 px-1 text-[7px] font-bold text-black">✓</span>}
                              {!isRendering && dirtyScenes.has(i) && <span className="absolute inset-x-0 top-0 rounded-t bg-[#a855f7]/90 px-0.5 text-center text-[7px] font-bold text-white" title="Changed - re-animate to apply">⟳ re-render</span>}
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="tabular text-[10px] font-bold text-ink">Scene {i + 1}</span>
                              <span className={`tabular rounded border px-1 text-[8px] font-bold ${rl.cls}`}>{rl.label}</span>
                            </div>
                            <div className="mt-1 flex gap-1">
                              <button onClick={() => editFromStrip(i, s)} className="flex-1 rounded border border-[#a855f7]/40 px-1 py-0.5 text-[9px] font-semibold text-[#c79bff] hover:bg-[#a855f7]/10">✎ Edit</button>
                              <button onClick={() => animateScene(i)} disabled={animatingScenes.has(i) || !approved.has("voice") || !shot?.url} title={!shot?.url ? "Shoot the keyframe first" : !approved.has("voice") ? "Finish Script & Voice first" : clip?.url ? "Re-animate this scene" : "Animate this scene"} className="flex-1 rounded border border-[#60a5fa]/40 px-1 py-0.5 text-[9px] font-semibold text-[#93c5fd] hover:bg-[#60a5fa]/10 disabled:opacity-40">{clip?.url ? "↻ Anim" : "🎞️ Anim"}</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {wardrobeLock ? <p className="text-[11px] text-ink-faint"><span className="text-[#c4b5fd]">🔒 Wardrobe locked:</span> {wardrobeLock} <span className="text-ink-faint">(set on the Reference images step)</span></p> : null}
                </div>
              ) : <LockHint msg={isStudio ? <>🔒 Finish <b>Script &amp; Voice</b> first (see the link above) - it sets the voice these scenes are built to.</> : undefined} />}
            </StepShell>

            {/* 4 · Music & ambient */}
            <StepShell n={stepNum("audio")} title="Music & ambient" desc="I generate the music bed and the ambient room tone for the world. Have a listen before we cut it together." state={stepState("audio")} anchor="step-audio" gate={renderGate("audio", "Re-generate the audio if it's not right, then Accept. The cut reuses exactly these beds.")}>
              {unlocked("audio") ? (
                <>
                  <button onClick={genAudio} disabled={audioBusy} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{audioBusy ? "🎵 Generating audio…" : audioReady ? "↻ Re-generate audio" : "🎵 Generate music & ambient"}</button>
                  {production?.audio_status === "done" ? (
                    <div className="mt-3 space-y-2">
                      {production?.music_url && <div><div className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Music bed</div><audio src={production.music_url} controls className="mt-1 h-8 w-full max-w-sm" /></div>}
                      {production?.ambient_url && <div><div className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Ambient tone</div><audio src={production.ambient_url} controls className="mt-1 h-8 w-full max-w-sm" /></div>}
                      {(!production?.music_url || !production?.ambient_url) && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
                          ⚠ {!production?.music_url && !production?.ambient_url ? "Neither bed generated" : !production?.ambient_url ? "The ambient tone didn't generate" : "The music bed didn't generate"}{production?.audio_error ? ` — ${production.audio_error}` : ""}. Hit ↻ Re-generate audio, or just <b>Accept</b> — the stitch creates the music + ambient automatically at the final cut.
                        </div>
                      )}
                    </div>
                  ) : !audioBusy && (
                    <p className="mt-2 text-[11px] text-ink-faint">Optional - generate to preview the beds, or just <b>Accept</b> to skip; the stitch will create the music + ambient for you automatically.</p>
                  )}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 5 · Stitch */}
            <StepShell n={stepNum("stitch")} title="Stitch the cut" desc={`I edit it together for continuity: kept clips in order with clean cuts, a continuous voiceover, the music + ambient mixed underneath${(production?.brief as { logoUrl?: string })?.logoUrl ? " and your uploaded logo" : ""} - one finished ${sb.format} ad. Captions are optional (off by default).`} state={stepState("stitch")} anchor="step-stitch" gate={renderGate("stitch", "Re-stitch if the cut isn't right (you can re-render any clip or the audio first), then Accept.")}>
              {unlocked("stitch") ? (
                <>
                  {/* Optional closing clip / end card - the LAST spot to upload the tail of the video. */}
                  <div className="mb-3 rounded-lg border border-line bg-surface-2/40 p-3">
                    <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Closing clip / end card (optional)</div>
                    {endCardUrl ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {endCardKind === "video"
                          ? <video src={endCardUrl} controls playsInline className="aspect-[9/16] w-24 rounded-lg border border-ready/40 bg-black object-cover" />
                          /* eslint-disable-next-line @next/next/no-img-element */
                          : <img src={endCardUrl} alt="end card" className="aspect-[9/16] w-24 rounded-lg border border-ready/40 object-cover" />}
                        <div className="text-[12px] text-ink-dim">Appended to the end of the cut.<br /><button onClick={() => setEndCardUrl("")} className="mt-1 rounded border border-line px-2 py-0.5 text-[11px] text-ink-faint hover:text-ink">Remove</button></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          {(["video", "image"] as const).map((k) => (
                            <button key={k} onClick={() => setEndCardKind(k)} className={`rounded-lg border px-3 py-1 text-xs font-semibold ${endCardKind === k ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{k === "video" ? "MP4 / video" : "Image"}</button>
                          ))}
                        </div>
                        <Uploader kind="endcard" accept={endCardKind} label="Upload your closing clip / image" current={null} onUploaded={setEndCardUrl} />
                        <p className="text-[10px] text-ink-faint">Optional. Your brand close (logo sting, offer card, sign-off) - appended after the last scene.</p>
                      </div>
                    )}
                  </div>

                  {/* Callouts are now PER-SCENE - add them on each scene card above via the 🪟 Callout button, so
                      different scenes can carry different offers, each timed to its own shot. */}
                  <div className="mb-3 rounded-lg border border-[#ffcb05]/25 bg-[#ffcb05]/[0.04] p-3 text-[11px] text-ink-dim">
                    🪟 <b className="text-[#fbbf24]">On-screen offer callouts are per scene.</b> Scroll up to any scene card and hit <b>🪟 Callout</b> to add a frosted-glass offer that appears on THAT shot - each scene can have its own. {Object.keys(sceneCallouts).length > 0 ? <span className="text-ink-faint">Currently on {Object.keys(sceneCallouts).length} scene{Object.keys(sceneCallouts).length > 1 ? "s" : ""}.</span> : <span className="text-ink-faint">None added yet.</span>}
                  </div>

                  {/* FULL-QUALITY CONFORM: draft previews are 720p (a-roll) / fast DoP (b-roll) proxies. Before
                      delivery, re-render them at full quality (1080p a-roll, Veo b-roll) from the SAME locked
                      keyframes - same shot, properly rendered, no drift. Shown only while draft clips remain. */}
                  {draftClipCount > 0 && (
                    <div className="mb-3 rounded-lg border-2 border-[#f59e0b]/50 bg-[#f59e0b]/[0.06] px-3 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[12px] font-semibold text-[#fbbf24]">⚠ {draftClipCount} scene{draftClipCount > 1 ? "s are" : " is"} still a draft preview (720p)</span>
                        <button onClick={finalizeClips} disabled={rendering} className="ml-auto rounded-lg border-2 border-[#f59e0b] bg-[#f59e0b]/15 px-3 py-1.5 text-xs font-bold text-[#fbbf24] transition hover:bg-[#f59e0b]/25 disabled:opacity-50">{rendering ? "🎬 Rendering full quality…" : "🎬 Render final quality (1080p)"}</button>
                      </div>
                      <p className="mt-2 text-[11px] text-ink-faint">Re-renders every draft scene at full delivery quality (1080p a-roll, Veo b-roll) from the exact keyframe you approved - the same shot, properly finished, no drift. Full-quality scenes are skipped, so it only re-does the drafts. This takes longer (full engines), then stitch for a client-ready cut.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* GUARD: while draft clips remain, "Stitch the cut" is NOT the primary action - "Render final
                        quality" above is. Stitching a draft needs a deliberate two-click confirm so a 720p cut
                        can't be shipped by accident. */}
                    {draftClipCount > 0 ? (
                      <button onClick={() => { if (!stitchArmed) { setStitchArmed(true); return; } setStitchArmed(false); stitchCut(); }} disabled={assembling} className={`rounded-lg border-2 px-4 py-2 text-sm font-bold disabled:opacity-50 ${stitchArmed ? "border-alert bg-alert/15 text-alert" : "border-[#f59e0b]/60 text-[#fbbf24] hover:bg-[#f59e0b]/10"}`}>{assembling ? "✂️ Stitching…" : stitchArmed ? "⚠ Yes, ship the 720p DRAFT" : "Stitch the draft anyway"}</button>
                    ) : (
                      <button onClick={stitchCut} disabled={assembling} className="btn-brand rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{assembling ? "✂️ Stitching the cut…" : finalUrl ? "↻ Re-stitch" : "✂️ Stitch the cut"}</button>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-dim"><input type="checkbox" checked={stitchCaptions} onChange={(e) => setStitchCaptions(e.target.checked)} className="h-4 w-4 accent-[#a855f7]" /> Burn in captions</label>
                    {production?.assembly_error && !assembling && <span className="text-[11px] text-alert">{production.assembly_error}</span>}
                  </div>
                  {draftClipCount > 0 && <p className="mt-1.5 text-[11px] text-[#fbbf24]">This cut would ship as a <b>720p draft</b>. Hit <b>🎬 Render final quality</b> above for a client-ready delivery.{stitchArmed ? " (Click the amber button again to ship the draft anyway.)" : ""}</p>}
                  {stitchCaptions && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-ink-faint">Caption style:</span>
                      {([["bold", "Bold (default)", "Big uppercase, thick black outline — punchy social look. The house default on all productions."], ["clean", "Clean", "White text with a soft shadow, no box — elegant"], ["highlight", "Highlight", "White on a purple highlight bar — on-brand"], ["sunny", "Sunny", "Bright yellow uppercase with a black outline — energetic"], ["karaoke", "Word-pop ✨", "Word-by-word — each word pops to yellow as it's spoken (TikTok karaoke)"], ["pill", "Pill", "Classic dark rounded pill (the original)"]] as const).map(([k, label, desc]) => (
                        <button key={k} onClick={() => setStitchCaptionStyle(k)} title={desc} className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${stitchCaptionStyle === k ? "border-[#a855f7] bg-[#a855f7]/12 text-ink" : "border-line text-ink-dim hover:border-[#a855f7]/40"}`}>{label}</button>
                      ))}
                    </div>
                  )}
                  {finalUrl && (
                    <div className="mt-4">
                      <div className="tabular mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-ready">The finished cut {draftClipCount > 0 && <span className="rounded bg-[#f59e0b]/85 px-1.5 py-0.5 text-[9px] font-bold text-black">720p DRAFT</span>}</div>
                      <div className="relative inline-block">
                        <video src={finalUrl} controls playsInline className={`rounded-xl border border-ready/40 bg-black ${sb.format.includes("1:1") ? "aspect-square w-72" : "aspect-[9/16] w-64"}`} />
                        {draftClipCount > 0 && <span className="pointer-events-none absolute left-2 top-2 rounded bg-[#f59e0b]/90 px-1.5 py-0.5 text-[9px] font-bold text-black">720p DRAFT</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2"><a href={finalUrl} download={draftClipCount > 0 ? "gas-cut-DRAFT.mp4" : "gas-cut.mp4"} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-dim hover:text-ink">↓ Download{draftClipCount > 0 ? " (draft)" : ""}</a>{draftClipCount > 0 && <span className="text-[11px] text-[#fbbf24]">Not client-ready - render final quality + re-stitch first.</span>}</div>
                    </div>
                  )}
                </>
              ) : <LockHint />}
            </StepShell>

            {/* 6 · Showreel */}
            <StepShell n={stepNum("showreel")} title="Showreel" desc={<>My last call with you: accept the cut into the showreel, or decline it. Only accepted cuts reach the <a href="/showcase" className="text-accent">showcase wall</a> and the shareable reel.</>} state={stepState("showreel")} anchor="step-showreel">
              {unlocked("showreel") ? (
                <>
                {draftClipCount > 0 && <p className="mb-2 text-[11px] font-semibold text-[#fbbf24]">⚠ This cut still contains 720p draft scenes. Render final quality + re-stitch before accepting it to the showcase wall.</p>}
                <div className="flex flex-wrap items-center gap-3">
                  {/* GUARD: accepting a still-draft cut into the public showcase needs a deliberate two-click confirm. */}
                  <button onClick={() => { if (draftClipCount > 0 && !showreelArmed) { setShowreelArmed(true); return; } setShowreelArmed(false); decideShowreel("accept"); accept("showreel"); }} className={`rounded-lg border px-4 py-2 text-sm font-bold ${draftClipCount > 0 && showreelArmed ? "border-alert bg-alert/15 text-alert" : production?.showreel_status === "accepted" ? "border-ready bg-ready/15 text-ready" : "border-ready/40 text-ready hover:bg-ready/10"}`}>{draftClipCount > 0 && showreelArmed ? "⚠ Accept the draft anyway" : "✓ Accept into showreel"}</button>
                  <button onClick={() => { decideShowreel("decline"); accept("showreel"); }} className={`rounded-lg border px-4 py-2 text-sm font-bold ${production?.showreel_status === "declined" ? "border-active bg-active/15 text-active" : "border-active/40 text-active hover:bg-active/10"}`}>✕ Decline</button>
                  {production?.showreel_status === "accepted" && <span className="tabular text-[11px] font-semibold text-ready">● In the showreel</span>}
                  {production?.showreel_status === "declined" && <span className="tabular text-[11px] font-semibold text-active">● Kept out</span>}
                </div>
                </>
              ) : <LockHint />}
            </StepShell>
            </>)}
          </div>
        </div>
      ) : null}
      {celebrate && <Celebration name={name} onDone={() => setCelebrate(false)} />}
      {zoom && <Lightbox url={zoom} onClose={() => setZoom(null)} fill />}
      {vzoom && (
        <div onClick={() => setVzoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <video src={vzoom} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw] rounded-xl border border-line bg-black" />
          <button onClick={() => setVzoom(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-lg text-white hover:bg-black/90">✕</button>
        </div>
      )}
    </div>
  );
}

// One wizard step: numbered badge (green tick when approved), title, description, body. The
// `state` drives the chrome - active glows, done goes green, locked dims.
// `state` drives the chrome - active glows, done goes green, locked dims. When done, the action
// body is hidden (only the green tick + the gate's "Approved · undo" remain). `gate` always shows.
// Persistent progress spine - all 8 stages always visible with state; click to jump. The hero of
// the wizard: the journey IS the interface.
function WizardSpine({ steps, onJump }: { steps: { key: string; label: string; n: number; state: "locked" | "active" | "done" }[]; onJump: (k: string) => void }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  return (
    <div className="sticky top-0 z-20 mb-1 rounded-xl border border-line bg-surface-1/85 px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="tabular text-[10px] uppercase tracking-[0.2em] text-ink-faint">Production · {doneCount}/{steps.length} approved</span>
      </div>
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={s.key} className="flex shrink-0 items-center gap-0.5">
            <button onClick={() => onJump(s.key)} title={s.label} className="group flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-surface-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition ${s.state === "done" ? "bg-ready text-black" : s.state === "active" ? "bg-[#a855f7] text-white shadow-[0_0_12px_rgba(168,85,247,0.6)]" : "bg-surface-2 text-ink-faint"}`}>{s.state === "done" ? "✓" : s.n}</span>
              <span className={`hidden text-[12px] font-semibold sm:inline ${s.state === "active" ? "text-ink" : s.state === "done" ? "text-ready" : "text-ink-faint"}`}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <span className={`h-px w-3 shrink-0 sm:w-5 ${s.state === "done" ? "bg-ready/50" : "bg-line"}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
function StepShell({ n, title, desc, state, gate, preview, children, anchor }: { n: number; title: string; desc: ReactNode; state: "locked" | "active" | "done"; gate?: ReactNode; preview?: ReactNode; children?: ReactNode; anchor?: string }) {
  const ring = state === "active" ? "border-[#a855f7] ring-2 ring-[#a855f7]/50 shadow-[0_0_22px_rgba(168,85,247,0.35)]" : state === "done" ? "border-ready/40 bg-ready/[0.04]" : "border-line opacity-55";
  const badge = state === "done" ? "bg-ready text-black" : state === "active" ? "bg-[#a855f7] text-white" : "bg-surface-2 text-ink-faint";
  return (
    <div id={anchor} className={`scroll-mt-24 rounded-xl border bg-surface-1 p-5 ${ring}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badge}`}>{state === "done" ? "✓" : n}</span>
        <div className="text-sm font-extrabold text-ink">{title}</div>
        {state === "done" && <span className="tabular ml-auto text-[10px] font-semibold uppercase tracking-wide text-ready">approved</span>}
      </div>
      <p className="mt-1.5 text-sm text-ink-dim">{desc}</p>
      {/* action body hides once approved; preview (rendered clips/cut) stays visible always */}
      {state !== "done" && children && <div className="mt-3">{children}</div>}
      {preview}
      {gate}
    </div>
  );
}
function LockHint({ msg }: { msg?: React.ReactNode }) {
  return <p className="text-[11px] text-ink-faint">{msg || "🔒 Finish the previous step to unlock this one."}</p>;
}
// Aspect-ratio chooser for a reference shoot (output format of the final video).
// Pick a creative (made in the Creative section, tagged this role) as the GUIDE the shoot anchors to:
// the references will match its wardrobe, styling, lighting and world. Tap again to clear. Identity
// always stays the locked face - the guide only steers look/world, never who she is.
function GuidePicker({ role, creatives, selected, onPick, onZoom }: {
  role: "a-roll" | "b-roll"; creatives: { url: string; role: string; scene: string }[]; selected: string;
  onPick: (role: "a-roll" | "b-roll", url: string) => void; onZoom: (url: string) => void;
}) {
  const mine = creatives.filter((c) => c.role === role);
  if (!mine.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-line bg-surface-2 p-3">
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Guide from your creatives (optional)</div>
      <p className="mb-2 text-[11px] text-ink-faint">Pick a {role} shot you made in Creatives to steer the look, wardrobe and world. Her locked face stays the same. Tap again to clear.</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {mine.map((c) => {
          const on = selected === c.url;
          return (
            <div key={c.url} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt="creative guide" onClick={() => onPick(role, c.url)}
                className={`h-44 w-28 cursor-pointer rounded-md border-2 object-cover transition ${on ? "border-[#a855f7] shadow-[0_0_14px_rgba(168,85,247,0.5)]" : "border-line opacity-70 hover:opacity-100"}`} />
              {on && <span className="absolute left-1 top-1 rounded bg-[#a855f7] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Guide</span>}
              <button onClick={(e) => { e.stopPropagation(); onZoom(c.url); }} title="Preview" className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/40 bg-black/55 text-[9px] text-white backdrop-blur-sm hover:bg-black/80">👁</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function RatioPicker({ value, onChange }: { value: "9:16" | "1:1" | "16:9"; onChange: (v: "9:16" | "1:1" | "16:9") => void }) {
  const opts: { v: "9:16" | "1:1" | "16:9"; label: string }[] = [{ v: "9:16", label: "9:16 · reels" }, { v: "1:1", label: "1:1 · feed" }, { v: "16:9", label: "16:9 · youtube" }];
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Size</div>
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${value === o.v ? "border-[#a855f7] bg-[#a855f7]/12 text-[#c79bff]" : "border-line text-ink-dim hover:border-line-strong"}`}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}
// Curated reference gallery for one role: each shot a tile with a Keep / Reject toggle. Rejected
// (dropped) scenes are dimmed and excluded from animation + the final cut. 👁 expands full size.
function RefGallery({ role, scenes, shots, dropped, shooting, onToggleDrop, onZoom }: {
  role: "a-roll" | "b-roll"; scenes: Scene[]; shots: Shot[]; dropped: Set<number>; shooting: boolean;
  onToggleDrop: (i: number) => void; onZoom: (u: string) => void;
}) {
  const items = scenes.map((s, i) => ({ s, i })).filter((x) => x.s.role === role);
  if (!items.length) return null;
  const shotOf = (i: number) => shots.find((sh) => sh.scene === i);
  const kept = items.filter((x) => !dropped.has(x.i) && shotOf(x.i)?.url).length;
  return (
    <div className="mt-3">
      <div className="tabular mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        <span>{role === "a-roll" ? "Talking" : "Scene"} references - keep the ones you want</span>
        <span className="rounded-full border border-ready/40 bg-ready/10 px-2 py-0.5 text-ready">{kept} kept</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(({ s, i }) => {
          const shot = shotOf(i); const isDropped = dropped.has(i);
          return (
            <div key={i} className={`relative overflow-hidden rounded-lg border transition ${isDropped ? "border-alert/40 opacity-45" : shot?.url ? "border-ready/40" : "border-line"}`}>
              {shot?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot.url} alt={`scene ${i + 1}`} className="aspect-[9/16] w-full object-cover" />
              ) : shooting ? (
                <div className="flex aspect-[9/16] w-full items-center justify-center bg-surface-2"><span className="h-5 w-5 animate-spin rounded-full border-2 border-[#a855f7]/40 border-t-[#a855f7]" /></div>
              ) : (
                <div className="flex aspect-[9/16] w-full items-center justify-center bg-surface-2 px-2 text-center text-[10px] text-ink-faint">not shot yet</div>
              )}
              <span className="tabular absolute left-1 top-1 max-w-[88%] truncate rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-ink-dim">Scene {i + 1} · {s.beat}</span>
              {shot?.url && <button onClick={() => onZoom(shot.url!)} title="Expand full size" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs text-white/90 hover:bg-black/85">👁</button>}
              {shot?.url && (
                <button onClick={() => onToggleDrop(i)} className={`absolute inset-x-1 bottom-1 rounded-md px-2 py-1 text-[10px] font-bold transition ${isDropped ? "bg-alert/80 text-white hover:bg-alert" : "bg-ready/85 text-black hover:bg-ready"}`}>
                  {isDropped ? "✕ Rejected - tap to keep" : "✓ Keep"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-ink-faint">Rejected shots are left out of the video. Re-shoot above for fresh takes.</p>
    </div>
  );
}
// A clip preview that can HEAR her. Live-bg a-roll and b-roll clips render SILENT (the engine animates the
// scene, not the lips) - the voice is only laid over at the final stitch, so the raw clip has no audio and
// you can't judge it. When the clip carries a voiceover (audio_url + synced:false), we overlay that VO on a
// hidden <audio> kept in lock-step with the video (play/pause/seek/rate/ended), so the preview plays with her
// voice exactly as the final cut will. A synced (HeyGen) clip already has baked audio, so we leave it alone.
function ClipPreview({ clip, className }: { clip: Clip; className?: string }) {
  const vRef = useRef<HTMLVideoElement>(null);
  const aRef = useRef<HTMLAudioElement>(null);
  const overlayVO = !!clip.audio_url && clip.synced !== true; // silent clip + a VO to lay over
  const sync = (fn: (v: HTMLVideoElement, a: HTMLAudioElement) => void) => { const v = vRef.current, a = aRef.current; if (v && a) fn(v, a); };
  return (
    <>
      <video
        ref={vRef}
        src={clip.url || undefined}
        controls
        playsInline
        className={className}
        onPlay={overlayVO ? () => sync((v, a) => { a.currentTime = v.currentTime; a.play().catch(() => {}); }) : undefined}
        onPause={overlayVO ? () => sync((_v, a) => a.pause()) : undefined}
        onSeeked={overlayVO ? () => sync((v, a) => { a.currentTime = v.currentTime; }) : undefined}
        onRateChange={overlayVO ? () => sync((v, a) => { a.playbackRate = v.playbackRate; }) : undefined}
        // When the (draft) video ends but the voiceover is longer, DON'T stop the VO - the video holds its last
        // frame while the voice plays out, so you hear the FULL line (the final cut renders the clip at the VO
        // length, so there's no hold there). Only reset once the VO itself has finished.
        onEnded={undefined}
      />
      {overlayVO && <audio ref={aRef} src={clip.audio_url || undefined} preload="auto" onEnded={() => { const v = vRef.current; if (v) { v.pause(); try { v.currentTime = 0; } catch { /* noop */ } } }} />}
    </>
  );
}
// Live elapsed-time + typical-time hint for a rendering scene, so a slow lane reads as "still going",
// not "hung". Ticks itself every second; start is the ms timestamp the render was first observed.
function RenderTimer({ start, hint }: { start: number; hint?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const mm = Math.floor(secs / 60); const ss = secs % 60;
  return (
    <div className="tabular text-center leading-tight">
      <div className="text-[11px] font-bold">{mm}:{String(ss).padStart(2, "0")}</div>
      {hint && <div className="mt-0.5 text-[8px] font-normal opacity-60">typically {hint}</div>}
    </div>
  );
}
// Playable previews for one role - one tile per scene IN ORDER, each either the rendered clip
// (play before approving) or a "not rendered yet" tile (e.g. after a re-shoot clears it).
function ClipStrip({ clips, role, sceneIdx, onExpand }: { clips: Clip[]; role: "a-roll" | "b-roll"; sceneIdx: number[]; onExpand: (url: string) => void }) {
  if (!sceneIdx.length) return null;
  return (
    <div className="mt-3">
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">Preview the {role} clips, in order - play, or tap 👁 to expand full size</div>
      <div className="flex flex-wrap gap-3">
        {sceneIdx.map((i) => {
          const c = clips.find((x) => x.scene === i && x.url);
          return (
            <div key={i} className="relative">
              {c?.url ? (
                <>
                  <ClipPreview clip={c} className="aspect-[9/16] w-40 rounded-lg border border-ready/40 bg-black object-cover" />
                  <button onClick={() => onExpand(c.url!)} title="Expand full size" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs text-white/90 hover:bg-black/85">👁</button>
                </>
              ) : (
                <div className="flex aspect-[9/16] w-40 items-center justify-center rounded-lg border border-dashed border-line bg-surface-2 px-2 text-center text-[10px] text-ink-faint">not rendered yet</div>
              )}
              <span className="tabular absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-ink-dim">Scene {i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function Field({ label, v, set, placeholder }: { label: string; v: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>
      <input value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
    </div>
  );
}
function Area({ label, v, set, placeholder }: { label: string; v: string; set: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="tabular mb-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-faint">{label}</div>
      <textarea value={v} onChange={(e) => set(e.target.value)} rows={2} placeholder={placeholder} className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-[#a855f7]" />
    </div>
  );
}
