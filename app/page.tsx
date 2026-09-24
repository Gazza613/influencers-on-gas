import { auth } from "@/auth";
import { db } from "@/lib/db";
import { POD_AGENTS } from "@/lib/pod-agents";
import LandingDoor from "@/components/LandingDoor";

// THE FRONT DOOR (Gary, approved 2026-09-24). A public, one-screen landing that anyone can visit, signed in or
// not: nothing redirects, and the three pills always go through the gated login (Gary: never straight in).
//
// The flexed numbers are LIVE, never typed: the agent total is derived from POD_AGENTS (the same list the dashboard
// flexes), the brains are a count of the clients table, and the pods are the ten surfaces on the dashboard. So the
// door can never drift from the truth the app tells inside.
export const dynamic = "force-dynamic";

const POD_COUNT = 10; // the ten dashboard surfaces (Brain, Researcher, Strategist, Proposal, Audience, Channels, Influencers, Creatives, Media, PSI)

export default async function Landing() {
  const session = await auth().catch(() => null);
  const agents = Object.values(POD_AGENTS).reduce((n, p) => n + p.agents.length, 0);
  const rows = (await db().query(`select count(*)::int as n from clients`).catch(() => [{ n: 0 }])) as { n: number }[];
  const brains = Number(rows[0]?.n ?? 0);
  return <LandingDoor agents={agents} brains={brains} pods={POD_COUNT} signedIn={!!session?.user} />;
}
