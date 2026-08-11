"use client";
import { useEffect, useState } from "react";

// "ANY PROCESS THAT RUNS NEEDS TO SHOW MY TEAM IT IS RUNNING - spinner + quirky comments preferred" (Gary).
//
// A spinner alone says "something is happening"; a rotating line says "here is WHAT is happening, and it is fine
// to wait". So this is both: a spinner and a set of on-brand lines that cycle while a long job runs. Pass the
// message set for the specific job (each desk has its own voice). No timers-of-doom, just reassurance with a wink.
//
// Lines advance on a fixed interval. Math.random / Date.now are avoided on purpose (they break nothing here, but
// deterministic rotation keeps it calm rather than jumpy).
export default function Working({ messages, className = "" }: { messages: string[]; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 2600);
    return () => clearInterval(t);
  }, [messages.length]);
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/25 border-t-current" />
      <span className="transition-opacity">{messages[Math.min(i, messages.length - 1)] || "Working…"}</span>
    </span>
  );
}

// House sets, so the whole platform speaks with one (slightly cheeky) voice while it thinks. UK spelling, no em
// dashes. Reused wherever a long job runs.
export const WORKING_STRATEGY = [
  "Reading the whole fact base…",
  "Finding the single-minded angle…",
  "Red-teaming its own argument…",
  "Killing the ideas that cannot be defended…",
  "Tracing every point back to a fact…",
  "Writing it up properly…",
];
export const WORKING_PROPOSAL = [
  "Writing the proposal on Fable 5…",
  "Choosing the audience selections…",
  "Picking the channels that earn their place…",
  "Making the numbers honest, never a promise…",
  "Tightening the executive summary…",
];
export const WORKING_PDF = [
  "Setting the type…",
  "Recolouring to the client's brand…",
  "Laying out all 24 pages…",
  "Checking the margins twice…",
  "Cutting the final PDF…",
];
export const WORKING_ASK = [
  "Reading this brain…",
  "Finding the right passages…",
  "Checking it against the sources…",
  "Writing you a straight answer…",
];
export const WORKING_ASK_WEB = [
  "Searching the web right now…",
  "Reading this brain alongside it…",
  "Keeping the fetched facts cited…",
  "Separating what is known from what is fresh…",
];
export const WORKING_RESEARCH = [
  "Reading the client's own site…",
  "Chasing down the real sources…",
  "Grading each fact by how solid it is…",
  "Binning anything it cannot stand up…",
  "Filing the fact base…",
];
export const WORKING_NEWSLETTER = [
  "Finding the CEO's voice…",
  "Writing in their register, not ours…",
  "Keeping it inside compliance…",
  "Art-directing the image…",
];
export const WORKING_BRAIN = [
  "Reading every page…",
  "Chunking it for retrieval…",
  "Embedding it into the brain…",
  "Making it findable…",
];
