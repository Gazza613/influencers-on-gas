import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { PREMIUM } from "./vendors/anthropic";

// DERIVE THE LAYOUT FROM A REFERENCE. The core of "composite it ourselves".
//
// Gary chose: the AI makes only the photo, we lay the brand furniture on top from known-good assets, so the
// logo, swish, callout and headline are pixel-perfect every time instead of an AI approximation that drifts.
// To do that we need to know WHERE each piece of furniture sits on the chosen reference, and what it says.
// That is this file: read the reference once, return the layout as a structured, resolution-independent map.
//
// Positions are PERCENTAGES of the canvas, never pixels, so one layout composites correctly at any output
// resolution. Gary agreed to auto-detect and nudge, so this is a strong first read a human can correct - not
// a claim of pixel precision, which no vision model can honestly make.

export type Box = { xPct: number; yPct: number; wPct: number };
export type Layout = {
  aspect: string;                 // "1:1", "4:5" etc, read off the actual pixels
  logo: (Box & { variant: string }) | null;      // variant: which logo lockup it matches
  swish: (Box & { hPct: number }) | null;
  callout: (Box & { orientation: "vertical" | "horizontal"; deal: DealRead }) | null;
  headline: {
    xPct: number; yPct: number; wPct: number;
    align: "left" | "center" | "right";
    line1: string; line1Color: string;           // the actual words + their colour ("white"/"yellow")
    line2: string; line2Color: string;
  } | null;
};
export type DealRead = { label: string; amount: string; amountSuffix: string; price: string; validity: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    aspect: { type: "string", description: 'The image aspect ratio, e.g. "1:1", "4:5", "9:16".' },
    logo: {
      type: ["object", "null"], additionalProperties: false,
      properties: {
        xPct: { type: "number" }, yPct: { type: "number" }, wPct: { type: "number" },
        variant: { type: "string", description: 'Which MoMo logo lockup this is, e.g. "MoMo from MTN horizontal", "MoMo icon only".' },
      },
      required: ["xPct", "yPct", "wPct", "variant"],
      description: "The MoMo logo. xPct/yPct = top-left corner as % of width/height; wPct = width as % of canvas width. null if there is no logo.",
    },
    swish: {
      type: ["object", "null"], additionalProperties: false,
      properties: { xPct: { type: "number" }, yPct: { type: "number" }, wPct: { type: "number" }, hPct: { type: "number" } },
      required: ["xPct", "yPct", "wPct", "hPct"],
      description: "The curved light swish graphic. Its bounding box as % of canvas. null if none.",
    },
    callout: {
      type: ["object", "null"], additionalProperties: false,
      properties: {
        xPct: { type: "number" }, yPct: { type: "number" }, wPct: { type: "number" },
        orientation: { type: "string", enum: ["vertical", "horizontal"] },
        deal: {
          type: "object", additionalProperties: false,
          properties: {
            label: { type: "string" }, amount: { type: "string" }, amountSuffix: { type: "string" },
            price: { type: "string" }, validity: { type: "string" },
          },
          required: ["label", "amount", "amountSuffix", "price", "validity"],
        },
      },
      required: ["xPct", "yPct", "wPct", "orientation", "deal"],
      description: "The deal-card callout, its box and the deal printed on it, verbatim. null if none.",
    },
    headline: {
      type: ["object", "null"], additionalProperties: false,
      properties: {
        xPct: { type: "number" }, yPct: { type: "number" }, wPct: { type: "number" },
        align: { type: "string", enum: ["left", "center", "right"] },
        line1: { type: "string" }, line1Color: { type: "string", description: '"white" or "yellow" (or a hex).' },
        line2: { type: "string" }, line2Color: { type: "string" },
      },
      required: ["xPct", "yPct", "wPct", "align", "line1", "line1Color", "line2", "line2Color"],
      description: "The baked headline: its box, the two lines VERBATIM, and the colour of each line. Most MoMo headlines split white/yellow across two lines. null if there is no baked headline.",
    },
  },
  required: ["aspect", "logo", "swish", "callout", "headline"],
} as unknown as Anthropic.Tool["input_schema"];

export async function detectLayout(referenceUrl: string): Promise<Layout> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  const client = new Anthropic({ apiKey: key });

  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 1500,
    tools: [{ name: "layout", description: "The furniture layout of this reference advert.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "layout" },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: referenceUrl } },
        {
          type: "text",
          text: "This is a finished MTN MoMo advert. Map its BRAND FURNITURE so we can reproduce the layout with " +
            "clean assets over a new photo. For each element give its bounding box as PERCENTAGES of the canvas " +
            "(xPct,yPct = top-left corner; wPct = width). Read the callout's deal and the headline's two lines " +
            "VERBATIM, and say which colour each headline line is - MoMo usually splits white then yellow. Be " +
            "accurate about POSITION; a human will fine-tune, but get the corner and size close. Do not describe " +
            "the person or the scene - only the furniture.",
        },
      ],
    }],
  });

  const b = res.content.find((x) => x.type === "tool_use");
  if (!b || b.type !== "tool_use") throw new Error("The layout detector returned nothing.");
  return b.input as Layout;
}
