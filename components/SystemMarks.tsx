// THE SIX SYSTEMS, IN ONE PLACE.
//
// These marks were written on the dashboard and are now also on the public landing page. Kept here rather
// than copied, because two drifting copies of a brand mark is how a platform starts looking like two
// products. Each takes a gradient id suffix so the same mark can render twice on a page without the two
// <linearGradient> definitions colliding on a duplicate id - which silently makes the second one render flat.

export type SystemDef = { key: string; name: string; line: string; tint: string; mark: (id: string) => React.ReactNode };

function Inf(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
      </linearGradient></defs>
      <path d="M4 15V8a4 4 0 0 1 4-4h7M44 15V8a4 4 0 0 0-4-4h-7M4 33v7a4 4 0 0 0 4 4h7M44 33v7a4 4 0 0 1-4 4h-7" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="20.5" r="6.2" stroke={`url(#${id})`} strokeWidth="2.6" />
      <path d="M13.5 38c1.6-5.7 5.6-8.6 10.5-8.6S32.9 32.3 34.5 38" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
function Std(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
      </linearGradient></defs>
      <rect x="4" y="10" width="22" height="28" rx="3" stroke={`url(#${id})`} strokeWidth="2.6" />
      <rect x="30" y="10" width="14" height="14" rx="3" stroke={`url(#${id})`} strokeWidth="2.6" />
      <rect x="30" y="28" width="14" height="10" rx="3" stroke={`url(#${id})`} strokeWidth="2.6" />
    </svg>
  );
}
function Media(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
      </linearGradient></defs>
      <rect x="5" y="9" width="38" height="27" rx="3.5" stroke={`url(#${id})`} strokeWidth="2.6" />
      <path d="M11 26l6-7 5 6 4-9 5 10h6" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 42h12M24 36v6" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
function Psi(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#818CF8" />
      </linearGradient></defs>
      <path d="M6 8h36L28 25v13l-8 5V25L6 8Z" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="38" cy="34" r="6.5" stroke={`url(#${id})`} strokeWidth="2.4" />
      <path d="M35.4 34l1.9 1.9 3.4-3.6" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Strat(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#818CF8" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#EC4899" />
      </linearGradient></defs>
      <path d="M6 42V6M6 42h36" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M13 32l8-9 7 5 12-15" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="23" r="2.8" stroke={`url(#${id})`} strokeWidth="2.4" />
      <circle cx="40" cy="13" r="2.8" stroke={`url(#${id})`} strokeWidth="2.4" />
    </svg>
  );
}
function Jour(id: string) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-full w-full" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#22D3EE" /><stop offset="0.55" stopColor="#60A5FA" /><stop offset="1" stopColor="#818CF8" />
      </linearGradient></defs>
      <path d="M8 40l4.5-12.5L32 8a4.2 4.2 0 0 1 6 6L18.5 33.5 8 40Z" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M28 12l8 8M12.5 27.5l8 8" stroke={`url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

// Order matches the dashboard: Make, Run, Know. The lines are SHORT on purpose - these sit in small floating
// cards, and a blurb that needs three lines at that size is a blurb nobody reads.
export const SYSTEMS: SystemDef[] = [
  { key: "influencers", name: "Influencers on GAS", line: "AI influencers, brief to broadcast", tint: "#c084fc", mark: Inf },
  { key: "creatives", name: "Creatives on GAS", line: "A brief in, a live funnel out", tint: "#60a5fa", mark: Std },
  { key: "media", name: "Media on GAS", line: "Every channel, as it happens", tint: "#22d3ee", mark: Media },
  { key: "psi", name: "PSI on GAS", line: "Prospects qualified before you call", tint: "#f472b6", mark: Psi },
  { key: "strategist", name: "The Strategist", line: "Daily market intelligence", tint: "#a5b4fc", mark: Strat },
  { key: "journalist", name: "The Journalist", line: "Thought leadership a CEO signs", tint: "#67e8f9", mark: Jour },
];
