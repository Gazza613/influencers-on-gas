import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { PREMIUM } from "./vendors/anthropic";
import { getBrandKit, listAssets } from "./studio";

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
  sms: { copy: string; slug: string; assembled: string; chars: number; gsm7: boolean };
  complianceCheck: string[];
};

// GSM-7: the 7-bit alphabet an SMS is allowed to use before it silently falls back to UCS-2 and the segment
// collapses from 160 characters to 70. One curly apostrophe pasted in from a Word document does that. Across
// a few million recipients it is a real invoice, which is why this is checked and not trusted.
const GSM7 = new Set(
  ("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
   "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà").split(""),
);
// These cost TWO characters each in GSM-7 (they are escape sequences), so a message full of them can bust
// 160 while "looking" shorter.
const GSM7_EXTENDED = new Set("^{}\\[~]|€".split(""));

export function smsLength(copy: string): number {
  let n = 0;
  for (const ch of copy) n += GSM7_EXTENDED.has(ch) ? 2 : 1;
  return n;
}

export function nonGsm7(copy: string): string[] {
  return [...new Set([...copy].filter((c) => !GSM7.has(c) && !GSM7_EXTENDED.has(c)))];
}

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

=== THE SMS - DIRECT RESPONSE, AND BRUTALLY SHORT ===
This is the hardest-working copy in the campaign and the easiest to write badly. It is not a summary of the campaign. Its ONLY job is the tap.

THE CLIENT'S REAL FORMAT (measured from one they actually send):
  "Pick your perfect bundle on MoMo. From 3-day social bundles to weekly and monthly combo deals. https://bit.ly/MoMoBundles Queries? 083135 MTN JR AUTH FSP 46094 Ts&Cs Apply"
Note what the legal tail says: MTN JR AUTH FSP 46094. MTN as juristic representative. The BANK IS NOT NAMED - the client's own live practice already matches the brand lock above.

YOU WRITE TWO THINGS AND ONLY TWO THINGS:
1. copy  - the selling line. The link, the queries number and the legal tail are appended AUTOMATICALLY and are not yours to write. Do NOT include them, do not write "Ts&Cs", do not write a URL.
2. slug  - the bit.ly slug, e.g. "MoMoWinterCalls". Letters and digits only, no spaces. Keep it SHORT: every character in the slug is a character stolen from the selling line.

THE BUDGET IS THE POINT. The ceiling is 190 characters for the whole assembled message. The furniture - "https://bit.ly/<slug>", "Queries? 083135" and the FSP tail - costs about 65 characters plus your slug. That leaves you roughly 105 CHARACTERS to sell in. This is not a paragraph. It is a headline with a price on it.

HOW TO SPEND THOSE HUNDRED-ODD CHARACTERS:
- Lead with the OFFER, not the brand. They know who MoMo is; they do not know what you are giving them. "Unlimited all-net calls, R10" earns the read. "MoMo from MTN: stay close this winter" burns half your budget saying nothing.
- ONE offer. One. A second offer halves the response to the first.
- Name the thing and the price in the same breath. That IS the message.
- Do not spend characters on a call to action verb if the link already implies it. "Get yours:" is 10 characters that the link says for free.
- Talk like a person texting, not a brand broadcasting. Fragments are fine.
- NO URGENCY. No hurry, no today-only, no countdown, no scarcity. FAIS s14(3)(n) prohibits it outright, AND it is the exact grammar of the scam SMS this customer gets every week - so it does not merely risk a fine, it makes us look like the fraud. Our edge is being the one message in the inbox that is not shouting.
- The offer being genuinely good is the persuasion. Nothing else has to do that job.
- GSM-7 characters only: no curly quotes, no em dashes, no smart apostrophes, no emoji. ONE of them collapses the segment from 160 to 70 characters and can triple the send cost across millions of recipients.
- Look at the client's own line again: "Pick your perfect bundle on MoMo." It is warm, plain and specific, and it does not shout. Match that register. Then BEAT it by naming an actual price, which theirs never does.

