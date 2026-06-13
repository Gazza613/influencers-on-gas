# Project context for Claude Code — GAS Studio

Read this first. **This repo was re-platformed (June 2026)** from a React+Vite SPA
into a **Next.js agency video-production studio** ("GAS Studio"). The old SPA is
preserved on the `archive/vite-spa` branch + `v1-vite-spa` tag — salvage IP from
there, don't resurrect it.

## What this app is (the pivot)

GAS Marketing's internal tool to turn a brief into a publish-ready **45-second**
(configurable 15/30/45/60s) AI-influencer video, via a **producer co-pilot** +
per-client **"brain" (RAG)** through a durable, **cost-gated** pipeline. Built for
GAS's own team first (Iteration 1); multi-tenant + the performance-learning loop
are Iteration 2.

**The full spec + locked decisions live in [`docs/pivot/`](docs/pivot/) — read
`docs/pivot/SYNTHESIS.md` first**, then the 10 topic PDFs (`CLAUDE.pdf` is the
master brief).

## Stack (locked — see SYNTHESIS.md)

- **Next.js 16** (App Router, TypeScript, Tailwind v4) on **Vercel**
- **Neon Postgres + pgvector** (`@neondatabase/serverless`; never `@vercel/kv`/`@vercel/postgres`)
- **Auth.js v5** (`auth.ts` / `auth.config.ts` / `proxy.ts`) — v1 is a single super-admin (Gary) from env; moves to the `users` table in Phase 1b
- **Inngest** (durable pipeline — not yet added), **Vercel Blob** (storage)
- Vendors (GAS-funded, GAS's own accounts): **Anthropic** (Sonnet 4.6 default / Opus 4.8 premium / Haiku 4.5 ingestion), **ElevenLabs** (TTS/Music/SFX/Scribe), **HeyGen** (a-roll), **Higgsfield** (Soul/Seedance b-roll), **Magnific** (skin realism), **Shotstack** (assembly), **Voyage** `voyage-3.5` embeddings (1024-dim), **Firecrawl** (crawl)

## Key files (current — Phase 1 foundation)

| Path | What |
|---|---|
| `app/layout.tsx`, `app/globals.css` | Root layout + "control-room" design tokens (Tailwind v4 `@theme`) |
| `app/page.tsx` | The GAS Studio shell (5-region skeleton: topbar, stage spine, workspace, co-pilot, build spine) |
| `app/login/page.tsx` | GAS-branded sign-in |
| `auth.ts` / `auth.config.ts` / `proxy.ts` | Auth.js v5 gate (super-admin only for v1) |
| `lib/db.ts` | Lazy Neon client |
| `db/schema.sql` | Full Postgres schema (users, clients/brains, client_profiles, knowledge_*, productions, production_steps, rate_card, budgets, consents, …) |
| `scripts/migrate.mjs` | Applies `db/schema.sql` to Neon (`npm run db:migrate`) |
| `.env.example` | All required env vars |

## Conventions

- TypeScript everywhere; Tailwind utility classes with the design tokens
  (`bg-surface-1`, `text-ink-dim`, `text-accent`, `.tabular` for numeric data).
- `client_id` is the tenancy/brain key — it must thread through every table,
  query, and RAG retrieval. A brain can never read another brain's data
  (ships only after the isolation regression test passes).
- **Prices live in the `rate_card` table, never in code.**
- Cost control = **dials, never a quality cap**; nothing calls a paid API before
  passing the budget gate.

## Dev workflow

```bash
npm install
npm run dev          # local dev server (development only)
npm run build        # production build
npm run db:migrate   # apply db/schema.sql to Neon (needs DATABASE_URL)
```

## Working preferences

- **Cloud-first**: commit + push to GitHub (`influencers-on-gas`) and deploy on
  Vercel; verify on the live deploy, not localhost.
- Keep the **influencer builder** concept (it moves to Setup → Influencers and
  gains Soul training + ElevenLabs voice + consent + "Build Me" twin).
- Build strictly in the phase order from `docs/pivot/CLAUDE.pdf` / `SYNTHESIS.md`.
