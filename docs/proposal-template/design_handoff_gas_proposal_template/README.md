# Handoff: GAS Proposal Master Template

## Integration target: `Gazza613/influencers-on-gas` (GAS Studio)
The repo already has a proposal engine this package upgrades: `lib/proposal-config.ts` (OBJECTIVES, TIERS, PLATFORMS, PODS — the pod names and Dominate/Launch tiers match this template's language), `lib/proposal.ts` (server engine), `lib/proposal-pdf.ts` (PDF renderer) and `components/ProposalBuilder.tsx` (UI). Implement this template as the visual + structural spec for that pipeline:
- Keep `lib/proposal-config.ts` as the single source of truth for pods/tiers; extend it with this template's page list and per-page content slots.
- Recreate the 24-page structure in the PDF renderer (`lib/proposal-pdf.ts`) or an HTML-to-PDF route, one `<section>` per A4 page, inline styles per the token sheet below.
- Client CI recolouring = swapping the three gradients + accent hexes (see Design Tokens); wire those to the existing `lib/brand-colours.ts`.
- Commit this folder under `docs/proposal-template/` in the repo so Claude Code can reference it while implementing.

## Overview
A world-class, 24-page A4 client pitch proposal system for GAS Marketing Automation ("The Agency of NOW"). The template walks a prospective client through the eight-pod GAS growth ecosystem, personalised to their market research, and closes with a rate card, one-page agency agreement and sign-off. The goal of this handoff: implement this as a repeatable, data-driven proposal generator in your platform, where a new client proposal is produced by supplying (1) client name and CI colours, (2) client logo, (3) the strategy/research content per section.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes showing the intended look, layout and copy structure, not production code to copy directly. Recreate these designs in your target codebase's environment (React, Vue, server-rendered templates, PDF pipeline, etc.) using its established patterns. If no environment exists yet, choose the framework that best supports paged A4 print output (e.g. React + Paged.js, or headless-Chrome print-to-PDF).

Two implementation notes about the reference files:
- `GAS Proposal Master Template.dc.html` and the example under `example-client/` are "Design Component" files: the design markup lives between `<x-dc>` and `</x-dc>`; a small runtime (`support.js`) renders it. Ignore the runtime; treat the markup inside `<x-dc>` as the source of truth. Every style is inline on the element, so each `<section class="page">` is fully self-describing.
- `doc-page.js` provides the `<doc-page size="a4">` wrapper that lays sections out as fixed A4 pages (794x1123 CSS px) and owns print geometry. In your implementation, each `<section class="page">` = one A4 page, `overflow:hidden`, fixed page box.

## Fidelity
**High-fidelity.** These are pixel-final designs: colours, typography, spacing, iconography and copy patterns are exact. Recreate pixel-perfectly.

## Document Structure (24 pages, fixed order)
1. **Cover** (dark gradient) — GAS logo disc + wordmark top-left, client logo top-right, eyebrow "Growth Proposal · Strictly Confidential", wedge headline (46px, two lines, key phrase in gradient text), one-paragraph engine summary, two footer chips on one line (client/campaign left, date + validity right).
2. **The case in one page** — intro paragraph + 4 icon cards (2x2) + "The journey, deliberately short" strip: Paid ad → WhatsApp → PSI score → Tasting/next step booked.
3. **The opportunity** — two paragraphs + 6 stat cards (3x2: each = icon disc + big stat + body + source line) + dark "definition of success" box.
4. **Strategic recommendation** — dark wedge-statement box + argument paragraph + 6 check-disc proof cards (2x3) + "How the argument lands" flow (reason to believe → reason to buy → commercial outcome).
5. **Market intelligence** — intro + market split bar (declining vs growing sub-sector) + 4 dark sourced stat-quote cards + 6 "what we do about it" check-disc cards.
6. **Human Command. AI Execution.** (dark) — intro, "AI does" / "Humans do" cards with icon pills, "Together" card, 3 value chips stretched across the bottom.
7. **Eight pods, one engine** — pod cards grouped in 3 layers (Intelligence / Execution / Conversion+Learning), "How intelligence flows" 8-node icon strip, gradient feedback-loop pill above footer.
8. **"VIII" giant-type divider** (dark) — 140px gradient roman numeral, "Eight AI Marketing Pods. / One accountable partner." on two lines, 8 pod chips.
9. **Pods I-II** — two pod blocks (numbered disc + name + subtitle + applied paragraph + purple outcome chip) + competitive positioning map (plotted quadrant, competitors as muted dots, client glowing top-right).
10. **Pod III + trade personas** — applied paragraph + 4 persona cards (icon disc + name + geo line + italic angle quote) + trade-only discipline note + budget-weighting bar (primary/tighter/gated) + geo-focus chips.
11. **Platform-level targeting** — one row per persona with platform chips and real targeting stacks (interests, job titles, custom-intent keywords) + persona-to-channel dot matrix (lead/support/test legend).
12. **Pod IV Creative** — pod page + "launch asset system" strip: 4 mini ad-format frames (ratio label + icon on dark thumb + caption).
13. **Pod V channel plan** — intro + 5 channel rows (icon disc + name + LEAD/SUPPORT/TEST role chip + what + why-italic).
14. **Pod VI PSI** (dark) — HIGH/MEDIUM/LOW score tiles, WhatsApp chat mock (assistant header with ONLINE pill, 3 bubbles, "High intent · Tasting booked" green pill), 3 side cards, benefit chips.
15. **Pods VII-VIII** — two pod blocks + "the one screen the bi-weekly review argues from": 2x2 dark KPI tiles with SVG sparklines (cost trending down, conversation bars, qualified-leads line up, tastings gauge), labelled "Illustrative preview".
16. **Closed loop** (dark) — full-page circular diagram: 620px dashed ring, 6 step nodes around it, 6 gradient arrow discs on the ring, centre = glowing GAS disc + "The Agency of NOW" + "From Interest to Intent", compounding-mechanism callout below.
17. **31-day rollout** — W1→W4 timeline rail (gradient line + numbered gate discs) + 4 gated week cards (2x2: icon, pods tag, bullets, gate pill).
18. **Funnel + KPIs** — italic disclaimer, 6 narrowing funnel bars (100%→30% width), KPI table (3 columns: metric / why it matters / baseline and target; dark header row).
19. **Governance** — "Trusted with data, by design" + 8 check-disc commitment cards + compliance stack pills (POPIA, GDPR-aligned, Platform policies, Verified-claims register).
20. **"No Fine Print" divider** (dark) — giant gradient type + "One tier. One page of terms." + 4 chips.
21. **Investment** — Dominate rate card: dark card with tier name, "Own the category", proof-of-concept chip, R150k / month excl VAT, 8 inclusion cells, 3 light footnote cards, honest-expectations paragraph.
22. **Terms and closing** (dark) — "We are writing its rulebook" headline, 4 term cards, 3 chips pinned above footer on one line.
23. **One-page agency agreement** — 6 clause cards (Engagement, Payment, Media spend, Ownership, Confidentiality and data, Exit) + dark closing strip.
24. **Sign-off** (white background) — two signature cards side by side: GAS (Gary Berman · Managing Director · 082 566 3708 · gary@gasmarketing.co.za) and client (authorised signatory + contacts), each with signature/date rule and small logo + tagline row.

Every content page carries: an uppercase tracked eyebrow ("NN · Section"), a 28-30px 800-weight uppercase headline with one gradient phrase, and a footer rule with "GAS Marketing Automation · The Agency of NOW" left and "Client · NN" (zero-padded) right. Pod pages carry a 190px ghost roman numeral at 6% opacity top-right (`pointer-events:none`).

## Design Tokens (Chilla example palette — see Adaptation)
- Page: A4 794x1123px; light pages `background:#FAF8FC`, padding 48-52px 60px 36-40px; dark pages `linear-gradient(135deg,#1C1140 0%,#2B1A55 55%,#4A2A7A 100%)`.
- Dark card gradient: `linear-gradient(160deg,#241650 0%,#33206B 45%,#4A2A7A 100%)`.
- Accent gradient (chips, gradient text): `linear-gradient(135deg,#B05BD6 0%,#6E2FA0 100%)`; gradient text via `background-clip:text` + transparent fill.
- Icon disc: `radial-gradient(120% 120% at 30% 25%,#C77DE8 0%,#9B4FC9 38%,#5E2189 100%)`, white 2px-stroke icon at ~50% of disc size.
- Solids: ink `#1A1030`/`#101828`, body `#372F45`, muted `#544A63`, accents `#7B2FA8` / `#5E2189` / `#C77DE8` (on dark), light tint `#F3EDF9`, success green `#7CE38B`.
- Cards: white, radius 12-16px, shadow `0 6px 18px rgba(46,26,74,0.08)`; on dark `rgba(255,255,255,0.06-0.10)` + 1px `rgba(255,255,255,0.14-0.22)` border.
- Pills: fully rounded (999px), uppercase, tracked.
- Type: Poppins only (Google Fonts), weights 400/600/700/800. Scale: eyebrow 10px/600/0.28em; headline 28-30px/800 uppercase; body 10-12.5px/1.55-1.7; card titles 11-14px/700; footers 9px/0.18em; giant divider numerals 120-140px/800 gradient text.
- Icons: Lucide-style inline SVG, 2px stroke, round caps, white in gradient discs. Never emoji.

## Interactions & Behaviour
Static print document. No hover states, no JS behaviour required. Must render identically on screen and in print (PDF export at A4, one section per page, `overflow:hidden` per page, no viewport units).

## Content & Adaptation Rules (implement as template inputs)
- **Palette recolouring**: the whole document recolours to the client's CI by swapping the token set above (find-replace on hex values in the reference). Keep the structural greys/whites; swap the 3 gradients + accent hexes.
- **Journey is fixed**: paid ad → WhatsApp conversation → PSI intent score → booked next step (tasting/consultation). Never landing-page/form funnels.
- **Pod names fixed**: I Researcher, II Strategist, III Audience, IV Creative, V Channels, VI PSI (Pre-Sales Intelligence), VII PSI Conversion Dashboard, VIII Media on GAS. Always "Pod/Pods", never "Pillar".
- **Evidence discipline**: every stat carries a named source and date; no fabricated numbers; baselines are "measured in week one"; funnel figures always labelled illustrative; no outcome guarantees; no exclusivity claims ("only").
- **Copy style**: UK British English; no em dashes (use commas, colons, full stops); punchy verb-led sentences; headlines uppercase with one gradient phrase; "we/you" address.
- **Commercials**: retainer payable upfront, no credit terms; GAS makes no profit/markup/commission on media; media budget decided by client, additional to retainer; everything built belongs to the client from day one; month-to-month after PoC, 30 days notice; billing contact Cherice Len (cherice@gasmarketing.co.za); signatory Gary Berman, MD.
- **Variable per deal**: client name/logo/CI, proof-of-concept length, tier/rate, personas and their targeting stacks, stat cards, market intelligence, rollout details, KPI rows, validity date.
- Renumber page footers sequentially after any page add/remove.

## Assets
- `assets/chilla-logo-white.svg`, `assets/chilla-logo-purple.svg` — example client logo (swap per client).
- GAS logo is not an image: it is a built element (gradient disc containing "GAS" + two-line wordmark). Recreate as a component.
- All icons are inline SVG in the markup (self-contained).
- `_ds/gas-design-system-.../` — the GAS design-system tokens and styles the reference links to (fonts.css loads Poppins; colors/typography/spacing tokens). Useful as token reference; the proposal pages themselves are inline-styled and do not depend on these classes.

## Files
- `GAS Proposal Master Template.dc.html` — the master template (source of truth).
- `example-client/Chilla Proposal v5.dc.html` — a fully adapted real example (shows the system personalised to a client).
- `example-client/Boston City Campus Proposal.dc.html` — a second real example showing deeper commercial adaptation: a two-page expanded rate card (9-row provincial scale table, fee breakdown, technical-stack inclusions, executive commercial summary, capacity clause), a client-specific rollout timeline (4-week build → W4 launch → 3-month proof → provincial scale) and a crimson/navy client CI recolour. Use it as the reference for variable-scope commercial models.
- `support.js`, `doc-page.js` — preview runtime for the reference files only; not for production.
- `PROJECT_RULES.md` — the standing adaptation instructions used by the design side.
