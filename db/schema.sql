-- GAS Studio — Neon Postgres schema (Phase 1).
-- Source of truth for the relational + RAG data model. Compiled from the pivot
-- specs: architecture.md, brains.md, cost-controls.md, compliance.md,
-- production-pipeline.md. Apply once Neon is provisioned (see scripts/migrate).
--
-- Principles: client_id is the tenancy/brain key on everything that holds a
-- client's data; prices live in rate_card (never in code); embeddings are
-- vector(1024) to match Voyage voyage-3.5.

create extension if not exists vector;

-- ── People ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  name        text,
  role        text not null default 'producer',  -- 'super_admin' | 'admin' | 'producer'
  display_currency text default 'ZAR',
  show_both   boolean default true,
  created_at  timestamptz not null default now()
);

-- ── Clients (a.k.a. "brains") ─────────────────────────────────────────────────
create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique not null,
  status             text not null default 'active',
  brand              jsonb default '{}'::jsonb,          -- logo_url, colors, fonts, lower_third
  sonic_identity     jsonb default '{}'::jsonb,          -- music style descriptor / finetune id
  voice_id           text,                               -- ElevenLabs
  heygen_avatar_id   text,                               -- HeyGen
  higgsfield_soul_id text,                               -- Higgsfield Soul 2.0
  default_currency   text default 'ZAR',
  created_at         timestamptz not null default now()
);

create table if not exists client_profiles (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  version             int not null default 1,
  positioning         text,
  audience            jsonb default '{}'::jsonb,
  banned_words        text[] default '{}',
  tone_rules          text,
  proof_points        jsonb default '[]'::jsonb,
  outcome_definitions text,
  exemplars           jsonb default '[]'::jsonb,
  is_live             boolean not null default false,    -- human-approved before use
  created_at          timestamptz not null default now()
);
create index if not exists idx_client_profiles_client on client_profiles(client_id);

-- ── Knowledge / RAG ───────────────────────────────────────────────────────────
create table if not exists knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  type           text not null,                          -- 'website' | 'gsheet'
  uri            text not null,                          -- url, or Google Sheet id
  status         text not null default 'pending',        -- pending | indexed | failed
  last_synced_at timestamptz
);
create index if not exists idx_knowledge_sources_client on knowledge_sources(client_id);

create table if not exists knowledge_chunks (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  source_id  uuid references knowledge_sources(id) on delete cascade,
  content    text not null,
  embedding  vector(1024),                               -- Voyage voyage-3.5
  metadata   jsonb default '{}'::jsonb,                  -- { title, url, tags[] }
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_chunks_client on knowledge_chunks(client_id);
create index if not exists idx_knowledge_chunks_embedding
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);

