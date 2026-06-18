// SINGLE SOURCE OF TRUTH for what the platform actually is RIGHT NOW. The daily research
// agent reads this so it never suggests things we have already built or deliberately
// rejected. KEEP THIS UPDATED as the architecture changes (it is the agent's only view of
// the real build). Plain prose on purpose, it is fed into a prompt.
export const PLATFORM_STATE = `CURRENT BUILD of "Influencers on GAS" (as built today). Treat this as ground truth.

IMAGE IDENTITY ENGINE (validated, do not reverse):
- Image identity = the influencer's face as reference image(s) (@image1, plus a feature sheet / extra angles) PLUS a structured iPhone-realism prompt PLUS an explicit IDENTITY LOCK instruction.
- Primary render model is NANO BANANA PRO (best-of-breed reference fidelity, native square, UNLIMITED/free on our Higgsfield Ultra plan), with a self-healing fallback to the previously-validated gpt_image_2 (creatives) / nano_banana_2 (casting) if the model is unavailable. Model id is env-overridable (HF_IMAGE_MODEL). The switch off gpt_image_2 also fixes its 1:1-aspect failure.
- We DELIBERATELY MOVED OFF Higgsfield Soul / soul_id / soul_2 / soul_cinematic for image identity: in our own testing it drifted and did not hold likeness. DO NOT suggest going back to Soul for image identity. (A trained identity asset may only be revisited for the future VIDEO pipeline.)
- A two-stage prompt writer is already live: Claude expands the producer's brief into a structured scene, then the image model renders it. The realism/cinematic choice is an explicit cinematic flag (no longer carried via dead soul model names).

BUILD FLOW:
- Casting: Claude writes a Character Bible from a brief, then nano_banana_2 generates candidate faces; the producer picks one.
- Photoshoot: identity-only, captures a varied face set on neutral backgrounds (no wardrobe/location inputs at this step).
- Lock-down: INSTANT (no Soul training). Identity = the chosen casting face + a canonical reference set (clean identity card, macro feature sheet, turnaround) for synthetics; for TWINS it is the real uploaded photos.
- Twins (real people): built from MULTIPLE uploaded photos (3 to 10, bulk upload), used DIRECTLY as references, never regenerated, never invent moles/freckles.
- Creatives: per-format 9:16 / 1:1 / 16:9, 2K or 4K (4K via Higgsfield bytedance upscale, we upscale ONLY keepers). AI Vision QA (Claude Haiku) grades each shot Great/Good/Average; all are downloadable.

INTEGRATIONS (already wired, do not suggest "connect" these):
- The Higgsfield MCP server is ALREADY connected and drives all generation (casting, photoshoot, creatives, upscale). Do not suggest connecting the Higgsfield MCP.
- Anthropic Claude: bible, scene composer, Vision QA, and this research email.
- Voyage + Firecrawl: per-client brain (RAG). HeyGen: presenter (future). ElevenLabs: voice (future).

RAG: Voyage embeddings are now voyage-4-lite (1024-dim, ~3x cheaper than legacy voyage-3.5, drop-in). v4 vectors are incompatible with 3.5, so any pre-existing brain must be fully re-ingested per client_id.

NOT BUILT YET (fair game to advise on, clearly label as future):
- Video pipeline: a-roll = talking influencer via HeyGen (best-of-breed, KEEP); b-roll = image-to-video. DEFAULT b-roll engine is Kling 3.0 (face-safe), Veo 3.1 for hero shots. DO NOT use Seedance for face/human b-roll: since Apr 2026 it blocks realistic human faces as references (Seedance is for non-face product/scene only). Target output formats 9:16 and 1:1 only.
- Voice (ElevenLabs, KEEP best-of-breed): clone for twins, designed voice for synthetics. Persist voice_id + voice_design and the HeyGen avatar_id as first-class per-influencer assets.
- Before video: formalise a "ready for video" identity gate (clean turnaround set, neutral closed-mouth hero frame, expression set, high-detail face crops, validated cards_rehosted) so video stays on-model.

COST + STYLE:
- Every paid vendor call is metered in Cost Control. Higgsfield is on Ultra (~9000 credits/month). Be cost-conscious but NEVER at the expense of output quality.
- UK British spelling, never em dashes.`;
