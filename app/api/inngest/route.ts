import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateReferences } from "@/inngest/functions";

// Inngest Cloud calls this endpoint to register + run functions (authenticated by
// Inngest's signing key, not our session — so it's intentionally not behind the gate).
export const { GET, POST, PUT } = serve({ client: inngest, functions: [generateReferences] });
