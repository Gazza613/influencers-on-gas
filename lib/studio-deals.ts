import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { listAssets } from "./studio";
import { recordUsage } from "./usage";
import { INGEST } from "./vendors/anthropic";
import type { Deal } from "./studio-producer";

// THE DEAL LIBRARY, READ OUT OF THE CLIENT'S OWN ARTWORK.
//
// Gary: "the deal list is in fact with you already." It was - baked into the 68 deal-card PNGs his team
// uploaded. 61 of those 68 are the SAME card design; they differ only by the deal printed on them. So the
// reference set is not a library of designs, it is a library of DEALS wearing one design.
//
// We read each card once with vision, store the deal as structured data, and rebuild the card as code with
// slots. That is the whole thesis of the studio: the design is locked, the deal is the variable. It also means
// the deal menu is the client's REAL deals - their wording, their validity periods, their prices - rather than
// a list someone retyped and got subtly wrong.

export type StoredDeal = Deal & { id: string; source_asset: string | null };

export async function listDeals(clientId: string): Promise<StoredDeal[]> {
  // db().query returns the ROWS, not a pg result object (see lib/db.ts) - r.rows is undefined.
  const rows = (await db().query(
    `select id, label, amount, amount_suffix, amount_sub, price, validity, footnote, source_asset
       from studio_deals where client_id = $1 order by label, price`,
    [clientId],
  )) as unknown as Record<string, unknown>[];
  return rows.map((d) => ({
    id: String(d.id),
    label: String(d.label),
    amount: String(d.amount),
    amountSuffix: (d.amount_suffix as string) || undefined,
    amountSub: (d.amount_sub as string) || undefined,
    price: String(d.price),
    validity: String(d.validity),
    footnote: (d.footnote as string) || undefined,
    source_asset: (d.source_asset as string) || null,
  }));
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    readable: { type: "boolean", description: "false if this is not a deal card or the text cannot be read" },
    label: { type: "string", description: 'The deal name, e.g. "Night Express", "Social Pass", "WhatsApp Deal".' },
    amount: { type: "string", description: 'The BIG figure, e.g. "1GB", "1,5GB", "Unlimited", "30".' },
    amountSuffix: { type: "string", description: 'Any smaller unit set inline after the figure, e.g. "Min", "MB". Omit if none.' },
    amountSub: { type: "string", description: "Any smaller line UNDER the big figure. Omit if none." },
    price: { type: "string", description: 'The price exactly as printed, e.g. "R10", "R49".' },
    validity: { type: "string", description: 'The validity line VERBATIM, including the asterisk, e.g. "*Valid for 3 Days", "*Valid Midnight till 5am".' },
    footnote: { type: "string", description: "Any other fine print. Omit if none." },
  },
  required: ["readable", "label", "amount", "price", "validity"],
} as unknown as Anthropic.Tool["input_schema"];

// Read every deal card in the client's library and store what it says. Idempotent: re-running skips cards
// whose deal is already on file (unique on client + label + amount + price).
export async function extractDeals(clientId: string): Promise<{ found: number; added: number; skipped: string[] }> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  const client = new Anthropic({ apiKey: key });

  const cards = (await listAssets(clientId)).filter((a) => a.kind === "deal_card");
  const skipped: string[] = [];
  let added = 0;

  // Ingestion is exactly what Haiku is for: it is reading printed text off a card, not making a judgement.
  // Running 68 of these on a premium model would be paying Opus prices to do OCR.
  const results = await Promise.all(cards.map(async (card) => {
    try {
      const res = await client.messages.create({
        model: INGEST,
        max_tokens: 700,
        tools: [{ name: "deal", description: "The deal printed on this card.", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "deal" },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: card.url } },
            {
              type: "text",
              text: "Read the deal off this card. Transcribe EXACTLY what is printed - do not tidy the wording, " +
                "do not convert '1,5GB' to '1.5GB', do not drop the asterisk from the validity line. The validity " +
                "wording is legal text and must be verbatim. If this is not a deal card, set readable to false.",
            },
          ],
        }],
      });
      const b = res.content.find((x) => x.type === "tool_use");
      if (!b || b.type !== "tool_use") return { card, deal: null };
      const d = b.input as { readable: boolean } & Deal;
      if (!d.readable || !d.label || !d.price) return { card, deal: null };
      return { card, deal: d };
    } catch {
      return { card, deal: null };
    }
  }));

  await recordUsage({
    clientId, provider: "anthropic", model: INGEST, unit: "request",
    action: "deal-extract", count: cards.length,
  }).catch(() => {});

  for (const { card, deal: raw } of results) {
    const deal = raw ? normalise(raw) : null;
    if (!deal) { skipped.push(card.name || "(unnamed card)"); continue; }
    const ins = (await db().query(
      `insert into studio_deals (client_id, label, amount, amount_suffix, amount_sub, price, validity, footnote, source_asset)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (client_id, label, amount, price) do nothing
       returning id`,
      [clientId, deal.label, deal.amount, deal.amountSuffix ?? null, deal.amountSub ?? null,
        deal.price, deal.validity, deal.footnote ?? null, card.id],
    )) as unknown as unknown[];
    if (ins.length) added++;
  }

  return { found: cards.length, added, skipped };
}