=== A HARD BRAND LOCK (absolute, no exceptions) ===
NEVER name, mention or allude to AFRICAN BANK anywhere - not in a headline, not in body copy, not in an SMS,
not in an image prompt, not in the compliance line, not in your own compliance notes. MoMo is banked by
African Bank; that is a fact about the licence, and it is NOT part of the brand. The brand in the market is
MTN MoMo, full stop. There is no wording, however small or however legally motivated, in which the bank's
name may appear on a creative. If you believe a disclosure requires it, say so in complianceCheck and let a
human decide - do NOT put it in the copy yourself.

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
        copy: { type: "string", description: "The SELLING LINE only, roughly 105 characters. No URL, no Ts&Cs, no queries number - those are appended automatically. One offer, named with its price. GSM-7 only." },
        slug: { type: "string", description: "The bit.ly slug, letters and digits only, e.g. MoMoWinterCalls. Short - every character costs the selling line." },
      },
      required: ["copy", "slug"],
    },
    complianceCheck: { type: "array", items: { type: "string" }, description: "Every legal risk you can see, and how you handled it." },
  },
  required: ["theme", "rationale", "masthead", "section1", "sliders", "webflow", "sms", "complianceCheck"],
} as unknown as Anthropic.Tool["input_schema"];

// How many reference creatives the Producer is shown. These are the client's BEST PERFORMERS - Gary:
// "the intake images are the campaigns that performed". Enough to read a house style from, few enough that
// the Producer is looking at each one rather than skimming a gallery.
const REFERENCE_LIMIT = Number(process.env.STUDIO_REFERENCE_LIMIT) || 8;

