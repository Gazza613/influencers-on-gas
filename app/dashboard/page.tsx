import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MarketQuestion from "@/components/MarketQuestion";
import PodAgents from "@/components/PodAgents";
import DashboardMotion from "@/components/DashboardMotion";
import { listStudioClients } from "@/lib/studio";
import { POD_AGENTS } from "@/lib/pod-agents";

// Section accent (the numbered platform layers). Matches each group's dominant hue.
const SECTION_ACCENT: Record<string, string> = {
  Intelligence: "#a855f7", Know: "#34d399", Make: "#60a5fa", Run: "#38bdf8",
};

// THE AGENCY OF NOW - the first screen after sign-in. It does one job: get the team to the right desk.
//
// It is grouped, not gridded, and that is the point. Six tiles laid out flat say "here are six things". Six
// tiles in three named pairs say what this agency actually IS: we MAKE the work, we KNOW the market, and we RUN
// it live. The team reads the shape of the business before they read a single tile.
//
// Palette: everything stays in the pink/purple/blue accent family, separated by hue within it rather than by
// introducing new colours. Orange is the GAS mark alone and never a background wash.
//
// A server component on purpose: no client JS for a page whose job is to be instant. The life on it (the drifting
// glows, the hover lifts) is CSS.
export const dynamic = "force-dynamic";

// Custom marks, not emoji. Each says what its desk does in one glance.
function InfluencerMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="inf-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M4 15V8a4 4 0 0 1 4-4h7M44 15V8a4 4 0 0 0-4-4h-7M4 33v7a4 4 0 0 0 4 4h7M44 33v7a4 4 0 0 1-4 4h-7"
        stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="20.5" r="6.2" stroke="url(#inf-g)" strokeWidth="2.6" />
      <path d="M13.5 38c1.6-5.7 5.6-8.6 10.5-8.6S32.9 32.3 34.5 38" stroke="url(#inf-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function StudioMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="std-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="22" height="28" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="30" y="10" width="14" height="14" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
      <rect x="30" y="28" width="14" height="10" rx="3" stroke="url(#std-g)" strokeWidth="2.6" />
    </svg>
  );
}

// The Brain: a knowledge graph - a central node the whole engine reads and writes, with its connected memory.
function BrainMark() {
  // An actual brain (Gary): two hemispheres, the centre divide and inner folds, in the accent gradient.
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9" stroke="url(#br-g)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <defs>
        <linearGradient id="br-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A855F7" /><stop offset="0.55" stopColor="#818CF8" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path d="M12 18V5" />
      <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
      <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
      <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
      <path d="M18 18a4 4 0 0 0 2-7.464" />
      <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
      <path d="M6 18a4 4 0 0 1-2-7.464" />
      <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
    </svg>
  );
}

// The Researcher: a magnifying glass over a small bar chart - analysis, not reporting.
function ResearcherMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="rs-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" /><stop offset="0.55" stopColor="#60A5FA" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <circle cx="21" cy="21" r="13" stroke="url(#rs-g)" strokeWidth="2.6" />
      <path d="M31 31l8 8" stroke="url(#rs-g)" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M16 24v-4M21 24v-8M26 24v-6" stroke="url(#rs-g)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function StrategistMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="st-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path d="M6 42V6M6 42h36" stroke="url(#st-g)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M13 32l8-9 7 5 12-15" stroke="url(#st-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="23" r="2.8" stroke="url(#st-g)" strokeWidth="2.4" />
      <circle cx="40" cy="13" r="2.8" stroke="url(#st-g)" strokeWidth="2.4" />
    </svg>
  );
}

function MediaMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="md-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" /><stop offset="0.55" stopColor="#22D3EE" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <rect x="5" y="9" width="38" height="27" rx="3.5" stroke="url(#md-g)" strokeWidth="2.6" />
      <path d="M11 26l6-7 5 6 4-9 5 10h6" stroke="url(#md-g)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 42h12M24 36v6" stroke="url(#md-g)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function PsiMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="psi-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#818CF8" />
        </linearGradient>
      </defs>
      <path d="M6 8h36L28 25v13l-8 5V25L6 8Z" stroke="url(#psi-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="38" cy="34" r="6.5" stroke="url(#psi-g)" strokeWidth="2.4" />
      <path d="M35.4 34l1.9 1.9 3.4-3.6" stroke="url(#psi-g)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AudienceMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <circle cx="18" cy="17" r="6" stroke="currentColor" strokeWidth="2.6" />
      <path d="M6 40c1.8-6.6 6.3-10 12-10s10.2 3.4 12 10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="34" cy="14" r="4.6" stroke="currentColor" strokeWidth="2.2" opacity="0.75" />
      <path d="M30 32c1.2-4.4 4.2-6.7 8-6.7 1.9 0 3.6.6 5 1.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

// The Channels: a central hub broadcasting out to the platforms the audience lives on.
function ChannelsMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <circle cx="24" cy="24" r="5.5" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="10" cy="12" r="3.4" stroke="currentColor" strokeWidth="2.2" opacity="0.8" />
      <circle cx="38" cy="12" r="3.4" stroke="currentColor" strokeWidth="2.2" opacity="0.8" />
      <circle cx="12" cy="38" r="3.4" stroke="currentColor" strokeWidth="2.2" opacity="0.8" />
      <circle cx="37" cy="37" r="3.4" stroke="currentColor" strokeWidth="2.2" opacity="0.8" />
      <path d="M20 20 12.5 14M28 20 35.5 14M20 28 14.5 35M28 28 34 34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

// The Proposal: a document with a signed-off checkmark - the client-ready deliverable at the end of the flow.
function ProposalMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" aria-hidden>
      <defs>
        <linearGradient id="pp-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EC4899" /><stop offset="0.55" stopColor="#A855F7" /><stop offset="1" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M13 5h16l7 7v31a1 1 0 0 1-1 1H13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="url(#pp-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M29 5v7h7" stroke="url(#pp-g)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M18 24h12M18 30h12" stroke="url(#pp-g)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 37l3 3 7-7" stroke="url(#pp-g)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Door = {
  name: React.ReactNode;
  href: string;
  external?: boolean;
  mark: React.ReactNode;
  blurb: string;
  action: string;
  ring: string;      // border + hover glow
  wash: string;      // the faint gradient inside the card
  accent: string;    // the action text
  pod?: string;      // key into POD_AGENTS: renders the "N expert agents live here" flex badge, click for the roster (Gary)
  // An optional SECOND destination in the corner (the showcase eye). A card can have two jobs: go to work, or
  // go and look at the work.
  peek?: { href: string; label: string };
  // Full width within its group. Used for the tool that serves every desk rather than being one of them.
  wide?: boolean;
  // A desk that does not exist yet. Rendered as a real tile so the shape of the platform is visible, but it
  // does not pretend to be clickable - a placeholder that looks live is just a dead end with better manners.
  soon?: boolean;
  // A STEP in a sequenced flow (the Intelligence section is a 1-2-3-4 stepped system). Drawn as a faint
  // number watermark so the order reads at a glance.
  step?: number;
};

// The showcase eye. An eye, not a link icon, because the job is "go and SEE the work".
function EyeMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

