import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { PREMIUM } from "./vendors/anthropic";
import { getBrandKit } from "./studio";

// THE STUDIO PRODUCER — a brief in plain English, a whole funnel campaign out.
//
// Gary: "the whole point of this studio is for you to design all the funnel creatives based on the prompt
// info I give you, which AI should improve on, and then you go to final production."
//
// So the imagery is an OUTPUT, not an input. The Producer plans the entire campaign order:
//   1 masthead    (cut-out subject on the yellow disc; NO baked headline - Webflow supplies it)
//   1 section 1   (cut-out subject, deal cards floating; NO baked headline)
//   3 sliders     (photographic scene; headline IS baked in; one deal card each)
//   Webflow copy  (the hero and section headlines that sit BESIDE the images)
//   SMS copy      (GSM-7 clean, with the locked compliance block)
//
// It composes INSIDE the locked design system, which it reads off the brand kit - it never redesigns. And it
// obeys the account doctrine, which is not decoration: FAIS makes the urgency kit ILLEGAL here, and the
// category research says a discount-led money ad actively destroys trust.

export type CampaignPlan = {
  theme: string;
  rationale: string;
  masthead: { subjectPrompt: string; phoneScreen: string };
  section1: { subjectPrompt: string; deals: Deal[] };
  sliders: { headline1: string; headline2: string; scenePrompt: string; deal: Deal }[];
  webflow: { heroHeadline: string; heroSubheads: string[]; section1Headline: string; section1Body: string; sliderSubhead: string };
  sms: { copy: string; segments: number };
  complianceCheck: string[];
};

export type Deal = {
  label: string;         // "All-Net", "Social Pass", "WhatsApp Deal"
  amount: string;        // "Unlimited", "500", "30"
  amountSuffix?: string; // "MB", "Min"
  amountSub?: string;    // "Calls Bundle"
  price: string;         // "R10"
  validity: string;      // "*Valid for 24 Hours"
  footnote?: string;     // "*Subject to fair user policy"
};

