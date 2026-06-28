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

export async function updateInfluencer(
  id: string,
  fields: { name?: string; voice_id?: string | null; status?: string; persona?: Record<string, unknown>; higgsfield_soul_id?: string | null; heygen_avatar_id?: string | null; look_refs?: unknown[] },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (fields.name !== undefined) { sets.push(`name = $${i++}`); vals.push(fields.name); }
  if (fields.voice_id !== undefined) { sets.push(`voice_id = $${i++}`); vals.push(fields.voice_id); }
  if (fields.status !== undefined) { sets.push(`status = $${i++}`); vals.push(fields.status); }
  if (fields.persona !== undefined) { sets.push(`persona = $${i++}`); vals.push(JSON.stringify(fields.persona)); }
  if (fields.higgsfield_soul_id !== undefined) { sets.push(`higgsfield_soul_id = $${i++}`); vals.push(fields.higgsfield_soul_id); }
  if (fields.heygen_avatar_id !== undefined) { sets.push(`heygen_avatar_id = $${i++}`); vals.push(fields.heygen_avatar_id); }
  if (fields.look_refs !== undefined) { sets.push(`look_refs = $${i++}`); vals.push(JSON.stringify(fields.look_refs)); }
  if (!sets.length) return;
  vals.push(id);
  await db().query(`update influencers set ${sets.join(", ")} where id = $${i}`, vals);
}

// ATOMIC, SCOPED production write. Patches ONLY the named fields of persona.production at the database
// (chained jsonb_set), without the read-modify-write of the whole persona blob that updateInfluencer does.
// This is the fix for the clobber class: two concurrent saves that touch DIFFERENT production fields (e.g.
// a clip save and an audio save) can no longer overwrite each other. Each key is a top-level production
// field (clips, shots, scene_audio, clips_status, voiceover_url, ...); arrays are replaced wholesale, so
// callers that merge into an array (clips/shots) must still serialise writers to the SAME array.
export async function updateProductionFields(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!patch || !Object.keys(patch).length) return;
  // Shallow-merge the patch into persona.production using the jsonb `||` operator (right side wins), then
  // write it back atomically. Only the patched top-level production keys change; everything else in the
  // production object is preserved untouched - so a concurrent save to a DIFFERENT field can't clobber it.
  await db().query(
    `update influencers
       set persona = jsonb_set(coalesce(persona, '{}'::jsonb), '{production}',
             coalesce(persona -> 'production', '{}'::jsonb) || $1::jsonb, true)
     where id = $2`,
    [JSON.stringify(patch), id],
  );
}

export async function deleteInfluencer(id: string): Promise<void> {
  await db().query("delete from influencers where id = $1", [id]);
}
