import { Inngest } from "inngest";

// Durable job engine for all long-running pipeline work (identity generation,
// Soul training, the produce pipeline). Connect Inngest (Vercel integration /
// Inngest Cloud) to activate in production — sets INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY.
// The Vercel↔Inngest integration injects its own INNGEST_SIGNING_KEY/EVENT_KEY at build
// time, pointing at a different Inngest environment than our Production app. We pin the
// correct Production keys via custom-named vars the integration can't override.
export const inngest = new Inngest({
  id: "gas-studio",
  ...(process.env.INNGEST_PROD_EVENT_KEY ? { eventKey: process.env.INNGEST_PROD_EVENT_KEY } : {}),
});
