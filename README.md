# Influencers on GAS

An internal GAS Marketing web app for building, managing, and generating AI
influencers. React + Vite frontend, Higgsfield for image & video generation,
Claude for prompt assistance. Deployed on Vercel behind a shared team password.

---

## Running it locally (developers)

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build
npm run preview  # preview the production build
```

Get the code from the GitHub repo:
[github.com/Gazza613/influencers-on-gas](https://github.com/Gazza613/influencers-on-gas).

---

## How access works

- The live site is gated by a single shared **team password**
  (`APP_ACCESS_PASSWORD`). The team enters it once.
- **Higgsfield** (images/video) and **Claude** (prompt assistance) are
  centralized server-side — the team never logs into either. Credentials live
  in Vercel environment variables; the Higgsfield token rotates via Vercel KV.

---

## Project structure

```
src/
  pages/           Routes: Landing, Influencers, Inspiration, BrandDeals, Create, Settings
  components/      Reusable UI: Nav, ImageGrid, MasonryGrid, Lightbox, AppGate
  context/         React contexts (theme)
  utils/           Higgsfield API, OAuth, prompt builders, image helpers
  store.jsx        localStorage-backed React contexts
api/               Vercel serverless functions (Claude + Higgsfield proxies, auth)
lib/               Server helpers (token store, rate limit, app auth)
```

---

## Deployment

The repo is Vercel-ready. Connecting the GitHub repo at vercel.com auto-detects
Vite + the `api/` folder. Required environment variables: `ANTHROPIC_API_KEY`,
`HF_CLIENT_ID`, `HF_REFRESH_TOKEN`, `APP_ACCESS_PASSWORD`, plus the Upstash KV
vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`).
