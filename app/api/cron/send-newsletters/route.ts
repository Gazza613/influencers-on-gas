import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cronAuthed } from "@/lib/cron";
import { db } from "@/lib/db";
import { deliverCeoArticle } from "@/lib/ceo-send";

// SEND-LATER FIRING (Gary). Emails the scheduled CEO/MD newsletters whose time has come, through the exact same
// delivery path as an immediate send (lib/ceo-send.ts). Runs frequently so a scheduled send lands close to its
// chosen minute. Each due row is claimed and marked sent or failed, so a send is never repeated.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PER_RUN = 25;   // a sane ceiling so one run can never blast an unbounded batch

export async function GET(req: Request) {
  const session = await auth();
  if (!cronAuthed(req) && session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 401 }); // this sends real email
  }

  // Claim the due pending rows atomically (status flips to 'sending'), so overlapping runs never send the same one.
  const due = (await db().query(
    `update newsletter_sends set status = 'sending'
      where id in (
        select id from newsletter_sends
         where status = 'pending' and scheduled_at <= now()
         order by scheduled_at asc limit ${MAX_PER_RUN}
         for update skip locked
      )
      returning id, client_id, intel_id, publisher, subject, post, recipients, hero_url, creative_urls, created_by`,
  ).catch(() => [])) as {
    id: string; client_id: string; intel_id: string; publisher: string | null; subject: string | null;
    post: string; recipients: string[] | null; hero_url: string | null; creative_urls: string[] | null; created_by: string | null;
  }[];

  let sent = 0, failed = 0;
  for (const row of due) {
    const r = await deliverCeoArticle({
      clientId: row.client_id, intelId: row.intel_id, post: row.post,
      recipients: Array.isArray(row.recipients) ? row.recipients : [],
      publisher: row.publisher, heroUrl: row.hero_url,
      creativeUrls: Array.isArray(row.creative_urls) ? row.creative_urls : [],
      subject: row.subject, bccEmail: row.created_by,
    }).catch((e) => ({ ok: false as const, error: String((e as Error)?.message || e), status: 500 }));
    if (r.ok) {
      sent++;
      await db().query(`update newsletter_sends set status = 'sent', sent_at = now(), error = null where id = $1`, [row.id]).catch(() => {});
    } else {
      failed++;
      await db().query(`update newsletter_sends set status = 'failed', error = $2 where id = $1`, [row.id, String(r.error).slice(0, 300)]).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, due: due.length, sent, failed });
}
