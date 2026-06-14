import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateCandidates, buildIdentity, createPresenter, trainSoulJob } from "@/inngest/functions";

// Image generation + polling can run up to a few minutes.
export const maxDuration = 300;

// Inngest Cloud calls this endpoint to register + run functions (authenticated by
// Inngest's signing key, not our session — so it's intentionally not behind the gate).
// serveHost pins registration to the PUBLIC custom domain so Inngest never tries
// to invoke a Vercel-protected *.vercel.app deployment URL.
// signingKey pinned to the Production key (see lib/inngest.ts) — the integration's
// build-time INNGEST_SIGNING_KEY points at the wrong Inngest environment.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCandidates, buildIdentity, createPresenter, trainSoulJob],
  serveOrigin: "https://influencers.gasmarketing.co.za",
  ...(process.env.INNGEST_PROD_SIGNING_KEY ? { signingKey: process.env.INNGEST_PROD_SIGNING_KEY } : {}),
});