const SYSTEM = (grammar: string, doctrine: string, compliance: string) => `You are the creative director for MTN MoMo's funnel campaigns. You plan a whole campaign: the imagery, the copy, the deals and the SMS. You compose INSIDE a locked design system. You never redesign it.

=== THE LOCKED DESIGN SYSTEM (derived from the client's own best-performing work - obey it) ===
${grammar.slice(0, 9000)}

=== THE ACCOUNT DOCTRINE (this is not style guidance - parts of it are the law) ===
${doctrine.slice(0, 8000)}

=== WHAT YOU ARE PLANNING ===
A funnel campaign order:
- 1 MASTHEAD (1080x811). A cut-out subject composited on the yellow disc. NO headline is baked in - Webflow supplies the words beside it. The subject usually holds a phone; the phone screen shows either the deals or the MoMo app.
- 1 SECTION 1 (1239x1080). A cut-out subject, with deal cards floating around them. NO baked headline.
- 3 SLIDERS (1080x1080). A photographic SCENE (not a cut-out). The headline IS baked in, two lines: line 1 white, line 2 MoMo yellow. One deal card each.
- WEBFLOW COPY: the hero headline + subheads, the section-1 headline + body paragraph, the slider subhead. These are HTML text on the page, beside the images.
- SMS COPY.

=== HOW TO WRITE THE IMAGE PROMPTS (these are generated, so the prompt IS the art direction) ===
- Real South Africans. Ordinary, believable contexts. GSMA's own recommendation is literally "feature real people in different situations showing how they safely and securely use mobile money". This is the category's proven visual language, not a style choice.
- Warm, positive, dignified. NEVER a jackpot-winner, never a person waving cash, never staged jubilation. The customer is a competent adult making a careful purchase from a real bank - not a lucky winner.
- CUT-OUT prompts (masthead, section 1): a single subject, chest-up or waist-up, clean isolated subject on a PLAIN NEUTRAL BACKGROUND so it can be cut out cleanly. Bright, even, slightly warm light so it sits against the yellow field. They hold or look at a phone.
- SCENE prompts (sliders): a real photographic moment. Lit for the theme. Leave the LOWER THIRD relatively calm and uncluttered, because the headline and the legal strip go there, and the TOP-RIGHT clear, because the deal card goes there.
- Never describe text, logos, prices or UI in an image prompt. Those are rendered by the template, not generated.

=== HOW TO WRITE THE HEADLINES ===
- Two lines. Line 1 sets it up, line 2 (in MoMo yellow) lands it. Short - each line must fit on one line of a 1080px canvas, so roughly 22 characters maximum.
- Emotional frame carrying a concrete functional promise. That is the formula that built this category ("Send Money Home").
- ENGLISH, with authentic South African texture. Do NOT sprinkle in isiZulu to signal authenticity - the research names that "linguistic tokenism" and says audiences catch it.
- NEVER: "FREE", countdowns, "hurry", "limited time", exclamation stacking, prize framing, "you've won". Some of these are illegal here (FAIS s14(3)(n) prohibits urgency devices), and all of them are the grammar of the scam we compete with.

=== THE DEALS ===
Use the deals the producer gives you. If they give you a rough idea, shape it into the card's fixed anatomy: label / amount / "Only" / price / validity. Always name WHAT the price buys - a bare "R5" floating alone is the shape of bait, and R5 is a contested number in this market (Shoprite's headline is "R5 withdrawal").

=== THE SMS ===
Structure: variable offer copy + short link + the locked compliance block. GSM-7 characters ONLY - no curly quotes, no em dashes, no smart apostrophes. A single non-GSM character collapses the segment size from 160 to 70 and can triple the send cost across millions of recipients. Keep the whole thing inside 2 segments (306 chars) including the link and the compliance block.

=== COMPLIANCE CHECK ===
Return a complianceCheck list: every legal risk you can see in what you have just planned, and how you handled it. If you cannot see any, say so - but look properly. The imagery is legally part of the claim (FAIS s14(3)(j)(ii)).

The compliance line that will be rendered on the sliders is fixed and immovable: "${compliance}"

UK spelling. No em dashes. Return the plan via the tool.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    theme: { type: "string", description: "The campaign theme in a few words." },
    rationale: { type: "string", description: "Why this idea works for THIS customer. Reference the doctrine." },
    masthead: {
      type: "object", additionalProperties: false,
      properties: {
        subjectPrompt: { type: "string", description: "Image prompt for the cut-out subject. Plain neutral background so it can be cut out." },
        phoneScreen: { type: "string", enum: ["deals", "app", "none"], description: "What the phone in their hand shows." },
      },
      required: ["subjectPrompt", "phoneScreen"],
    },
    section1: {
      type: "object", additionalProperties: false,
      properties: {
        subjectPrompt: { type: "string" },
        deals: { type: "array", items: {
              type: "object", additionalProperties: false,
              properties: {
                label: { type: "string", description: '"All-Net", "Social Pass", "WhatsApp Deal"' },
                amount: { type: "string", description: '"Unlimited", "500", "30"' },
                amountSuffix: { type: "string", description: '"MB", "Min" - set smaller, inline' },
                amountSub: { type: "string", description: '"Calls Bundle" - the smaller line under the big word' },
                price: { type: "string", description: '"R10"' },
                validity: { type: "string", description: '"*Valid for 24 Hours"' },
                footnote: { type: "string" },
              },
              required: ["label", "amount", "price", "validity"],
            }, description: "The deals floating around them. Usually 2 to 4." },
      },
      required: ["subjectPrompt", "deals"],
    },
    sliders: {
      type: "array",
      description: "Exactly 3. Slide 1 must be a COMPLETE ad on its own - 89% of carousel clicks never leave it.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          headline1: { type: "string", description: "Line 1, white. Max ~22 characters." },
          headline2: { type: "string", description: "Line 2, MoMo yellow. Max ~22 characters." },
          scenePrompt: { type: "string", description: "Image prompt for the photographic scene. Keep the lower third calm and the top-right clear." },
          deal: {
              type: "object", additionalProperties: false,
              properties: {
                label: { type: "string", description: '"All-Net", "Social Pass", "WhatsApp Deal"' },
                amount: { type: "string", description: '"Unlimited", "500", "30"' },
                amountSuffix: { type: "string", description: '"MB", "Min" - set smaller, inline' },
                amountSub: { type: "string", description: '"Calls Bundle" - the smaller line under the big word' },
                price: { type: "string", description: '"R10"' },
                validity: { type: "string", description: '"*Valid for 24 Hours"' },
                footnote: { type: "string" },
              },
              required: ["label", "amount", "price", "validity"],
            },
        },
        required: ["headline1", "headline2", "scenePrompt", "deal"],
      },
    },
    webflow: {
      type: "object", additionalProperties: false,
      properties: {
        heroHeadline: { type: "string" },
        heroSubheads: { type: "array", items: { type: "string" } },
        section1Headline: { type: "string" },
        section1Body: { type: "string" },
        sliderSubhead: { type: "string" },
      },
      required: ["heroHeadline", "heroSubheads", "section1Headline", "section1Body", "sliderSubhead"],
    },
    sms: {
      type: "object", additionalProperties: false,
      properties: {
        copy: { type: "string", description: "GSM-7 only. Includes the short link placeholder and the compliance block." },
        segments: { type: "number", description: "1 or 2. Never more." },
      },
      required: ["copy", "segments"],
    },
    complianceCheck: { type: "array", items: { type: "string" }, description: "Every legal risk you can see, and how you handled it." },
  },
  required: ["theme", "rationale", "masthead", "section1", "sliders", "webflow", "sms", "complianceCheck"],
} as unknown as Anthropic.Tool["input_schema"];

export async function planCampaign(clientId: string, brief: string): Promise<CampaignPlan> {
  const kit = await getBrandKit(clientId);
  if (!kit) throw new Error("This client has no brand kit yet - run Template intake first.");
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 6000,
    system: SYSTEM(kit.design_system || "", kit.tone_notes || "", kit.compliance_text || ""),
    tools: [{ name: "plan", description: "The complete funnel campaign order.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "plan" },
    messages: [{
      role: "user",
      content: `The producer's brief, in their own words:\n"""${brief.slice(0, 3000)}"""\n\n` +
        `Plan the full funnel campaign. Improve on the brief where you can - that is what you are for - but keep every specific they gave you.`,
    }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("The Producer returned nothing.");
  return block.input as CampaignPlan;
}