-- ── Productions (the video runs) ──────────────────────────────────────────────
create table if not exists productions (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  created_by      uuid references users(id),
  title           text,
  brief           jsonb default '{}'::jsonb,             -- topic, segment, toggles, tier, voice mode, aspect_ratio
  plan            jsonb default '{}'::jsonb,             -- script, scenes, captions, popups, audio_map
  duration_target int not null default 45,               -- 15 | 30 | 45 | 60
  status          text not null default 'draft',
  -- draft | estimating | awaiting_approval | rendering_draft | draft_ready
  -- | awaiting_final_approval | rendering_final | qa_review | complete | failed | cancelled
  estimate_cents  int,
  actual_cents    int,
  fx_rate_snapshot numeric,
  display_currency text,
  draft_video_url text,
  final_video_url text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_productions_client on productions(client_id);

create table if not exists production_steps (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid not null references productions(id) on delete cascade,
  stage         text not null,   -- tts|music|ambient|aroll|broll|assemble_draft|assemble_final|script|...
  provider      text,
  model         text,
  units         numeric,
  cost_cents    int,
  output_ref    text,
  status        text not null default 'pending',
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists idx_production_steps_prod on production_steps(production_id);

-- ── Cost controls ─────────────────────────────────────────────────────────────
-- Prices live HERE, never in code. Versioned via effective_from.
create table if not exists rate_card (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  model               text,
  unit                text not null,   -- char | second | clip | render_minute | minute | token | image
  resolution          text,
  price_cents_per_unit numeric not null,
  effective_from      timestamptz not null default now(),
  active              boolean not null default true
);

create table if not exists budgets (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,           -- 'user' | 'client' | 'team'
  scope_id    text,
  period      text not null default 'monthly',
  limit_cents int not null,
  spent_cents int not null default 0,
  hard_gate   boolean not null default true,
  currency    text default 'ZAR',
  created_at  timestamptz not null default now()
);

create table if not exists fx_rates (
  base       text not null,
  quote      text not null,
  rate       numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (base, quote, fetched_at)
);

-- ── Learning loop (Iteration 2 — schema seams now) ────────────────────────────
create table if not exists published_assets (
  id            uuid primary key default gen_random_uuid(),
  production_id uuid references productions(id) on delete set null,
  client_id     uuid not null references clients(id) on delete cascade,
  platform      text,                  -- facebook | tiktok | x | linkedin
  url           text,
  segment       text,
  posted_at     timestamptz
);
create index if not exists idx_published_assets_client on published_assets(client_id);

create table if not exists performance_metrics (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references published_assets(id) on delete cascade,
  platform    text,
  metric      text,                    -- retention | ctr | engagement | conversions
  value       numeric,
  captured_at timestamptz not null default now()
);

-- ── Compliance: consent (POPIA / GDPR) ────────────────────────────────────────
create table if not exists consent_texts (
  id             uuid primary key default gen_random_uuid(),
  version        int not null,
  body           text not null,
  effective_from timestamptz not null default now(),
  active         boolean not null default true
);

create table if not exists consents (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id) on delete set null,
  influencer_ref  text,
  subject_name    text not null,
  subject_email   text,
  data_type       text not null,        -- 'image' | 'voice'
  scope           text not null,
  lawful_basis    text not null default 'consent',
  consent_text_id uuid not null references consent_texts(id),
  granted_by      uuid not null references users(id),
  granted_at      timestamptz not null default now(),  -- date + time + tz (audit requirement)
  status          text not null default 'active',      -- 'active' | 'withdrawn'
  withdrawn_at    timestamptz
);
create index if not exists idx_consents_client on consents(client_id);

-- ── Connect Tools: per-tenant credential vault ────────────────────────────────
-- v1 has one tenant ('gas'); tenant column is the multi-tenant seam (Iteration 2).
-- Secrets are AES-256-GCM encrypted at rest (lib/crypto). Never returned to the client.
create table if not exists connections (
  id               uuid primary key default gen_random_uuid(),
  tenant           text not null default 'gas',
  provider         text not null,   -- anthropic | voyage | firecrawl | elevenlabs | heygen | higgsfield | magnific | shotstack
  secret_encrypted text,
  status           text not null default 'connected',
  metadata         jsonb default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  unique (tenant, provider)
);

-- ── Influencers (reusable identities; built once, reused across productions) ──
-- Optionally scoped to a client/brain (nullable in v1). Soul/voice/avatar IDs are
-- populated by the generation steps in Phase 3b once vendor tools are connected.
create table if not exists influencers (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references clients(id) on delete set null,
  name               text not null,
  mode               text not null default 'synthetic',  -- 'synthetic' | 'twin'
  status             text not null default 'draft',       -- 'draft' | 'ready'
  persona            jsonb default '{}'::jsonb,            -- age_range, gender, vibe, niche, audience, wardrobe, setting, backstory
  higgsfield_soul_id text,
  voice_id           text,        -- ElevenLabs
  heygen_avatar_id   text,        -- HeyGen (twin a-roll)
  look_refs          jsonb default '[]'::jsonb,            -- chosen reference frames [{url}]
  locked_seed        bigint,
  consent_id         uuid references consents(id) on delete set null,
  created_by         uuid references users(id),
  created_at         timestamptz not null default now()
);
create index if not exists idx_influencers_client on influencers(client_id);

-- Seed the canonical consent wording (v1) once. POPIA/GDPR — see compliance.md.
insert into consent_texts (version, body)
select 1, 'I confirm I have the right to use this person''s image / voice. '
       || 'I consent to creating an AI likeness / voice clone from this material. '
       || 'I understand the purpose: producing marketing video content. '
       || 'I understand consent can be withdrawn and the data deleted at any time.'
where not exists (select 1 from consent_texts where version = 1);

-- ── Cost tracking (Phase 6) ───────────────────────────────────────────────────
-- Higgsfield works in CREDITS (9,000/mo Ultra pool); we also store a ZAR estimate.
alter table rate_card add column if not exists credits_per_unit numeric not null default 0;
create unique index if not exists uq_rate_card_pmu on rate_card(provider, model, unit);

-- Every paid generation appends one row here (per influencer / brain / member).
create table if not exists usage_events (
  id            uuid primary key default gen_random_uuid(),
  influencer_id uuid references influencers(id) on delete set null,
  client_id     uuid references clients(id) on delete set null,
  user_email    text,
  provider      text not null,                 -- higgsfield | heygen | magnific | voyage | anthropic
  model         text,
  action        text,                          -- casting | photoshoot | soul | presenter | humaniser
  credits       numeric not null default 0,    -- Higgsfield credit pool burn
  cents         int not null default 0,        -- ZAR cents estimate
  count         int not null default 1,
  created_at    timestamptz not null default now()
);
create index if not exists idx_usage_events_created on usage_events(created_at);
create index if not exists idx_usage_events_influencer on usage_events(influencer_id);

-- Daily cost audit: snapshot the live Higgsfield credit balance vs our ledger so
-- the Cost Control view can prove it stays 100% accurate over time.
create table if not exists balance_snapshots (
  id              uuid primary key default gen_random_uuid(),
  taken_at        timestamptz not null default now(),
  remaining       numeric,                       -- live Higgsfield credits remaining (null if unreadable)
  ledger_credits  numeric not null default 0,    -- total credits our ledger has recorded to date
  ledger_cents    int not null default 0,        -- total ZAR cents our ledger has recorded to date
  note            text
);
create index if not exists idx_balance_snapshots_taken on balance_snapshots(taken_at);

-- Firecrawl scrape rate (Voyage embeddings already seeded at 0). Nominal ZAR estimate
-- so brain ingestion shows up in Cost Control with real counts.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('firecrawl','scrape','page', 0, 3, true)
on conflict (provider, model, unit) do nothing;

-- ── Team access (Phase 1b): invited members + passwords ──────────────────────
-- super_admin (env Gary) can invite/remove; invited users set a password via an
-- emailed link, then sign in. All signed-in users can see Cost Control.
alter table users add column if not exists password_hash  text;
alter table users add column if not exists status         text not null default 'active'; -- 'invited' | 'active'
alter table users add column if not exists invite_token   text;
alter table users add column if not exists invite_expires timestamptz;
create index if not exists idx_users_invite_token on users(invite_token);

-- Soul (trained-identity) image generation rates. Estimates — tune against get_cost.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','soul_2','image', 2, 128, true)
on conflict (provider, model, unit) do nothing;
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','soul_cinematic','image', 4, 256, true)
on conflict (provider, model, unit) do nothing;

-- Angles 2.0: 12 camera angles from one hero frame (60-80% cost reduction vs multi-prompt).
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','angles_2_0','image', 1, 77, true)
on conflict (provider, model, unit) do nothing;

-- Supercomputer: adaptive model routing (image-only allowlist, best-cost inference).
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','supercomputer','image', 3, 231, true)
on conflict (provider, model, unit) do nothing;

-- Supercomputer for video b-roll (Kling 3.0 / Seedance 2.0, adaptive routing, 500 credit session cap).
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','supercomputer','video', 8, 615, true)
on conflict (provider, model, unit) do nothing;

-- Native Higgsfield 4K upscale (bytedance) — replaces the external Magnific upscaler.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','upscale_image','image', 2, 128, true)
on conflict (provider, model, unit) do nothing;

-- GPT Image 2 (creatives identity engine: reference-image + identity-lock, ~4 credits/image).
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','gpt_image_2','image', 4, 308, true)
on conflict (provider, model, unit) do nothing;

-- ── Showcase: a public brag wall of finished influencer videos ────────────────
-- Producers flag a complete production into the showcase; a single unguessable
-- public token serves the wall to prospects without a login.
alter table productions add column if not exists showcased boolean not null default false;
-- Manually-uploaded external showreels (brag work not produced on the platform) are tagged external.
alter table productions add column if not exists external boolean not null default false;
-- Custom drag-and-drop order on the showcase wall, and a captured poster still (so tiles never show black).
alter table productions add column if not exists showcase_order int;
alter table productions add column if not exists poster_url text;

create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Daily "Higgsfield expert" research call (Claude + web search). Nominal ZAR estimate
-- per run so the daily research shows in Cost Control.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('anthropic','claude-sonnet-4-6','request', 0, 200, true)
on conflict (provider, model, unit) do nothing;

-- Models the live pipeline actually uses (kept in sync with the live rate_card).
-- Nano Banana Pro is the primary image engine and is UNLIMITED on our Higgsfield Ultra plan
-- (0 cost). nano_banana_2 is the billable casting/photoshoot fallback. Scene-writer + Haiku
-- vision QA are metered too. Firecrawl corrected to ~R0.03/page; Voyage on voyage-4-lite.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active) values
  ('higgsfield','nano_banana_pro','image', 0, 0, true),
  ('higgsfield','nano_banana_2','image', 1, 77, true),
  ('higgsfield','nano-banana','image', 1, 77, true),      -- FAST first-party REST keyframe lane (~22s vs ~10min MCP) - ESTIMATE, Recalibrate trues up
  ('anthropic','claude-sonnet-4-6','scene', 0, 30, true),
  ('anthropic','claude-opus-4-8','request', 0, 500, true),
  ('anthropic','claude-haiku-4-5','image', 0, 5, true),
  ('voyage','voyage-4-lite','embed', 0, 0, true),
  -- B-ROLL motion (Producer): Kling 3.0 image->video ~5s std, from the 9,000-credit Ultra POOL.
  -- ~6 credits/clip (2026 sourced; Higgsfield publishes no per-model table) × ~R0.77/credit.
  ('higgsfield','kling3','video', 6, 462, true),
  ('higgsfield','kling3_0','video', 6, 462, true),            -- b-roll engine id used in metering (alias of kling3)
  ('higgsfield','kling-v2-1','video', 5, 385, true),          -- FAST first-party REST Kling 2.1 (Phase 1) - ESTIMATE, Recalibrate trues it up
  ('higgsfield','kling-v2-1-master','video', 6, 462, true),   -- REST Kling 2.1 master (higher quality) - ESTIMATE
  ('higgsfield','seedance_2_0','video', 6, 462, true),        -- a-roll fallback, from the Ultra credit pool
  ('higgsfield','seedance1_5','video', 5, 385, true),         -- Seedance 1.5 Pro b-roll (producer-selectable engine) - ESTIMATE, Recalibrate trues it up
  ('higgsfield','veo3_1','video', 40, 3080, true),            -- Veo 3.1 HERO b-roll (4K + native audio) - pricey; recalibrate
  -- PRIMARY b-roll engine on the Producer path (DoP-turbo, fast first-party). Draws from the Ultra
  -- credit POOL. ESTIMATE below - "Recalibrate costs" trues this up from Higgsfield get_cost.
  ('higgsfield','dop_turbo','video', 4, 308, true),
  -- PRIMARY a-roll engine (HeyGen Avatar IV, default AROLL_ENGINE). Within the HeyGen PRO $99/mo plan
  -- (~121 video min/mo included), so $0 marginal per clip within quota (overage $0.18/min). The $99/mo
  -- is a FIXED cost shown separately on the Cost Control page, not a per-clip charge.
  ('heygen','avatar_iv','video', 0, 0, true),
  ('heygen','talking_photo','video', 0, 0, true),             -- legacy build/twin presenter path (same HeyGen plan)
  ('heygen','talking_photo','avatar', 0, 0, true),
  -- fal OmniHuman 1.5 a-roll (opt-in AROLL_ENGINE=omnihuman): fal PAYG ~$0.16/s metered per second.
  ('fal','omnihuman_1_5','second', 0, 296, true),
  -- ElevenLabs voice/STT: within the ElevenLabs SUBSCRIPTION quota, so $0 marginal (like the music bed).
  -- Metered for usage visibility.
  ('elevenlabs','eleven_multilingual_v2','tts', 0, 0, true),
  ('elevenlabs','clone','voice', 0, 0, true),
  ('elevenlabs','scribe_v1','stt', 0, 0, true),
  -- ElevenLabs Music bed: drawn from the ElevenLabs SUBSCRIPTION credit pool, so $0 marginal
  -- within quota (like Higgsfield images). Metered for usage visibility.
  ('elevenlabs','music','music', 0, 0, true),
  -- Claude 'bible' unit (Character Casting + creative refine) and voyage-3.5 brief retrieval.
  ('anthropic','claude-sonnet-4-6','bible', 0, 200, true),
  ('voyage','voyage-3.5','embedding', 0, 0, true),
  -- Shotstack render: PAY-AS-YOU-GO (not a subscription) ~$0.30/rendered min => ~$0.24 per 45s cut.
  ('shotstack','edit','render', 0, 450, true)
