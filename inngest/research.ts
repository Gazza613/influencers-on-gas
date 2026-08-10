import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { buildResearchDocument } from "@/lib/research-doc";
import {
  ingestApprovedResearch, markResearchFailed, makeResearchProgress,
  prepareResearch, researchGatherPass1, researchGapFill, researchReview, researchVerify, researchStore,
} from "@/lib/researcher-v3";

// THE RESEARCHER PIPELINE, DURABLE (build spec V3, sections 2 + 4.4 + 9).
//
// The interactive collect (the SSE run) is for watching a dossier build and iterating on quality. THESE functions
// are the durable backbone underneath it:
//   - The Research Document is rendered, filed to Drive and emailed with RETRIES, so the fragile parts (Chromium
//     render, Drive upload, SMTP) heal themselves and survive the request that triggered them going away.
//   - The Gate 1 decision drives the pipeline through EVENTS. The next stage (the Strategist) will be an Inngest
//     function triggered ONLY by research/approved, so it can never start from anything but an APPROVED fact base.
//     That is the workflow-level enforcement the spec demands (4.4), not merely a UI check.

// research/collect -> RUN THE COLLECT, DECOMPOSED INTO PHASES. Vercel caps a single function invocation at ~13
// minutes, and a deep run on a big client used to hit that ceiling and die mid-flight. Each phase below is its OWN
// step (its own invocation, its own time budget), so the whole run has no single time limit and each phase can go
// deeper (gather restored to 26 searches, verify uncapped from the old 55). The route creates the run row and fires
// this event; the UI polls the run's progress. Between steps ONLY serializable state crosses (ctx + claim arrays),
// so each phase rebuilds its own Anthropic client. Concurrency keyed on the client, and the DB guard, both stop a
// second collect for the same client. onFailure marks the run 'failed' so a returning user is never stuck spinning.
export const runResearchCollect = inngest.createFunction(
  {
    id: "research-collect",
    name: "Collect the research",
    retries: 1,
    concurrency: { key: "event.data.clientId", limit: 1 },
    triggers: [{ event: "research/collect" }],
    onFailure: async ({ event }) => {
      const runId = (event as { data?: { event?: { data?: { runId?: string } } } })?.data?.event?.data?.runId;
      if (runId) await markResearchFailed(String(runId), "The research job did not finish. Nothing was charged for an unsaved result. Run it again.").catch(() => {});
    },
  },
  async ({ event, step }) => {
    const d = event.data as { clientId: string; runId: string; version: number; today: string; userEmail: string | null; notes: string | null; focus: string | null };
    const opts = { userEmail: d.userEmail, notes: d.notes, focus: d.focus };
    // Each step is memoized on success, so a retry resumes at the failed phase rather than re-spending on the ones
    // that already landed. Progress is written to the run's `progress` column from inside each phase (best-effort).
    const ctx = await step.run("prepare", () => prepareResearch(d.clientId, d.runId, d.version, d.today, opts));
    const p1 = await step.run("gather-pass-1", () => researchGatherPass1(ctx, makeResearchProgress(d.runId)));
    const gapd = await step.run("gap-fill", () => researchGapFill(ctx, p1.rawClaims, p1.competitors, makeResearchProgress(d.runId)));
    const reviewed = await step.run("review", () => researchReview(ctx, gapd.rawClaims, makeResearchProgress(d.runId)));
    const verified = await step.run("verify", () => researchVerify(ctx, reviewed, makeResearchProgress(d.runId)));
    const stored = await step.run("store", () => researchStore(ctx, verified, gapd.competitors, p1.vertical, p1.identity, makeResearchProgress(d.runId)));
    const count = stored.claims.length;
    // Hand off to the Research Document build (and the rest of the pipeline) exactly as the old path did.
    if (count > 0) await step.sendEvent("collected", { name: "research/collected", data: { clientId: d.clientId, runId: d.runId } });
    return { runId: d.runId, count };
  },
);

// research/collected -> build the Research Document (PDF -> Blob -> Drive -> email). Fired when a collect run
// finishes with claims. Retried, because a render or an upload can blip.
export const buildResearchDocumentJob = inngest.createFunction(
  { id: "research-build-document", name: "Build the Research Document", retries: 2, triggers: [{ event: "research/collected" }] },
  async ({ event, step }) => {
    const clientId = String(event.data.clientId);
    const runId = String(event.data.runId);
    return await step.run("build-document", () => buildResearchDocument(clientId, runId));
  },
);

// research/approved -> Gate 1 passed. This is the seam the Strategist hangs off (Phase 2): reachable ONLY from an
// approved run. On approval we (1) guarantee the approved version has its document, and (2) INGEST the approved
// fact base into the client's brain (RAG) so the rest of the platform can retrieve it - deduped, so re-approvals
// replace rather than stack (Gary). The brain IS the client, so it always exists; nothing to create.
export const onResearchApproved = inngest.createFunction(
  { id: "research-approved", name: "Gate 1 approved", retries: 2, triggers: [{ event: "research/approved" }] },
  async ({ event, step }) => {
    const clientId = String(event.data.clientId);
    const runId = String(event.data.runId);
    const has = await step.run("check-document", async () => {
      const rows = (await db().query(`select pdf_url from research_runs where id = $1 and client_id = $2`, [runId, clientId])) as { pdf_url: string | null }[];
      return !!rows[0]?.pdf_url;
    });
    if (!has) await step.run("ensure-document", () => buildResearchDocument(clientId, runId).catch(() => null));
    // Ingest the approved fact base into the brain (durable, retryable, deduped).
    const ingested = await step.run("ingest-to-brain", () => ingestApprovedResearch(clientId, runId).catch(() => 0));
    // SEAM (Phase 2): trigger the Strategist here. It is only ever reachable from an approved fact base.
    return { approved: runId, ingestedFacts: ingested };
  },
);
