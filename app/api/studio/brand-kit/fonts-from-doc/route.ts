import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSecret } from "@/lib/connections";
import { getBrandKit, upsertBrandKit } from "@/lib/studio";
import { listStudioClients } from "@/lib/studio";
import { INGEST } from "@/lib/vendors/anthropic";
import { meterClaude } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// FONTS FROM A DOCUMENT (Gary). The client sends the fonts as a written list (a .txt or .pdf), not as font
// files. This reads that document, extracts the font families named in it, and records them on the brain's
// brand kit so the Producer and Creatives know which fonts the brand uses - even before the licensed files
// are uploaded. It NEVER invents a font: only what the document actually names.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fonts: {
      type: "array",
      description: "Every font family EXPLICITLY named in the document. If none are named, return an empty array. Never invent one.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          family: { type: "string", description: "The font family name exactly as written, e.g. 'MTN Brighter Sans'." },
          weights: { type: "string", description: "Weights or styles named for it (e.g. 'Bold, Regular, Italic'), or empty string if none stated." },
          use: { type: "string", description: "What it is used for if the document says so (e.g. 'headings', 'body copy'), else empty string." },
        },
        required: ["family", "weights", "use"],
      },
    },
  },
  required: ["fonts"],
} as unknown as Anthropic.Tool["input_schema"];

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; text?: string; blobUrl?: string; mediaType?: string };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const key = await getSecret("anthropic");
  if (!key) return NextResponse.json({ error: "Claude isn't connected." }, { status: 503 });

  // Build the message: a PDF is read directly by the model; a text file is passed as text.
  const instruction = "List every font family this document names, exactly as written, with any weights/styles and what each is used for. Only fonts the document actually names - never invent one.";
  let content: Anthropic.MessageParam["content"];
  if (b.blobUrl && /pdf/i.test(b.mediaType || "") && isSafePublicUrl(b.blobUrl)) {
    const data = Buffer.from(await (await fetch(b.blobUrl)).arrayBuffer()).toString("base64");
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
      { type: "text", text: instruction },
    ];
  } else if (b.text && b.text.trim()) {
    content = `${instruction}\n\nDOCUMENT:\n${String(b.text).slice(0, 24000)}`;
  } else {
    return NextResponse.json({ error: "Nothing to read - upload a .txt or .pdf, or paste the font list." }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: INGEST,
      max_tokens: 1500,
      system: "You extract the font families explicitly named in a brand document. Only fonts the document actually names. Never guess or add a common default.",
      tools: [{ name: "fonts", description: "The fonts named in the document.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "fonts" },
      messages: [{ role: "user", content }],
    });
    await meterClaude(res, { clientId, userEmail: session.user.email ?? null, model: INGEST, action: "fonts-extract" }).catch(() => {});

    const block = res.content.find((x) => x.type === "tool_use");
    const found = (block && block.type === "tool_use" ? (block.input as { fonts?: { family: string; weights?: string; use?: string }[] }).fonts : []) || [];
    const named = found.filter((f) => f.family && f.family.trim());
    if (!named.length) return NextResponse.json({ ok: true, found: [], added: 0, note: "No fonts were named in that document." });

    // Merge onto the brand kit as NAMED fonts (no file yet - url empty). We do not duplicate a family already held.
    const kit = await getBrandKit(clientId).catch(() => null);
    const existing = (kit?.fonts ?? []) as { family: string; weight?: string; style?: string; url: string; file?: string; note?: string }[];
    const have = new Set(existing.map((f) => String(f.family || "").trim().toLowerCase()));
    const additions = named
      .filter((f) => !have.has(f.family.trim().toLowerCase()))
      .map((f) => ({ family: f.family.trim(), weight: (f.weights || "").slice(0, 120), url: "", note: `named${f.use ? ` · ${f.use}` : ""}` }));
    if (additions.length) {
      const clients = await listStudioClients().catch(() => []);
      const name = clients.find((c) => c.id === clientId)?.name || "Brand";
      await upsertBrandKit(clientId, name, { fonts: [...existing, ...additions] });
    }
    return NextResponse.json({ ok: true, found: named, added: additions.length });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
