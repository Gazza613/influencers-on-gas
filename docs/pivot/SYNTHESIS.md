# Pivot — Locked Decisions & Build Roadmap

Status: **planning locked, build not started.** Source specs: the 10 PDFs in
`docs/pivot/` (`CLAUDE` is the master brief). This file is the decision record +
roadmap we build from.

---

## Terminology (pin this)
- **Tenant** = an agency using the platform. **v1 = GAS only.** Multi-tenant is **Iteration 2**.
- **Client / "brain"** = a brand GAS makes videos for (e.g. PSI, Learnalot). **Many per tenant.**
  `client_id` isolates each brain's knowledge/data/identity. (So v1 has one tenant but many client-brains.)

---

## Decisions locked (2026-06-13)

1. **Approach = GREENFIELD, cut over from the start.** Fresh Next.js app that
   **replaces** the Vite SPA in place (same repo, Vercel project, domain). No
   parallel-live period — the current app is retired immediately. **Archive it first**
   to a git branch/tag (`archive/vite-spa`) so salvage IP stays recoverable. Owner is
   not precious about the current build; team is invited only after it's built + tested.
2. **Tenancy = per-tenant architecture, GAS-only for v1.** Build the `client_id`
   isolation seam everywhere now; only GAS connects credentials in v1; multi-tenant
   onboarding is Iteration 2.
3. **Cost model = BOTH lenses coexist:**
   - **Lens A (keep):** live Higgsfield **Ultra** balance + credit-pool health +
     per-member credit allocation — the current `lib/usage.js`/Costs dashboard. The
     "are we running out of the $310/9,000-credit pool" view.
   - **Lens B (new):** per-production **`rate_card` + `budgets` + hard pre-flight gate**
     + per-stage actuals + estimate-vs-actual. The "what did this job/client cost,
     and block overspend before it happens" view.
4. **Vendor spend = GAS pays, using GAS's own existing connections.** The per-tenant
   credential vault holds GAS's HeyGen / ElevenLabs / Magnific / Shotstack / Higgsfield /
   Anthropic accounts. One connected set for v1.
5. **Unspecified tech picks (owner delegated → decided):**
   - **Embeddings:** Voyage **`voyage-3.5`** → pgvector column **`vector(1024)`**
     (overrides the `vector(1536)` in `architecture.pdf`, which assumed OpenAI).
   - **Web crawler:** **Firecrawl** (LLM-ready extraction).
   - **STT / uploaded-voice alignment:** **ElevenLabs Scribe** (single audio vendor).
6. **Video duration = configurable: 15 / 30 / 45 / 60 s** (brief selector; default 45s).
   The narrative spine timings, script length, scene count, and cost estimate all scale
   to the chosen duration.
7. **Roles = single super_admin for v1.** Gary Berman (`gary@gasmarketing.co.za`) is the
   only user/super_admin while building + testing. Team invites (and the admin/producer
   split, budgets-per-member, etc.) come after v1 is built and tested.

---

## Target stack (locked in `CLAUDE.pdf` — do not relitigate)

| Concern | Choice |
|---|---|
| App + API + runtime | **Next.js on Vercel** (deploy on push) |
| Relational DB + vectors | **Neon Postgres** + **pgvector** (`@neondatabase/serverless`; never `@vercel/postgres`/`@vercel/kv`) |
| File storage | **Vercel Blob** (`clients/{client_id}/…`) |
| Orchestration | **Inngest** (durable, retrying `step.run`; owned IP — not Higgsfield Supercomputer) |
| Auth | **Auth.js (NextAuth)** |
| Producer / script / audio-map brain | **Claude Sonnet 4.6** default · **Opus 4.8** (`effort=high`) premium toggle · **Haiku 4.5** ingestion · prompt caching always on |
| Voice / music / ambient / STT | **ElevenLabs** (TTS + Music v2 + SFX + Scribe) |
| Avatar a-roll | **HeyGen** Avatar V API |
| Identity + b-roll | **Higgsfield** Soul 2.0 (identity) + Seedance 2.0 / DoP (b-roll) + Cinema Studio (camera), via API |
| Selective realism | **Magnific / Freepik** (Skin Enhancer + Precision on hero frames only) |
| Stitch / captions / mix / overlays | **Shotstack** |
| Embeddings | **Voyage voyage-3.5** (1024-dim) |
| Crawl | **Firecrawl** |
| Knowledge | website crawl + **GAS Google Sheet → Drive folder** (manifest + profile signals) |

