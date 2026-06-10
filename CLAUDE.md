# Project context for Claude Code

This file gives a new Claude Code session enough context to be useful
immediately. Read this first before making changes.

## What this app is

A React+Vite single-page app for designing and generating AI influencers.
Local-first: every user's data lives in their own browser localStorage.
Image and video generation happens through the user's own Higgsfield
account (OAuth, PKCE).

## Tech stack

- **React 18** + **Vite 5** + **React Router 6**
- **No build-time API keys** — Higgsfield is OAuthed per-user; the optional
  Claude features call through a serverless proxy that expects an
  `x-api-key` header from the browser.
- **Vercel** is the intended host: `api/*.js` are Vercel serverless
  functions, and `vite.config.js` mirrors them as local dev proxies so
  the dev server behaves the same as production.

## Key files to know

| Path | What it does |
|---|---|
| `src/App.jsx` | Routes + `<ThemeProvider>` + `<StoreProvider>` |
| `src/store.jsx` | localStorage-backed contexts (`useInfluencers`, etc.) and the `Kayla` seed |
| `src/utils/higgsfieldAuth.js` | OAuth PKCE flow against `mcp.higgsfield.ai` |
| `src/utils/higgsfieldGenerate.js` | MCP-style image/video generation, polling, media uploads |
| `src/utils/systemPrompt.js` | Prompt templates — poses, wardrobe library, vibe palettes, Soul vs GPT Image 2 variants |
| `src/pages/Create.jsx` | Multi-step influencer creation wizard |
| `src/pages/Influencers.jsx` | Page shell only (~640 lines): sidebar, influencer resolution, tab routing, CRUD. Renders the pieces below. |
| `src/pages/influencers/` | Extracted internals: `constants.js`, `helpers.js`, `prompts.js`, `storage.js`, `ContentStudio.jsx` (Content/Video Studio), and `components/*` (HeroBanner, image slots, Scripts, Wardrobe, BrandDeals, Media/History, common leaf comps, …) |
| `api/hfproxy.js` | Authed edge function that proxies all Higgsfield MCP traffic (injects the shared owner token server-side) and forwards SSE streams. `vercel.json` rewrites `/api/hf/*` → here. |
| `api/claude.js` | Anthropic API proxy — caller supplies their own `x-api-key` |

## Conventions

- Inline styles with CSS variables (`var(--bg)`, `var(--text-primary)`).
  Theme tokens are set on `<html data-theme="dark|light">` from
  `src/context/theme.jsx`.
- IDs use `generateId()` from `store.jsx` (`Date.now() + random`).
- Higgsfield models supported: `soul_2`, `gpt_image_2`, `nano_banana_2`,
  `nano_banana_flash`, `seedance_2_0`. Soul has its own simplified
  pose set (`POSES_SOUL`) because it struggles with detailed spatial pose
  instructions.

## Things not to do

- **Never kill the Vite dev server** (port 5173). The owner wants it
  running at all times.
- Don't trust the comment in `modelBaseParams` saying resolution and
  quality conflict for `gpt_image_2` — they don't, the working code
  intentionally passes both.
- The old 6,400-line `Influencers.jsx` was split into `src/pages/influencers/`
  by pure mechanical extraction (one component/module per file, props-only,
  no state untangling). Keep that boundary: shared data → `constants.js`,
  pure fns/hooks → `helpers.js`, prompt strings → `prompts.js`, localStorage →
  `storage.js`, leaf UI → `components/common.jsx`. `ContentStudio.jsx` is still
  ~2,150 lines and internally tangled — refactoring *its* state needs a
  dedicated session with in-browser verification of every generate flow.

## Dev workflow

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
npm run preview      # preview the production build locally
```

To diagnose Higgsfield issues, flip `HF_DEBUG = true` at the top of
`src/utils/higgsfieldGenerate.js` for verbose request/response logs.
