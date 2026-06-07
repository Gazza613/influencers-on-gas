# AI Influencer Studio

A local-first web app for building, managing, and generating AI influencers.
React + Vite frontend, Higgsfield for image & video generation, your own
Higgsfield account, your data lives in your browser.

---

## Setup (no tech experience needed)

You only install one thing — **Antigravity**. Everything else lives inside
it. Just follow these steps in order.

1. **Download the project.** Go to the
   [GitHub page](https://github.com/DaanKieft/ai-influencer), click the green
   **Code** button → **Download ZIP**, then unzip it onto your Desktop.
2. **Install Antigravity.** Search "Antigravity" on Google (or go to
   [antigravity.dev](https://antigravity.dev)) and install it like any app.
3. **Open the project.** In Antigravity, click **File → Open Folder** and pick
   the unzipped folder.
4. **Add Claude.** Click the **Extensions** icon in the left sidebar, search
   **Claude Code**, click **Install**, and sign in with your Anthropic account.
5. **Start it.** Open **Terminal → New Terminal**, type `claude`, press Enter,
   then tell Claude: *"install everything and start the app."*
6. **Open it.** When Claude says it's running, it will show a web address
   (something like `http://localhost:5173` — the number may differ on your
   computer). Open that address in Chrome.
7. **Connect Higgsfield.** In the app: **Settings → Connect Higgsfield** (uses
   your own Higgsfield credits).

That's it. Stuck on anything? Just ask Claude in the terminal — that's what
it's there for. To change something, tell it: *"change the homepage
headline,"* *"add a new vibe option,"* etc.

---

## Updating

In the terminal, type `claude` and tell it: *"get the latest version."*

Your saved data (influencers, brand deals, inspiration boards) stays in your
browser and survives updates.

---

## Project structure

```
src/
  pages/           Routes: Landing, Influencers, Inspiration, BrandDeals, Create, Settings
  components/      Reusable UI: Nav, ImageGrid, MasonryGrid, Lightbox
  context/         React contexts (theme)
  utils/           Higgsfield API, OAuth, prompt builders, image helpers
  store.jsx        localStorage-backed React contexts
api/               Vercel serverless functions (proxies + image proxy)
docs/              Prompt engineering reference docs
```

---

## Deployment (optional)
   
The repo is Vercel-ready. Connect the GitHub repo at vercel.com → it
auto-detects Vite + the `api/` folder and deploys in ~60 seconds. End
users still bring their own Higgsfield account.

---

Made by Dan Kieft.