on conflict (provider, model, unit) do nothing;

-- ============================================================================
-- GAS STUDIO (the template creative factory). Net-new, `studio_`-prefixed, additive only:
-- nothing here touches the influencer video pipeline. See docs STUDIO_BUILD_INSTRUCTION.
--
-- Design lock: templates are RECREATED from the client's own reference creatives and then
-- frozen. The reference file stays attached to the template record forever as the design
-- contract with the client - that is the audit trail proving the design never drifted.
-- ============================================================================

-- Brand kit: the client's locked visual identity (colours, licensed fonts, approved logos).
create table if not exists studio_brand_kits (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null,
  colors      jsonb not null default '{}'::jsonb,   -- token map: primary, secondary, bg, text, accent
  fonts       jsonb not null default '[]'::jsonb,   -- [{family, weight, style, url}] - licensed files we render with
  logos       jsonb not null default '[]'::jsonb,   -- [{variant: light|dark|icon|primary, url}]
  tone_notes  text,                                 -- feeds the copy engine
  locked      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_studio_brand_kits_client on studio_brand_kits(client_id);

-- Template: ONE locked layout per placement/size, recreated from a reference creative.
create table if not exists studio_templates (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  brand_kit_id  uuid references studio_brand_kits(id) on delete set null,
  name          text not null,
  block         text not null default 'funnel',      -- 'funnel' | 'social' - the production set it belongs to
  placement     text not null,                       -- funnel_banner | funnel_section1 | funnel_section2 | meta_feed_4x5 | ...
  width         int  not null,                       -- READ from the uploaded reference, never typed by hand
  height        int  not null,
  engine        text not null default 'playwright' check (engine in ('playwright','shotstack','image')),
  component_key text,                                -- maps to the React template component once recreated
  slot_schema   jsonb not null default '{}'::jsonb,  -- editable slots + maxChars + image requirements
  reference_url text,                                -- THE DESIGN CONTRACT: the original file, kept forever
  analysis      jsonb not null default '{}'::jsonb,  -- what vision read off the reference (layout, slots, colours)
  version       int  not null default 1,
  status        text not null default 'draft' check (status in ('draft','locked','archived')),
  created_at    timestamptz not null default now()
);
create index if not exists idx_studio_templates_client on studio_templates(client_id, block);

-- Client asset library: reference creatives, logos, product shots, generated images.
create table if not exists studio_assets (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  kind       text not null check (kind in ('reference','image','logo','font','video','ci_doc','deal_card')),
  name       text,
  url        text not null,
  meta       jsonb not null default '{}'::jsonb,     -- width, height, bytes, mime, tags
  created_at timestamptz not null default now()
);
create index if not exists idx_studio_assets_client on studio_assets(client_id, kind);

-- Deal cards (the client's promo callouts) are an asset kind too (spec 5b): the team uploads the designed pill, we recreate
-- it once as a pixel-matched component with the offer text as an editable slot, and the design is locked.
-- Widen the constraint on tables that already exist (no data touched - a CHECK, not a row).
alter table studio_assets drop constraint if exists studio_assets_kind_check;
alter table studio_assets add constraint studio_assets_kind_check
  check (kind in ('reference','image','logo','font','video','ci_doc','deal_card'));

-- Client compliance line (e.g. MTN's "Ts&Cs Apply · Queries? 083135 · MTN JR AUTH FSP 46094"). It is
-- client-level, not per-template, and must be reproducible VERBATIM on any creative that needs it - a
-- financial-services disclosure can never be paraphrased or half-remembered by a copy engine.
alter table studio_brand_kits add column if not exists compliance_text text;

-- The client's DESIGN SYSTEM, reverse-engineered from their best-performing creatives: the rules their
-- designers actually follow (panel hierarchy ratios, the disc/glow layer build, what is never broken, the
-- allowed degrees of freedom). This is the locked grammar the Creative Director composes WITHIN - it is
-- derived from proven work, never invented, and it is what stops a generated creative drifting out of the
-- family. Client-level, because it spans every placement.
alter table studio_brand_kits add column if not exists design_system text;

-- THE "WORTH REVIEWING" QUEUE. The Journalist and Strategist research daily and PROPOSE findings here; a human
-- accepts or bins each one. They never silently write to the client brain - otherwise a bad source quietly
-- becomes "fact" and every future article and strategy inherits it. `material` marks the ones that actually
-- change something, which is what gets emailed. Every row carries its source and a confidence grade.
create table if not exists studio_intel (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  role           text not null check (role in ('journalist','strategist')),
  headline       text not null,
  why_it_matters text not null,
  detail         text,
  source_url     text,
  source_name    text,
  confidence     text not null default 'medium' check (confidence in ('high','medium','low')),
  material       boolean not null default false,
  status         text not null default 'new' check (status in ('new','accepted','binned')),
  found_at       timestamptz not null default now()
);
create index if not exists idx_studio_intel_client on studio_intel(client_id, status, found_at desc);

-- Findings routinely rest on SEVERAL sources ("TechCentral / ITWeb", "BioCatch via IOL / TransUnion via eNCA").
-- A single source_url threw the rest away, so an item could not be fully checked. Store them all.
alter table studio_intel add column if not exists sources jsonb not null default '[]'::jsonb;

-- TWO dates matter on a finding, and conflating them is how stale information becomes "current":
--   found_at     - when WE researched it (already present)
--   published_at - when the SOURCE was published / the thing actually happened
-- A 2019 article discovered today is not news. `period` carries what the data actually covers (e.g. "FY2025",
-- "calendar 2024"), because a report published this month can describe a year that is already old.
alter table studio_intel add column if not exists published_at date;
alter table studio_intel add column if not exists period text;

-- ── GAS Studio: final production ────────────────────────────────────────────
-- Background removal for the masthead / section-1 cut-outs. fal bills per COMPUTE SECOND, not per image,
-- and will not quote the GPU rate without a logged-in dashboard - so this row is seeded UNPRICED on purpose
-- rather than with an invented number. The usage event still lands with the right (provider, model, unit),
-- so the call is visible in Cost Control the moment it happens; only the rand figure needs calibrating from
-- fal's own billing page. A wrong price is worse than a missing one.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('fal','fal-ai/birefnet/v2','image', 0, 0, true)
on conflict (provider, model, unit) do nothing;

-- ── The two legal slots are NOT the same slot ────────────────────────────────
-- Gary, locked: "we can keep African Bank on the compliance copy but not in any suggested copy done by the
-- producer and not on any creatives."
--
-- So there are two distinct things, and the code was treating them as one:
--   compliance_text        the full legal copy. MAY name the bank. Lives on the funnel page, the SMS footer,
--                          anywhere legal text is required in HTML.
--   creative_legal_text    what is BAKED INTO A CREATIVE. The bank is never named here. Keeps the FSP number,
--                          which is the cheapest anti-scam signal we have - a scammer never carries a real
--                          licence number - without putting the bank's name in the brand's shop window.
alter table studio_brand_kits add column if not exists creative_legal_text text;
