import { inngest } from "@/lib/inngest";
import { getInfluencer, updateInfluencer } from "@/lib/influencers";
import { buildIdentityPrompt } from "@/lib/realism";
import { generateImages, listTools } from "@/lib/vendors/higgsfield";
import { db } from "@/lib/db";

// Throwaway discovery: persists Higgsfield's MCP tool list + schemas to a _diag row
// so we can read it via a DB query (logs are flaky). Remove after 3b-2b-ii.
export const discoverTools = inngest.createFunction(
  { id: "hf-discover-tools", retries: 0, triggers: [{ event: "hf/discover.tools" }] },
  async ({ step }) => {
    await step.run("discover", async () => {
      let payload: unknown;
      try {
        payload = { tools: await listTools() };
      } catch (e) {
        payload = { error: String((e as Error)?.message || e) };
      }
      await db().query("create table if not exists _diag (k text primary key, data jsonb, at timestamptz default now())");
      await db().query(
        "insert into _diag (k, data, at) values ('hf_tools', $1, now()) on conflict (k) do update set data = excluded.data, at = now()",
        [JSON.stringify(payload)],
      );
    });
    return { ok: true };
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
