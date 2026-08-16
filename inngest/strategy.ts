import { inngest } from "@/lib/inngest";
import { strategyStepPrepare, strategyStepDraft, strategyStepRedTeam, strategyStepStore, markStrategyFailed } from "@/lib/strategist";

// THE DURABLE STRATEGY BUILD. The two Opus passes (draft + adversarial red-team) run as separate, memoized Inngest
// steps - each its own function invocation, so a long pass can never hit the ~13-minute request ceiling and die
// (which is what made the synchronous build look like "nothing happened"). Each phase writes a progress label to
// the strategy row, so the UI can poll status/progress and show it running through to complete, surviving
// navigation. On unrecoverable failure the row is marked 'failed' with the reason. Handles both a fresh build and a
// refine (mode) - a refine improves the strategy's current content in place.
export const strategyBuildJob = inngest.createFunction(
  {
    id: "strategy-build",
    name: "Build the Strategy",
    retries: 1,
    concurrency: { key: "event.data.strategyId", limit: 1 },
    triggers: [{ event: "studio/strategy.build" }],
    onFailure: async ({ event }) => {
      const strategyId = (event as { data?: { event?: { data?: { strategyId?: string } } } })?.data?.event?.data?.strategyId;
      if (strategyId) await markStrategyFailed(String(strategyId), "The strategy build did not finish. Nothing was saved; build it again.").catch(() => {});
    },
  },
  async ({ event, step }) => {
    const d = event.data as { strategyId: string; mode: "build" | "refine"; notes: string | null; userEmail: string | null };
    // Each step is memoized on success, so a retry resumes at the failed phase rather than re-spending on the ones
    // that already landed.
    const inp = await step.run("prepare", () => strategyStepPrepare(d.strategyId, d.mode, d.notes));
    const draft = await step.run("draft", () => strategyStepDraft(d.strategyId, inp, d.userEmail));
    const improved = await step.run("red-team", () => strategyStepRedTeam(d.strategyId, inp, draft, d.userEmail));
    await step.run("store", () => strategyStepStore(d.strategyId, improved, inp.claims));
    return { strategyId: d.strategyId, mode: d.mode };
  },
);
