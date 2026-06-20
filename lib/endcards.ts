import { db } from "@/lib/db";

// End Cards library: reusable closing frames/clips (image or short video) the team uploads once
// and appends to any cut. Single-org for now (no client scoping yet). The table is created lazily
// on first use so no manual migration is needed.
export type EndCard = { id: string; label: string; url: string; kind: "image" | "video"; created_at: string };

let _ensured = false;
async function ensure() {
  if (_ensured) return;
  await db()`
    create table if not exists end_cards (
      id uuid primary key default gen_random_uuid(),
      label text not null default 'End card',
      url text not null,
      kind text not null default 'image',
      created_at timestamptz not null default now()
    )`;
  _ensured = true;
}

export async function listEndCards(): Promise<EndCard[]> {
  await ensure();
  const rows = await db()`select id, label, url, kind, created_at from end_cards order by created_at desc`;
  return rows as EndCard[];
}

export async function addEndCard(label: string, url: string, kind: "image" | "video"): Promise<EndCard> {
  await ensure();
  const rows = await db()`
    insert into end_cards (label, url, kind) values (${label || "End card"}, ${url}, ${kind})
    returning id, label, url, kind, created_at`;
  return rows[0] as EndCard;
}

export async function deleteEndCard(id: string): Promise<void> {
  await ensure();
  await db()`delete from end_cards where id = ${id}`;
}