---

## Migration plan (greenfield + salvage)

- **Fresh Next.js app, cut over from the start.** Before scaffolding: tag/branch the
  current Vite app as `archive/vite-spa` and push it (salvage reference). Then build the
  Next.js app on `main` in the same repo + Vercel project + domain — it replaces the Vite
  app directly (no parallel preview-then-cutover). Only Gary uses the site during the
  build, so an in-progress production deploy is acceptable.
- **Salvage list** (port + adapt, don't depend on the SPA):
  - `src/utils/higgsfieldGenerate.js` → server-side Higgsfield service (b-roll/Soul).
  - Prompt IP: hyper-realism master prompt, `annotateDialogue`, poses/wardrobe/vibe
    libraries (`systemPrompt.js`, `influencers/prompts.js`) → producer + builder libs.
  - `lib/usage.js` Ultra credit model → Lens A of the cost area.
  - Auth posture (PBKDF2, `@gasmarketing.co.za` domain gating, idle auto-logout) →
    reimplement on Auth.js (keep the security properties from today's audit).
  - Influencer-builder UX → **Setup → Influencers** (keep current depth; *add* Soul
    training, ElevenLabs `voice_id`, "Build Me" twin, consent gate, Magnific pass).
- **Existing data:** localStorage influencers (incl. Kayla/Marcus/Camila seeds) are
  test data → not migrated; start clean in Neon.

---

## Build roadmap (phases from `CLAUDE.pdf`, decisions folded in)

1. **Foundation** — Next.js/Vercel; Neon + pgvector(`1024`) + Blob; Auth.js (domain-gated);
   core schema (`users`, `clients`, `productions`, `production_steps`, `rate_card`,
   `budgets`, `knowledge_*`, `consents`); brain dropdown shell.
2. **Connect Tools** — per-tenant encrypted credential vault (GAS connects GAS's keys);
   produce flow blocked until required tools connected.
3. **Influencer Builder + consent** — Mode A (synthetic from brain) + Mode B (Build Me twin);
   Soul 2.0 training, ElevenLabs `voice_id`, Magnific reference-frame pass; POPIA/GDPR
   consent gate on every photo/voice upload (`consents`/`consent_texts`).
4. **Brains** — Firecrawl website + GAS Sheet→Drive ingestion (Inngest); chunk→Voyage
   embed→pgvector; `client_profiles` (human-approved `is_live`); **pass the isolation test**.
5. **Script + producer co-pilot + estimate** — the producer system prompt (the core quality
   asset); structured `plan` output (voiceover/scenes/captions/popups/audio_map/metrics);
   45s spine; self-verification gate; `cost.estimate` via rate_card.
6. **Cost gate + dashboard (BOTH lenses)** — Lens A (Ultra credit health, salvaged) +
   Lens B (rate_card + budgets + hard GATE 1, per-stage actuals, variance, RBAC admin/producer).
7. **Production pipeline** — Inngest 9-stage factory: a-roll (HeyGen), b-roll (Higgsfield +
   Magnific hero frames), optional audio (ElevenLabs music/ambient/accents), Shotstack draft,
   Gmail notifications, per-stage cost rows.
8. **Finalise + QA + deliver** — draft approval gate, full render, glass-box overlays,
   automated QA gate (tiered severity), Blob delivery + download.
9. **Iteration 2** — multi-tenant onboarding, performance/learning loop (`published_assets` +
   `performance_metrics`), Meta feedback + ad-loading, white-label. (Schema seams built now.)

---

## Scope decisions
- **Compliance = consent/biometric only (POPIA/GDPR).** AI-content disclosure labels,
  watermarks, and platform/advertising (TikTok/IG/ASA) rules are **explicitly OUT of scope
  for now** (owner, 2026-06-13). Can be added later if needed.

## Open items
All planning decisions are now locked (see Decisions 1–7 above). Remaining choices are
build-time details (e.g. exact rate-card seed values, Drive/Sheet service-account setup)
handled as each phase is built.

## Non-negotiable principles (from the specs)
- "Cost control is **dials, never a quality cap**." Prices live in `rate_card`, **never in code**.
- `client_id` isolation is absolute — every knowledge query filters by it; ships only after
  the isolation regression test passes ("query brain A for a brain-B-only fact → nothing").
- Producer **never fabricates** facts (RAG-grounded) and **never** uses a client's banned words.
- Nothing calls a paid API before passing the budget gate.
