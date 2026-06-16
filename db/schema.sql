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
values ('firecrawl','scrape','page', 0, 15, true)
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

-- Native Higgsfield 4K upscale (bytedance) — replaces the external Magnific upscaler.
insert into rate_card (provider, model, unit, credits_per_unit, price_cents_per_unit, active)
values ('higgsfield','upscale_image','image', 2, 128, true)
on conflict (provider, model, unit) do nothing;

-- ── Showcase: a public brag wall of finished influencer videos ────────────────
-- Producers flag a complete production into the showcase; a single unguessable
-- public token serves the wall to prospects without a login.
alter table productions add column if not exists showcased boolean not null default false;

create table if not exists app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
