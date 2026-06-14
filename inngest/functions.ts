import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";

// Durable identity-generation job.
// 3b-2a (now): builds + persists the hyper-realism identity prompt — proves the
//   pipeline runs end-to-end (load → build → persist) without a vendor call.
// 3b-2b (next): the "frames" step is replaced with the real Higgsfield
//   reference-frame generation + Soul training; the realism prompt feeds it.
export const generateReferences = inngest.createFunction(
  {
    id: "generate-references",
    name: "Generate influencer reference frames",
    triggers: [{ event: "influencer/generate.references" }],
  },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);

    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };

    const { prompt, negative } = buildIdentityPrompt(inf.persona);

    await step.run("save-identity-prompt", () =>
      updateInfluencer(influencerId, {
        persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative },
        status: "frames_pending",
      }),
    );

    return { ok: true, influencerId };
  },
);
