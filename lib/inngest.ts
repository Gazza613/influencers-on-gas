import { Inngest } from "inngest";

// Durable job engine for all long-running pipeline work (identity generation,
// Soul training, the produce pipeline). Connect Inngest (Vercel integration /
// Inngest Cloud) to activate in production — sets INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY.
export const inngest = new Inngest({ id: "gas-studio" });
