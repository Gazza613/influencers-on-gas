// Pure config for the Proposal (no server imports), so both the server engine (lib/proposal.ts) and the client UI
// can share one source of truth for objectives, the rate card and the platforms.

// The client's commercial objective (Meta outcome objectives, in GAS's language). Lead Generation (PSI) is default.
export const OBJECTIVES = [
  { id: "leads", label: "Lead Generation (PSI)", meta: "Leads", note: "Qualified, sales-ready enquiries scored by PSI." },
  { id: "awareness", label: "Awareness", meta: "Awareness", note: "Reach and brand salience with the right audience." },
  { id: "engagement", label: "Engagement & Community", meta: "Engagement", note: "Follows, likes and an owned community that compounds." },
  { id: "traffic", label: "Traffic", meta: "Traffic", note: "Qualified clicks to a landing page or destination." },
  { id: "app", label: "App Downloads", meta: "App promotion", note: "Installs and active users." },
  { id: "sales", label: "Sales & Conversions", meta: "Sales", note: "Direct purchases or conversions." },
] as const;
export type ObjectiveId = (typeof OBJECTIVES)[number]["id"];

// The rate card (toggle; Dominate is the anchor).
export const TIERS = {
  launch: {
    id: "launch", name: "Launch", tagline: "Establish the engine", rate: "R100 000 / month excl VAT", recommended: false,
    scope: "The full eight-pod closed loop, configured around a single core objective and a focused primary channel set, run end to end from research to real-time optimisation.",
    cadence: "Monthly strategic review. Live within the first three weeks; closed loop running by day thirty-one.",
  },
  dominate: {
    id: "dominate", name: "Dominate", tagline: "Own the category", rate: "R150 000 / month excl VAT", recommended: true,
    scope: "The full eight-pod engine at full omnichannel scale, with the complete PSI stack and a bi-weekly optimisation cadence, so the compounding advantage widens quarter on quarter.",
    cadence: "Bi-weekly strategic review and priority senior access, with an optional performance incentive linked to PSI-qualified outcomes.",
  },
} as const;
export type TierId = keyof typeof TIERS;

// The platforms GAS runs, for the platform-level audience selections and the channel plan.
export const PLATFORMS = ["Facebook", "Instagram", "TikTok", "Google Display", "LinkedIn"] as const;

// The eight pods, in GAS's naming.
export const PODS = [
  { key: "researcher", name: "Researcher", layer: "Intelligence" },
  { key: "strategist", name: "Strategist", layer: "Intelligence" },
  { key: "audience", name: "Audience", layer: "Execution" },
  { key: "creative", name: "Creative", layer: "Execution" },
  { key: "channels", name: "Channels", layer: "Execution" },
  { key: "psi", name: "PSI", layer: "Conversion" },
  { key: "psi_dashboard", name: "PSI Conversion Dashboard", layer: "Conversion" },
  { key: "media_on_gas", name: "Media on GAS", layer: "Learning" },
] as const;
