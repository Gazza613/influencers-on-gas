import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";
import { generateImages, listTools } from "@/lib/vendors/higgsfield";

// Throwaway discovery: logs Higgsfield's MCP tools + schemas to the Vercel logs so
// we can find the Soul-training tool. (Remove after 3b-2b-ii.)
export const discoverTools = inngest.createFunction(
  { id: "hf-discover-tools", triggers: [{ event: "hf/discover.tools" }] },
  async ({ step }) => {
    const tools = await step.run("list-tools", () => listTools());
    for (const t of tools) {
      const hit = /soul|train|character|avatar|identity|finetune|custom|model|set|lora/i.test(t.name);
      console.log(`[HFTOOLS]${hit ? "★" : " "} ${t.name} :: ${(t.description || "").slice(0, 80)}`);
      if (hit) console.log(`[HFTOOLS-SCHEMA] ${t.name} ${JSON.stringify(t.inputSchema || {}).slice(0, 900)}`);
    }
    return { count: tools.length };
  },
);

// Durable identity-generation job: build the hyper-realism prompt, then generate
// real reference frames via Higgsfield. (Images are unlimited on the Ultra plan,
// so retries are free.) Soul training + Magnific realism pass come in 3b-2b-ii / 3b-3.
export const generateReferences = inngest.createFunction(
  {
    id: "generate-references",
    name: "Generate influencer reference frames",
    retries: 1,
    triggers: [{ event: "influencer/generate.references" }],
  },
  async ({ event, step }) => {
    const influencerId = String(event.data.influencerId);

    const inf = await step.run("load-influencer", () => getInfluencer(influencerId));
    if (!inf) return { skipped: "influencer not found" };

    const { prompt, negative } = buildIdentityPrompt(inf.persona);
    await step.run("save-prompt", () =>
      updateInfluencer(influencerId, {
        persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative },
      }),
    );

    try {
      const urls = await step.run("generate-frames", () =>
        generateImages({ prompt, count: 4, model: "gpt_image_2", aspectRatio: "9:16" }),
      );
      await step.run("save-frames", () =>
        updateInfluencer(influencerId, { look_refs: urls.map((url) => ({ url })), status: "frames_ready" }),
      );
      return { ok: true, frames: urls.length };
    } catch (e) {
      await step.run("mark-failed", () =>
        updateInfluencer(influencerId, {
          status: "gen_failed",
          persona: { ...inf.persona, identity_prompt: prompt, identity_negative: negative, gen_error: String((e as Error)?.message || e).slice(0, 300) },
        }),
      );
      throw e;
    }
  },
);
