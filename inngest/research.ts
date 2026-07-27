import { inngest } from "@/lib/inngest";
import { db } from "@/lib/db";
import { buildResearchDocument } from "@/lib/research-doc";

// THE RESEARCHER PIPELINE, DURABLE (build spec V3, sections 2 + 4.4 + 9).
//
// The interactive collect (the SSE run) is for watching a dossier build and iterating on quality. THESE functions
// are the durable backbone underneath it:
//   - The Research Document is rendered, filed to Drive and emailed with RETRIES, so the fragile parts (Chromium
//     render, Drive upload, SMTP) heal themselves and survive the request that triggered them going away.
//   - The Gate 1 decision drives the pipeline through EVENTS. The next stage (the Strategist) will be an Inngest
//     function triggered ONLY by research/approved, so it can never start from anything but an APPROVED fact base.
//     That is the workflow-level enforcement the spec demands (4.4), not merely a UI check.

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
// approved run. For now it guarantees the approved version has its document (in case approval beat the render),
// so the fact base Gary signed off is always downloadable and filed.
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
    // SEAM (Phase 2): trigger the Strategist here. It is only ever reachable from an approved fact base.
    return { approved: runId };
  },
);