// GARY'S STEPPED INTELLIGENCE FLOW (Aug 2026): the first section is a sequenced "Know your customer" system,
// 1-2-3-4. The Researcher feeds the Brain (no duplication), the Strategist reasons over it, the Proposal is the
// deliverable. Order + step-number watermarks make it read as one guided flow, not four separate tools.
const GROUPS: { label: string; note: string; doors: Door[] }[] = [
  {
    label: "Intelligence",
    note: "Know your customer: brain → research → strategy → proposal.",
    doors: [
      {
        name: <>The <span className="brand-grad">Brain</span></>,
        href: "/setup/brains",
        mark: <BrainMark />,
        blurb: "The starting point and the client's living knowledge base. Enter their website(s) and it crawls them in with Firecrawl, so even JavaScript and Cloudflare sites read; add documents, logo and brand rules too.",
        action: "Build the Brain",
        pod: "brain",
        step: 1,
        ring: "border-[#a855f7]/30 hover:border-[#a855f7]/70 hover:shadow-[0_0_50px_-12px_rgba(168,85,247,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#c4b5fd]",
      },
      {
        name: <>The <span className="brand-grad">Researcher</span></>,
        href: "/researcher",
        mark: <ResearcherMark />,
        blurb: "A commissioned deep dive built on the brain: it reads the client's own crawled material as ground truth, then verifies the external record, the market, competitors and positioning, and feeds its findings back.",
        action: "Research the market",
        pod: "researcher",
        step: 2,
        ring: "border-[#22d3ee]/30 hover:border-[#22d3ee]/70 hover:shadow-[0_0_50px_-12px_rgba(34,211,238,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#67e8f9]",
      },
      {
        name: <>The <span className="brand-grad">Strategist</span></>,
        href: "/strategist/plan",
        mark: <StrategistMark />,
        blurb: "Turns the approved fact base into one single-minded, defensible strategy, every point traced to a fact. You refine and approve at Gate 2.",
        action: "Set the strategy",
        pod: "strategist",
        step: 3,
        ring: "border-[#818cf8]/30 hover:border-[#818cf8]/70 hover:shadow-[0_0_50px_-12px_rgba(129,140,248,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#a5b4fc]",
      },
      {
        // The proposal is generated from the APPROVED strategy, on the strategist plan page (Gate 3), so it
        // shares that destination for now. A dedicated /proposal surface can split it out later.
        name: <>The <span className="brand-grad">Proposal</span></>,
        href: "/strategist/plan",
        mark: <ProposalMark />,
        blurb: "Turns the approved strategy into a client-ready, 24-page branded proposal, recoloured to the client's own brand. Three investment options, dated on download and ready to sign.",
        action: "Generate the proposal",
        pod: "proposal",
        step: 4,
        ring: "border-[#ec4899]/30 hover:border-[#ec4899]/70 hover:shadow-[0_0_50px_-12px_rgba(236,72,153,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#f9a8d4]",
      },
    ],
  },
  {
    label: "Know",
    note: "Finding your perfect target audience and what digital platforms they frequent.",
    doors: [
      {
        name: <>Audience <span className="brand-grad">on</span> GAS</>,
        href: "#",
        mark: <AudienceMark />,
        blurb: "Building next.",
        action: "Coming soon",
        soon: true,
        ring: "border-[#34d399]/30 hover:border-[#34d399]/50",
        wash: "from-[#34d399]/[0.09] to-[#22d3ee]/[0.04]",
        accent: "text-[#6ee7b7]",
      },
      {
        name: <>Channels <span className="brand-grad">on</span> GAS</>,
        href: "#",
        mark: <ChannelsMark />,
        blurb: "Building next.",
        action: "Coming soon",
        soon: true,
        ring: "border-[#34d399]/30 hover:border-[#34d399]/50",
        wash: "from-[#34d399]/[0.09] to-[#22d3ee]/[0.04]",
        accent: "text-[#6ee7b7]",
      },
    ],
  },
  {
    label: "Make",
    note: "The work itself.",
    doors: [
      {
        name: <>Influencers <span className="brand-grad">on</span> GAS</>,
        href: "/influencers",
        mark: <InfluencerMark />,
        blurb: "Cast a face, give it a voice, then shoot and cut the film. A complete AI-influencer studio, brief to broadcast-ready.",
        action: "Open the studio",
        peek: { href: "/s/showcase", label: "See the showcase" },
        ring: "border-[#a855f7]/30 hover:border-[#a855f7]/70 hover:shadow-[0_0_50px_-12px_rgba(168,85,247,0.45)]",
        wash: "from-[#a855f7]/[0.10] to-[#ec4899]/[0.04]",
        accent: "text-[#d8b4fe]",
      },
      {
        // "Creatives on GAS" (Gary, Aug 2026): the PLATFORM is now "The Agency of NOW". "Studio" is retired as a
        // platform name and kept ONLY as this route - the creative factory desk. The desk is named for what it
        // actually produces, so the part never reads as the whole.
        name: <>Creatives <span className="brand-grad">on</span> GAS</>,
        href: "/studio",
        mark: <StudioMark />,
        blurb: "A brief in, a publish-ready funnel out. Every creative built on the client's own proven designs, never invented from scratch.",
        action: "Open the factory",
        ring: "border-[#60a5fa]/30 hover:border-[#60a5fa]/70 hover:shadow-[0_0_50px_-12px_rgba(96,165,250,0.45)]",
        wash: "from-[#60a5fa]/[0.10] to-[#22d3ee]/[0.04]",
        accent: "text-[#93c5fd]",
      },
    ],
  },
  {
    label: "Run",
    note: "Live, in market, right now.",
    doors: [
      {
        name: <>Media <span className="brand-grad">on</span> GAS</>,
        href: "https://media.gasmarketing.co.za/",
        external: true,
        mark: <MediaMark />,
        blurb: "Live campaign insight, as it happens. What the media is doing right now, every channel on a single dashboard.",
        action: "Open Media",
        ring: "border-[#38bdf8]/30 hover:border-[#38bdf8]/70 hover:shadow-[0_0_50px_-12px_rgba(56,189,248,0.45)]",
        wash: "from-[#38bdf8]/[0.10] to-[#60a5fa]/[0.04]",
        accent: "text-[#7dd3fc]",
      },
      {
        name: <>PSI <span className="brand-grad">on</span> GAS</>,
        href: "https://psi.gasmarketing.co.za/",
        external: true,
        mark: <PsiMark />,
        blurb: "Pre-Sales Intelligence. Qualifies and nurtures every prospect until they are a high-intent lead worth handing over.",
        action: "Open PSI",
        peek: { href: "https://psi.gasmarketing.co.za/c/brightrock", label: "Preview the BrightRock PSI" },
        ring: "border-[#ec4899]/30 hover:border-[#ec4899]/70 hover:shadow-[0_0_50px_-12px_rgba(236,72,153,0.45)]",
        wash: "from-[#ec4899]/[0.10] to-[#a855f7]/[0.04]",
        accent: "text-[#f9a8d4]",
      },
    ],
  },
];

