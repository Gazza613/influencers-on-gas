import { db } from "./db";

export type Influencer = {
  id: string;
  client_id: string | null;
  name: string;
  mode: string; // 'synthetic' | 'twin'
  status: string; // 'draft' | 'ready'
  persona: Record<string, unknown>;
  higgsfield_soul_id: string | null;
  voice_id: string | null;
  heygen_avatar_id: string | null;
  look_refs: unknown[];
  locked_seed: number | null;
  consent_id: string | null;
  created_at: string;
};

export async function listInfluencers(): Promise<Influencer[]> {
  return (await db().query(
    `select id, client_id, name, mode, status, persona, higgsfield_soul_id, voice_id,
            heygen_avatar_id, look_refs, locked_seed, consent_id, created_at
     from influencers order by created_at desc`,
  )) as Influencer[];
}

export async function getInfluencer(id: string): Promise<Influencer | null> {
  const rows = (await db().query("select * from influencers where id = $1", [id])) as Influencer[];
  return rows[0] ?? null;
}

export async function createInfluencer(input: {
  name: string;
  mode: "synthetic" | "twin";
  persona?: Record<string, unknown>;
  consentId?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const rows = (await db().query(
    `insert into influencers (name, mode, persona, consent_id, created_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [input.name, input.mode, JSON.stringify(input.persona ?? {}), input.consentId ?? null, input.createdBy ?? null],
  )) as { id: string }[];
  return rows[0].id;
}

export async function deleteInfluencer(id: string): Promise<void> {
  await db().query("delete from influencers where id = $1", [id]);
}