export async function planCampaign(clientId: string, brief: string): Promise<CampaignPlan> {
  const kit = await getBrandKit(clientId);
  if (!kit) throw new Error("This client has no brand kit yet - run Template intake first.");
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  // THE PRODUCER NOW LOOKS AT THE WORK. It used to plan blind - reading a text paraphrase of the reference
  // set and never seeing a single creative. That is why the output did not look like theirs: you cannot
  // describe a house style accurately enough in prose for someone to reproduce it, and I had proved that on
  // myself by getting the deal-card yellow wrong from a written description.
  const refs = (await listAssets(clientId, "reference")).slice(0, REFERENCE_LIMIT);

  const client = new Anthropic({ apiKey: key });
  const content: Anthropic.ContentBlockParam[] = [];

  if (refs.length) {
    content.push({
      type: "text",
      text: `First, LOOK at the client's own best-performing creatives. These are not inspiration - they are ` +
        `the standard. The campaigns below actually ran and actually performed, and the client is happy with ` +
        `this creative direction. Your job is to work INSIDE it and improve on it, never to depart from it.\n\n` +
        `Study: how they cast and light their people, their colour grading, how much air sits around a subject, ` +
        `where the type sits, how loud or quiet the whole thing feels. Your image prompts must be written so ` +
        `that what comes back could sit in this set without looking like an outsider.`,
    });
    for (const r of refs) content.push({ type: "image", source: { type: "url", url: r.url } });
  }

  content.push({
    type: "text",
    text: `The producer's brief, in their own words:\n"""${brief.slice(0, 3000)}"""\n\n` +
      `Plan the full funnel campaign. Improve on the brief where you can - that is what you are for - but keep ` +
      `every specific they gave you, and stay inside the look you have just been shown.`,
  });

  // RETRY ON A BROKEN PLAN. The failure is intermittent: with the reference images plus the large doctrine
  // prompt, the Producer occasionally returns a truncated or degenerate tool call - one slider, empty fields.
  // Locally the same brief plans perfectly, so it is non-determinism, not a code fault. coercePlan guarantees
  // the SHAPE; validate() judges whether it is USABLE; and if it is not, we simply ask again rather than fail
  // the whole run. max_tokens is up from 6000 to reduce truncation, the likeliest cause.
  let plan: CampaignPlan | null = null;
  let lastFaults: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.messages.create({
      model: PREMIUM,
      max_tokens: 8000,
      system: SYSTEM(kit.design_system || "", kit.tone_notes || "", kit.compliance_text || ""),
      tools: [{ name: "plan", description: "The complete funnel campaign order.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "plan" },
      messages: [{ role: "user", content }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") { lastFaults = ["the Producer returned no plan at all"]; continue; }
    const candidate = coercePlan(block.input);
    const faults = validate(candidate);
    if (!faults.length) { plan = candidate; break; }
    lastFaults = faults;
  }
  if (!plan) throw new Error(`The Producer could not produce a usable plan after 3 attempts: ${lastFaults.join(" ")} Try again.`);

  plan.sms = await fitSms(client, plan.sms, plan.theme);
  assertNoBannedEntity(plan);
  return plan;
}

function validate(p: CampaignPlan): string[] {
  const f: string[] = [];
  const dealOk = (d: Deal | undefined) => !!(d?.label && d?.amount && d?.price && d?.validity);

  if (p.sliders.length !== 3) f.push(`It planned ${p.sliders.length} slider${p.sliders.length === 1 ? "" : "s"}, not 3.`);
  p.sliders.forEach((s, i) => {
    if (!s.headline1 || !s.headline2) f.push(`Slider ${i + 1} has no headline.`);
    if (!s.scenePrompt) f.push(`Slider ${i + 1} has no image prompt.`);
    // An empty deal renders as a navy pill containing the word "Only" and nothing else. It also strips the
    // validity line, which FAIS s14(3)(m) requires beside the price - so it is not merely ugly, it is illegal.
    if (!dealOk(s.deal)) f.push(`Slider ${i + 1} has no usable deal.`);
  });
  if (!p.section1.deals.length) f.push("Section 1 has no deal cards.");
  if (!p.masthead.subjectPrompt) f.push("The masthead has no image prompt.");
  if (!p.section1.subjectPrompt) f.push("Section 1 has no image prompt.");
  return f;
}

// THE SCHEMA IS A REQUEST, NOT AN ENFORCEMENT.
//
// This took the whole page down: the tool schema declared complianceCheck as an array of strings, and the
// model returned a STRING. The page did `(plan.complianceCheck || []).map(...)`, which LOOKS like a guard and
// is not one - a string is truthy, so it sails past `|| []` and explodes on .map.
//
// The nastiest part is that it is non-deterministic. The same brief gave me an eleven-item array locally and
// a string in production. So it cannot be caught by testing once and declaring it fine.
//
// Fixed HERE, at the source, rather than in the page - because produceCampaign() also iterates plan.sliders,
// and would have died exactly the same way, except server-side and after spending money on the images.
// Anything that leaves this function has the shape it promised.
// The model sometimes leaks its own tool-call scaffolding INTO the values - array items came back as
// literal `<parameter name="0">the actual text`. It is an artefact of how tool input is emitted, it appears
// intermittently, and it would print verbatim on a creative. Scrub it: strip any XML-ish tag wrapper and
// return the text that was meant.
export function scrub(v: unknown): string {
  const raw = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return raw
    .replace(/<\/?(?:parameter|antml:parameter)[^>]*>/gi, "")
    .replace(/^\s*["']|["']\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coercePlan(raw: unknown): CampaignPlan {
  const o = (raw ?? {}) as Record<string, any>;
  const list = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : v == null || v === "" ? [] : [v as T];
  const str = scrub;

  const deal = (d: any): Deal => ({
    label: str(d?.label), amount: str(d?.amount), price: str(d?.price), validity: str(d?.validity),
    amountSuffix: d?.amountSuffix ? str(d.amountSuffix) : undefined,
    amountSub: d?.amountSub ? str(d.amountSub) : undefined,
    footnote: d?.footnote ? str(d.footnote) : undefined,
  });

  return {
    theme: str(o.theme),
    rationale: str(o.rationale),
    masthead: { subjectPrompt: str(o.masthead?.subjectPrompt), phoneScreen: str(o.masthead?.phoneScreen) || "none" },
    section1: { subjectPrompt: str(o.section1?.subjectPrompt), deals: list<any>(o.section1?.deals).map(deal) },
    sliders: list<any>(o.sliders).map((s) => ({
      headline1: str(s?.headline1),
      headline2: str(s?.headline2),
      scenePrompt: str(s?.scenePrompt),
      deal: deal(s?.deal),
    })),
    webflow: {
      heroHeadline: str(o.webflow?.heroHeadline),
      heroSubheads: list<unknown>(o.webflow?.heroSubheads).map(str),
      section1Headline: str(o.webflow?.section1Headline),
      section1Body: str(o.webflow?.section1Body),
      sliderSubhead: str(o.webflow?.sliderSubhead),
    },
    sms: o.sms as CampaignPlan["sms"],   // fitSms rebuilds this immediately below, and counts it itself
    complianceCheck: list<unknown>(o.complianceCheck).map(str),
  };
}

// THE SMS MUST FIT, AND THE FURNITURE IS NOT OPTIONAL.
//
// The real message the client sends has four parts, and only the first is ours to write:
//   <selling line>  https://bit.ly/<slug>  Queries? 083135  MTN JR AUTH FSP 46094 Ts&Cs Apply
//
// Their own live example is 171 characters, which bills as TWO segments - they pay double on every send.
// Gary's ceiling is 190, so two segments is accepted, but every character still costs real money at their
// volume, and a message that sprawls is a message that was not edited.
//
// The count is arithmetic and models are famously bad at it, so we ASSEMBLE and COUNT here and hand any
// failure back to be cut. We ask the model to write; we do the counting.
const SMS_MAX = 190;
const SMS_TAIL = "Queries? 083135 MTN JR AUTH FSP 46094 Ts&Cs Apply";

export function assembleSms(copy: string, slug: string): string {
  const clean = (copy || "").trim().replace(/\s+/g, " ");
  const s = (slug || "MoMo").replace(/[^A-Za-z0-9]/g, "");
  return `${clean} https://bit.ly/${s} ${SMS_TAIL}`.trim();
}

async function fitSms(client: Anthropic, first: { copy?: string; slug?: string } | undefined, theme: string) {
  let copy = (first?.copy || "").trim();
  let slug = (first?.slug || "").replace(/[^A-Za-z0-9]/g, "");

  for (let attempt = 0; attempt < 3; attempt++) {
    const assembled = assembleSms(copy, slug);
    const bad = nonGsm7(assembled);
    const len = smsLength(assembled);
    if (copy && slug && len <= SMS_MAX && !bad.length) break;

    const faults = [
      !copy ? "There is no selling line at all." : "",
      !slug ? "There is no bit.ly slug." : "",
      len > SMS_MAX ? `Assembled, the message is ${len} characters. The ceiling is ${SMS_MAX}. Cut ${len - SMS_MAX} characters from the SELLING LINE (or shorten the slug). Cut words, never the price.` : "",
      bad.length ? `It contains non-GSM-7 characters: ${bad.map((c) => JSON.stringify(c)).join(", ")}. Each collapses the segment from 160 to 70 and multiplies the send cost. Use plain ASCII - a straight apostrophe, a hyphen.` : "",
    ].filter(Boolean).join(" ");

    const fix = await client.messages.create({
      model: PREMIUM,
      max_tokens: 400,
      system: `You write direct-response SMS for MTN MoMo. Lead with the OFFER, not the brand. One offer. Name the thing and its price in the same breath. No urgency devices of any kind - FAIS s14(3)(n) prohibits them and they are the grammar of the scam SMS we compete with. Never mention African Bank. GSM-7 only.\n\nThe link, "Queries? 083135" and the FSP tail are appended automatically - never write them yourself.\n\nReply with EXACTLY two lines and nothing else:\nCOPY: <the selling line>\nSLUG: <the bit.ly slug, letters and digits only>`,
      messages: [{
        role: "user",
        content: `Campaign: ${theme}\n\nThis SMS is not usable:\nCOPY: ${copy || "(empty)"}\nSLUG: ${slug || "(empty)"}\nAssembled it reads: "${assembled}"\n\n${faults}\n\nRewrite it. Assembled it must land at or under ${SMS_MAX} characters. Keep the offer and the price intact.`,
      }],
    });
    const block = fix.content.find((b) => b.type === "text");
    const text = block && block.type === "text" ? block.text : "";
    const mCopy = text.match(/COPY:\s*(.+)/i);
    const mSlug = text.match(/SLUG:\s*(.+)/i);
    if (mCopy) copy = mCopy[1].trim().replace(/^["']|["']$/g, "");
    if (mSlug) slug = mSlug[1].trim().replace(/[^A-Za-z0-9]/g, "");
  }

  const assembled = assembleSms(copy, slug);
  return { copy, slug, assembled, chars: smsLength(assembled), gsm7: nonGsm7(assembled).length === 0 };
}

// THE BANK'S NAME NEVER APPEARS ON A CREATIVE. Gary, locked: "never reference African Bank in any creative
// or copy - the brand is only MTN MoMo".
//
// This is enforced in CODE, not left to the prompt. A prompt rule is a request; a brand lock this absolute
// needs to be a guarantee, and a model that drifts once on a legal line has published the mistake. The check
// runs over the whole plan - copy, image prompts, SMS, deals - and fails loudly rather than quietly stripping
// the words, because a silent edit to legal text is its own kind of bug.
//
// complianceCheck is deliberately EXEMPT: that is the Producer talking to a human about the law, not copy
// that ships. It is allowed to say "a disclosure may require the bank's name" so a person can decide.
const BANNED = /african\s*bank/i;

function assertNoBannedEntity(plan: CampaignPlan): void {
  const shipped = {
    ...plan,
    complianceCheck: undefined,  // notes to a human, not copy on a creative
    rationale: undefined,        // ditto: the Producer's reasoning, never rendered
  };
  if (BANNED.test(JSON.stringify(shipped))) {
    throw new Error(
      "The Producer put African Bank into the campaign. That is a hard brand lock - the bank is never named " +
      "on a creative. Nothing was produced. Re-plan, and if a disclosure genuinely needs it, raise it with the client.",
    );
  }
}

// ── THE BRIEF COACH ─────────────────────────────────────────────────────────────────────────────────────
//
// Gary: "we should add an AI producer that assists in redoing the prompt as the expert."
//
// The plan is only ever as good as the brief. "mothers day promotion" is three words, and everything the
// Producer then invents to fill the gaps - who the customer is, which deal we are pushing, what the emotional
// frame is - is a guess wearing confidence. Garbage in is not a cliche here, it is the actual failure mode:
// a vague brief produces a plausible, generic campaign, which is the worst possible output because it looks
// finished.
//
// So this sits BEFORE planning. It takes the rough brief, looks at the client's best-performing work and their
// REAL deal library, and writes the brief a senior creative director would actually hand over. Then it tells
// you, plainly, what it had to assume and what it still does not know - because a brief coach that silently
// invents the missing half is just the same problem one step earlier.
//
// It is FREE to run and it is EDITABLE. The output is a starting point you argue with, never a decision.

export type SharpenedBrief = {
  brief: string;          // the expert rewrite - this is what goes to the Producer
  reasoning: string;      // what it changed and why
  assumptions: string[];  // what it had to invent. THE MOST IMPORTANT FIELD - these are its guesses, exposed.
  questions: string[];    // what it genuinely cannot know and you should answer
  suggestedDeals: string[]; // real deals from the library that fit this campaign
};

const SHARPEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    brief: { type: "string", description: "The rewritten expert brief. Written as a brief TO a creative team, not as a plan. 120-220 words. Concrete." },
    reasoning: { type: "string", description: "What you changed and why. Two or three sentences." },
    assumptions: { type: "array", items: { type: "string" }, description: "Everything you had to invent because the brief did not say. Be honest and specific - these are your guesses, and the producer must be able to overrule them." },
    questions: { type: "array", items: { type: "string" }, description: "What you genuinely cannot know and a human should answer. Ask only what would CHANGE the work." },
    suggestedDeals: { type: "array", items: { type: "string" }, description: "Deals from the client's real library that fit this campaign, quoted exactly as listed. Only real ones." },
  },
  required: ["brief", "reasoning", "assumptions", "questions", "suggestedDeals"],
} as unknown as Anthropic.Tool["input_schema"];

export async function sharpenBrief(clientId: string, rough: string, dealList: string[] = []): Promise<SharpenedBrief> {
  const kit = await getBrandKit(clientId);
  if (!kit) throw new Error("This client has no brand kit yet - run Template intake first.");
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  const refs = (await listAssets(clientId, "reference")).slice(0, REFERENCE_LIMIT);
  const client = new Anthropic({ apiKey: key });

  const content: Anthropic.ContentBlockParam[] = [];
  if (refs.length) {
    content.push({
      type: "text",
      text: "These are the client's own best-performing funnel creatives - the campaigns that actually ran and actually worked. Look at them properly before you write anything. Your brief has to be answerable INSIDE this world.",
    });
    for (const r of refs) content.push({ type: "image", source: { type: "url", url: r.url } });
  }

  content.push({
    type: "text",
    text:
      `THE CLIENT'S REAL DEAL LIBRARY (read off their own artwork - these are the only deals that exist):\n` +
      (dealList.length ? dealList.map((d) => `  - ${d}`).join("\n") : "  (none on file)") +
      `\n\nTHE PRODUCER'S ROUGH BRIEF, exactly as they typed it:\n"""${rough.slice(0, 2000)}"""\n\n` +
      `Rewrite this as the brief a senior creative director would hand to their team.\n\n` +
      `A GOOD BRIEF ANSWERS: who exactly is this for and what is true about their week; what ONE thing we want ` +
      `them to feel; which specific deal is the hero and why THAT one; what the emotional frame is; what we are ` +
      `deliberately NOT doing. It is concrete about the offer and generous about the human being.\n\n` +
      `DO NOT write the campaign. Do not write headlines, do not write image prompts. Write the BRIEF - the ` +
      `thinking that a campaign is answerable to. The Producer will do the making.\n\n` +
      `Then be scrupulously honest in assumptions[] about everything you invented, because the producer typed ` +
      `a few words and you are about to spend their money on the strength of your interpretation of them.`,
  });

  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 2500,
    system:
      `You are a senior creative director at the agency that makes MTN MoMo's work. You do not write campaigns here - you write the BRIEF, and you interrogate a thin one until it is worth answering.\n\n` +
      `You know this account cold:\n\n=== THE DOCTRINE ===\n${(kit.tone_notes || "").slice(0, 7000)}\n\n` +
      `Hard rules that a brief must never ask the team to break: no urgency devices of any kind (FAIS s14(3)(n) ` +
      `prohibits them outright, and they are the grammar of the scam SMS this customer already receives every ` +
      `week); never the word FREE; never name African Bank; every price must name what it buys. The customer is ` +
      `a competent adult making a careful purchase from a real bank, never a lucky winner.\n\n` +
      `UK spelling. No em dashes.`,
    tools: [{ name: "sharpen", description: "The expert brief.", input_schema: SHARPEN_SCHEMA }],
    tool_choice: { type: "tool", name: "sharpen" },
    messages: [{ role: "user", content }],
  });

  const b = res.content.find((x) => x.type === "tool_use");
  if (!b || b.type !== "tool_use") throw new Error("The brief coach returned nothing.");
  const raw = b.input as Record<string, unknown>;
  const list = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(scrub).filter(Boolean);
  const out: SharpenedBrief = {
    // The brief keeps its paragraph breaks - it is prose meant to be read, not a one-line field.
    brief: String(raw.brief ?? "").replace(/<\/?(?:parameter|antml:parameter)[^>]*>/gi, "").trim(),
    reasoning: scrub(raw.reasoning),
    assumptions: list(raw.assumptions),
    questions: list(raw.questions),
    suggestedDeals: list(raw.suggestedDeals),
  };
  assertNoBannedEntity({ ...out } as unknown as CampaignPlan);
  return out;
}