function Tile({ d, podNo, size = "" }: { d: Door; podNo: number; size?: string }) {
  // The tile's single accent hex, read from its ring class (e.g. "border-[#a855f7]/30" -> "#a855f7"), so the
  // neon glass, border-glow, mark and pill all sing in the pod's own hue via one CSS custom property.
  const a = d.ring.match(/#[0-9a-fA-F]{6}/)?.[0] || "#a855f7";
  const style = { "--a": a } as React.CSSProperties;
  const podLabel = `POD ${String(podNo).padStart(2, "0")}`;

  // A DESK THAT DOES NOT EXIST YET: drawn so the shape of the platform is visible, but not a link and no hover lift.
  if (d.soon) {
    return (
      <article className={`agn-tile is-soon ${size}`} style={style} aria-disabled="true">
        <div className="agn-thead"><span className="agn-mark">{d.mark}</span><span className="agn-pod">{podLabel}</span></div>
        <h2 className="agn-name">{d.name}</h2>
        <p className="agn-blurb">{d.blurb}</p>
        <span className="agn-soonchip">{d.action}</span>
      </article>
    );
  }

  // A live tile is a CONTAINER with a stretched overlay link (the card's destination), so the roster pill and the
  // showcase eye can sit ABOVE it on their own layer and win their own clicks - never an anchor inside an anchor.
  const label = typeof d.action === "string" ? d.action : "Open";
  return (
    <article className={`agn-tile ${size}`} style={style}>
      {d.external ? (
        <a href={d.href} target="_blank" rel="noreferrer" aria-label={label} className="agn-tlink" />
      ) : (
        <Link href={d.href} aria-label={label} className="agn-tlink" />
      )}

      <div className="agn-thead"><span className="agn-mark">{d.mark}</span><span className="agn-pod">{podLabel}</span></div>
      <h2 className="agn-name">{d.name}</h2>
      <p className="agn-blurb">{d.blurb}</p>

      {/* The feature (Brain) tile carries a knowledge sparkline, as in the approved concept, so the tall tile reads
          as a living asset rather than empty space. */}
      {size === "big" && (
        <div className="agn-spark">
          <svg viewBox="0 0 320 44" preserveAspectRatio="none">
            <defs><linearGradient id="agnsp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a855f7" stopOpacity="0.35" /><stop offset="1" stopColor="#a855f7" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 38 L26 34 L52 36 L78 28 L104 30 L130 21 L156 24 L182 15 L208 17 L234 10 L260 13 L286 6 L320 5 L320 44 L0 44 Z" fill="url(#agnsp)" />
            <path d="M0 38 L26 34 L52 36 L78 28 L104 30 L130 21 L156 24 L182 15 L208 17 L234 10 L260 13 L286 6 L320 5" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="320" cy="5" r="3.5" fill="#e9d5ff"><animate attributeName="opacity" values="1;.3;1" dur="2.2s" repeatCount="indefinite" /></circle>
          </svg>
          <div className="cap"><span>Passages indexed</span><span>always growing</span></div>
        </div>
      )}

      <div className="agn-foot">
        <div style={{ minWidth: 0 }}>{d.pod ? <PodAgents pod={d.pod} accent={d.accent} /> : null}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {d.peek && (
            <a href={d.peek.href} target="_blank" rel="noreferrer" title={d.peek.label} aria-label={`${d.peek.label} (opens in a new tab)`} className="agn-eye">
              <EyeMark />
            </a>
          )}
          <span className={`agn-go${d.external ? " ext" : ""}`}>
            {d.action}
            <span className="arw">{d.external ? "↗" : "→"}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const clients = await listStudioClients().catch(() => [] as { id: string; name: string }[]);
  // Hero stats, from the real data: total AI agents across the four Intelligence pods, brains on file, and the
  // number of pods (tiles) across every section.
  const agentCount = Object.values(POD_AGENTS).reduce((n, p) => n + p.agents.length, 0);
  const brainCount = clients.length;
  const podCount = GROUPS.reduce((n, g) => n + g.doors.length, 0);
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* AMBIENT DEPTH. The page was reading flat (Gary), so it now breathes: soft flares that slowly pulse and
          drift, an orange one leading because this is GAS's OWN front door and orange is the GAS energy (the
          "orange is the mark alone" rule guards CLIENT creatives, not our own brand page). Kept low-opacity and
          slow so it feels premium and alive, never a wash or a distraction. Plus a fine grain for texture.
          Pure CSS - the page stays a server component, instant to load, no JS. */}
      <style>{`
        @keyframes gasFlareA { 0%,100%{opacity:.55;transform:translate3d(0,0,0) scale(1)} 50%{opacity:.9;transform:translate3d(2%,-2%,0) scale(1.08)} }
        @keyframes gasFlareB { 0%,100%{opacity:.5;transform:translate3d(0,0,0) scale(1.05)} 50%{opacity:.85;transform:translate3d(-2%,2%,0) scale(1)} }
        @keyframes gasFlareC { 0%,100%{opacity:.4} 50%{opacity:.7} }

        /* NEON BENTO FRONT DOOR (Gary-approved concept). Scoped under .agn so nothing leaks into the rest of the
           app. Poppins is inherited from the global brand face. */
        .agn{--pink:#ec4899;--purple:#a855f7;--indigo:#818cf8;--cyan:#22d3ee;--blue:#60a5fa;--sky:#38bdf8;--emerald:#34d399;--live:#4ade80;--orange:#f96203;
          --line:rgba(168,132,247,.16);--line2:rgba(168,132,247,.30);--dim:#a7a3c6;--faint:#6f6a92}

        /* TOP BAR + LIVE indicator */
        .agn-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .agn-eyebrow{display:inline-flex;align-items:center;gap:9px;font-weight:700;font-size:11.5px;letter-spacing:.28em;color:var(--dim);text-transform:uppercase}
        .agn-eyebrow .d{width:7px;height:7px;border-radius:50%;background:var(--orange);box-shadow:0 0 12px var(--orange)}
        .agn-live{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--live);
          border:1px solid color-mix(in srgb,var(--live) 40%,transparent);background:color-mix(in srgb,var(--live) 9%,transparent);border-radius:999px;padding:5px 12px}
        .agn-live .lb{width:8px;height:8px;border-radius:50%;background:var(--live);box-shadow:0 0 10px var(--live);animation:agnBlink 1.4s ease-in-out infinite}
        @keyframes agnBlink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.65)}}

        /* HERO */
        .agn-hero{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:28px;margin-bottom:clamp(22px,3.4vw,38px)}
        .agn-lead{min-width:min(100%,520px);flex:1}
        .agn-title{font-weight:800;line-height:.98;letter-spacing:-.012em;margin:.05em 0 0;font-size:clamp(34px,5vw,64px);text-wrap:balance}
        .agn-title .now{background:linear-gradient(100deg,var(--pink),var(--purple) 42%,var(--cyan));background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:agnShimmer 9s ease-in-out infinite}
        @keyframes agnShimmer{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        .agn-strap{margin:.5em 0 0;color:var(--dim);font-size:clamp(14px,1.5vw,18px)}

        .agn-stats{display:flex;gap:12px;flex-wrap:wrap}
        .agn-stat{display:flex;align-items:center;gap:12px;padding:12px 16px 12px 14px;border-radius:14px;position:relative;overflow:hidden;
          background:linear-gradient(150deg,rgba(21,16,34,.9),rgba(13,10,22,.9));border:1px solid color-mix(in srgb,var(--a) 32%,transparent);box-shadow:0 0 26px -16px var(--a)}
        .agn-stat::after{content:"";position:absolute;inset:0;z-index:0;opacity:.7;background:radial-gradient(120% 150% at 100% 0%,color-mix(in srgb,var(--a) 24%,transparent),transparent 55%)}
        .agn-stat::before{content:"";position:absolute;top:0;left:-60%;width:45%;height:100%;z-index:0;transform:skewX(-18deg);background:linear-gradient(100deg,transparent,color-mix(in srgb,var(--a) 16%,transparent),transparent);animation:agnSweep 6s ease-in-out infinite}
        .agn-stat>*{position:relative;z-index:1}
        .agn-sic{width:36px;height:36px;flex:none;display:grid;place-items:center;border-radius:11px;color:var(--a);background:color-mix(in srgb,var(--a) 15%,transparent);border:1px solid color-mix(in srgb,var(--a) 32%,transparent);animation:agnFloat 5s ease-in-out infinite}
        .agn-sic svg{width:20px;height:20px}
        .agn-stx{display:flex;flex-direction:column;line-height:1}
        .agn-stx b{font-weight:800;font-size:clamp(24px,2.6vw,30px);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
        .agn-stx span{font-weight:700;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-top:4px}
        @keyframes agnFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes agnSweep{0%{left:-60%}55%,100%{left:135%}}

        /* SECTION HEADERS */
        .agn-sec{margin-top:clamp(26px,3.6vw,42px)}
        .agn-shead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding-bottom:11px;margin-bottom:15px;border-bottom:1px solid color-mix(in srgb,var(--sa) 30%,transparent)}
        .agn-snum{font-weight:700;font-size:12px;color:var(--sa);letter-spacing:.1em}
        .agn-slabel{font-weight:700;font-size:12.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--ink)}
        .agn-snote{color:var(--dim);font-size:13px;flex:1;min-width:200px}
        .agn-snote b{color:var(--sa);font-weight:600}

        /* GRIDS */
        .agn-bento{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(124px,auto);gap:13px}
        .agn-grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}

        /* TILES */
        .agn-tile{position:relative;border-radius:16px;padding:18px;overflow:hidden;isolation:isolate;background:linear-gradient(160deg,rgba(21,16,34,.86),rgba(13,10,22,.86));
          border:1px solid var(--line);transition:transform .3s cubic-bezier(.2,.7,.3,1),border-color .3s,box-shadow .3s;transform-style:preserve-3d;will-change:transform;display:flex;flex-direction:column}
        .agn-tile::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:16px;opacity:.5;transition:opacity .35s;background:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--a) 20%,transparent),transparent 60%)}
        .agn-tile:hover{border-color:color-mix(in srgb,var(--a) 60%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--a) 30%,transparent),0 22px 60px -24px color-mix(in srgb,var(--a) 70%,transparent)}
        .agn-tile:hover::before{opacity:.9}
        .agn-tile.is-soon{opacity:.72}
        .agn-tile.is-soon:hover{transform:none;box-shadow:none;border-color:var(--line)}
        .agn-tile.big{grid-column:span 2;grid-row:span 2}
        .agn-tile.wide{grid-column:span 2}
        .agn-thead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
        .agn-mark{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;color:var(--a);background:color-mix(in srgb,var(--a) 14%,transparent);border:1px solid color-mix(in srgb,var(--a) 26%,transparent)}
        .agn-tile.big .agn-mark{width:46px;height:46px;border-radius:14px}
        .agn-mark svg{width:58%;height:58%}
        .agn-pod{font-weight:700;font-size:10px;letter-spacing:.18em;color:var(--faint)}
        .agn-name{font-weight:700;letter-spacing:-.02em;margin:13px 0 0;font-size:18.5px;color:var(--ink)}
        .agn-tile.big .agn-name{font-size:26px;margin-top:16px}
        .agn-name .g{background:linear-gradient(100deg,var(--a),color-mix(in srgb,var(--a) 40%,#fff));-webkit-background-clip:text;background-clip:text;color:transparent}
        .agn-blurb{color:var(--dim);font-size:12.8px;line-height:1.5;margin:7px 0 0}
        .agn-tile.big .agn-blurb{font-size:13.5px;max-width:46ch}
        .agn-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 10px;margin-top:14px}
        .agn-tile.big .agn-foot,.agn-tile.wide .agn-foot{margin-top:auto;padding-top:14px}
        .agn-go{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px;color:var(--a);white-space:nowrap}
        .agn-go.ext{color:var(--dim)}
        .agn-go .arw{transition:transform .3s}
        .agn-tile:hover .agn-go .arw{transform:translateX(4px)}
        .agn-meta{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--faint)}
        .agn-spark{margin-top:16px}
        .agn-spark svg{width:100%;height:44px;display:block;overflow:visible}
        .agn-spark .cap{display:flex;justify-content:space-between;font-size:10.5px;letter-spacing:.14em;color:var(--faint);text-transform:uppercase;margin-top:7px}
        .agn-soonchip{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--a);border:1px solid color-mix(in srgb,var(--a) 40%,transparent);border-radius:999px;padding:5px 11px;align-self:flex-start;margin-top:auto}
        .agn-tlink{position:absolute;inset:0;z-index:1;border-radius:16px}
        .agn-eye{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:10px;color:var(--a);position:relative;z-index:2;border:1px solid var(--line2);background:color-mix(in srgb,var(--a) 8%,transparent);transition:transform .2s,border-color .2s}
        .agn-eye:hover{transform:scale(1.08);border-color:color-mix(in srgb,var(--a) 70%,transparent)}
        .agn-eye svg{width:18px;height:18px}

        @keyframes gasRise { from{opacity:0;transform:translate3d(0,14px,0)} to{opacity:1;transform:none} }
        @keyframes gasDraw { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        .gas-draw{transform-origin:left;animation:gasDraw .9s cubic-bezier(.22,.8,.28,1) both}

        @media (max-width:920px){
          .agn-bento{grid-template-columns:repeat(2,1fr)}
          .agn-tile.big{grid-column:span 2;grid-row:span 1}
          .agn-tile.wide{grid-column:span 2}
        }
        @media (max-width:560px){
          .agn-bento,.agn-grid2{grid-template-columns:1fr}
          .agn-tile.big,.agn-tile.wide{grid-column:span 1}
          .agn-hero{align-items:flex-start}
          .agn-stats{width:100%}
          .agn-stat{flex:1;min-width:150px}
        }
        @media (prefers-reduced-motion: reduce){
          .gas-flare,.gas-rise,.gas-draw,.agn-title .now,.agn-sic,.agn-stat::before,.agn-live .lb{animation:none !important}
          .gas-rise{opacity:1 !important}
          .agn-tile{transition:none !important}
        }
      `}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* The GAS orange, top-right, leading. */}
        <div className="gas-flare absolute -right-32 -top-40 h-[40rem] w-[40rem] rounded-full bg-[#f96203]/[0.10] blur-[130px]" style={{ animation: "gasFlareA 11s ease-in-out infinite" }} />
        {/* A smaller, warmer orange ember low-left, so the warmth is not only in one corner. */}
        <div className="gas-flare absolute -bottom-24 left-1/4 h-[26rem] w-[26rem] rounded-full bg-[#fb923c]/[0.07] blur-[120px]" style={{ animation: "gasFlareC 9s ease-in-out infinite 1.5s" }} />
        {/* The accent family holds the balance - violet left, blue right. */}
        <div className="gas-flare absolute -left-40 top-16 h-[34rem] w-[34rem] rounded-full bg-[#a855f7]/[0.08] blur-[120px]" style={{ animation: "gasFlareB 13s ease-in-out infinite" }} />
        <div className="gas-flare absolute -bottom-52 -right-40 h-[36rem] w-[36rem] rounded-full bg-[#60a5fa]/[0.07] blur-[130px]" style={{ animation: "gasFlareA 15s ease-in-out infinite 2s" }} />
        {/* Fine grain for a premium, non-flat surface. A tiny SVG noise tile, very low opacity. */}
        <div className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      </div>

      <AppHeader />

      <main className="agn mx-auto w-full max-w-[1600px] flex-1 px-5 py-10 sm:px-8 sm:py-12">
        {/* Progressive-enhancement island: count-up + hover tilt. The content below is fully server-rendered. */}
        <DashboardMotion />

        <div className="agn-top">
          <span className="agn-eyebrow"><span className="d" /> AI marketing intelligence platform</span>
          <span className="agn-live"><span className="lb" /> Live</span>
        </div>

        <header className="agn-hero">
          <div className="agn-lead">
            <h1 className="agn-title">The Agency of <span className="now">NOW</span></h1>
            <p className="agn-strap">Human command. AI execution. One platform.</p>
          </div>
          <div className="agn-stats">
            <div className="agn-stat" style={{ "--a": "#ec4899" } as React.CSSProperties}>
              <span className="agn-sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2.5" /><circle cx="12" cy="12" r="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></svg></span>
              <span className="agn-stx"><b data-count={agentCount}>{agentCount}</b><span>AI agents</span></span>
            </div>
            <div className="agn-stat" style={{ "--a": "#a855f7" } as React.CSSProperties}>
              <span className="agn-sic"><BrainMark /></span>
              <span className="agn-stx"><b data-count={brainCount}>{brainCount}</b><span>Brains</span></span>
            </div>
            <div className="agn-stat" style={{ "--a": "#22d3ee" } as React.CSSProperties}>
              <span className="agn-sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></svg></span>
              <span className="agn-stx"><b data-count={podCount}>{podCount}</b><span>Pods</span></span>
            </div>
          </div>
        </header>

        {GROUPS.map((g, gi) => {
          const podBase = GROUPS.slice(0, gi).reduce((n, x) => n + x.doors.length, 0);
          const isIntel = g.label === "Intelligence";
          return (
            <section key={g.label} className="agn-sec" style={{ "--sa": SECTION_ACCENT[g.label] || "#a855f7" } as React.CSSProperties}>
              <div className="agn-shead">
                <span className="agn-snum">{String(gi + 1).padStart(2, "0")}</span>
                <span className="agn-slabel">{g.label}</span>
                <span className="agn-snote">{g.note}</span>
              </div>
              <div className={isIntel ? "agn-bento" : "agn-grid2"}>
                {g.doors.map((d, n) => (
                  <Tile key={d.href} d={d} podNo={podBase + n + 1} size={isIntel ? (n === 0 ? "big" : n === 1 ? "wide" : "") : ""} />
                ))}
              </div>

              {/* DAILY INTELLIGENCE - the REAL, functional component, unchanged, mounted under the Intelligence pods. */}
              {isIntel && clients.length > 0 && (
                <div style={{ marginTop: 13 }}><MarketQuestion clients={clients} /></div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
