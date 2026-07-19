import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateCandidates, buildIdentity, createPresenter, trainSoulJob, ingestSource, generateCreatives, upscaleCreative, generateAroll, generateShots, generateClips, generateAudio, assembleVideo, reshootShot, videoSpike } from "@/inngest/functions";
import { APP_URL } from "@/lib/app-url";

// Image/video generation + polling can run several minutes; give the invocation headroom so a
// long render poll can't time out the whole function (which left clip jobs spinning forever).
export const maxDuration = 800;

// Inngest Cloud calls this endpoint to register + run functions (authenticated by
// Inngest's signing key, not our session - so it's intentionally not behind the gate).
// serveHost pins registration to the PUBLIC custom domain so Inngest never tries
// to invoke a Vercel-protected *.vercel.app deployment URL.
// signingKey pinned to the Production key (see lib/inngest.ts) - the integration's
// build-time INNGEST_SIGNING_KEY points at the wrong Inngest environment.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateCandidates, buildIdentity, createPresenter, trainSoulJob, ingestSource, generateCreatives, upscaleCreative, generateAroll, generateShots, generateClips, generateAudio, assembleVideo, reshootShot, videoSpike],
  // The address Inngest calls BACK on - not a display link. Moving it requires re-syncing the functions
  // (PUT /api/inngest), otherwise events fire into the void against the old registration.
  serveOrigin: APP_URL,
  ...(process.env.INNGEST_PROD_SIGNING_KEY ? { signingKey: process.env.INNGEST_PROD_SIGNING_KEY } : {}),
});