// CLEAN UP WHAT VISION BLED TOGETHER. Reading text off artwork is not tidy: the first pass gave us
// "500MBOnly" (the card's "Only" swallowed into the amount), "300MBMB" (the unit doubled), "R 2" (a stray
// space) and a validity of "<UNKNOWN>". These are deterministic string faults, so they get a deterministic
// fix rather than another model call - and anything that still cannot be trusted is REJECTED.
//
// The validity line is the one field that cannot be guessed. FAIS s14(3)(m) requires it adjacent to the
// price, so a deal whose validity we could not read is not a deal we are allowed to print. It is dropped.
function normalise(d: Deal): Deal | null {
  const clean = (v?: string) => (v || "").replace(/\s+/g, " ").trim();

  // The word "Only" is CHROME on the card - it is printed between the amount and the price. Vision keeps
  // absorbing it into whichever field it happens to touch, so it is stripped from all of them.
  const dropOnly = (v: string) => v.replace(/\s*\bonly\b\s*$/i, "").trim();

  let label = dropOnly(clean(d.label));
  let amountSub = dropOnly(clean(d.amountSub));
  if (/^only$/i.test(amountSub)) amountSub = "";  // "Only" is chrome, never a content line

  // "All-Net Unlimited Calls Bundle" is not a label. The card sets "Calls Bundle" as the smaller line UNDER
  // the big word - it is a separate slot, and vision flattened the two together.
  const sub = label.match(/^(.*?)\s+((?:Calls?|Data|Voice)\s+Bundle)$/i);
  if (sub && !amountSub) { label = sub[1].trim(); amountSub = sub[2].trim(); }

  let amount = dropOnly(clean(d.amount));
  amount = amount.replace(/\b(GB|MB|KB|Min|Mins|Minutes)\1\b/gi, "$1");   // "300MBMB" -> "300MB"

  // Split a trailing unit off the figure so the card can set it smaller, the way the reference does. If the
  // model ALSO returned that unit as the suffix, we must not end up with "55Min Min".
  let amountSuffix = clean(d.amountSuffix);
  const m = amount.match(/^([\d.,]+)\s*(GB|MB|KB|Mins?|Minutes)$/i);
  if (m) { amount = m[1]; amountSuffix = m[2]; }
  else if (amountSuffix && new RegExp(`${amountSuffix}$`, "i").test(amount)) amountSuffix = "";

  const price = clean(d.price).replace(/^R\s+/i, "R");                    // "R 2" -> "R2"
  const validity = clean(d.validity);

  if (!label || !amount) return null;
  // A PRICE IS A RAND FIGURE. "FREE" is not one - and it is banned from our copy anyway, because a free-data
  // promise in an SMS is the single most common shape of the scam this brand competes with.
  if (!/^R\s?[\d.,]+$/i.test(price)) return null;
  // The validity is the one field that cannot be guessed. FAIS s14(3)(m) requires it ADJACENT to the price,
  // so a deal whose validity we could not read is not a deal we are allowed to print. Drop it.
  if (!validity || /unknown|n\/?a/i.test(validity) || !/^\*/.test(validity)) return null;

  return {
    label, amount, price, validity,
    amountSuffix: amountSuffix || undefined,
    amountSub: amountSub || undefined,
    footnote: clean(d.footnote) || undefined,
  };
}

export async function addDeal(clientId: string, d: Deal): Promise<void> {
  await db().query(
    `insert into studio_deals (client_id, label, amount, amount_suffix, amount_sub, price, validity, footnote)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (client_id, label, amount, price) do nothing`,
    [clientId, d.label, d.amount, d.amountSuffix ?? null, d.amountSub ?? null, d.price, d.validity, d.footnote ?? null],
  );
}

export async function deleteDeal(clientId: string, id: string): Promise<void> {
  await db().query(`delete from studio_deals where client_id = $1 and id = $2`, [clientId, id]);
}
