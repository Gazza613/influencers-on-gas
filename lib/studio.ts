import { db } from "./db";

// GAS STUDIO data layer. Everything is scoped by client_id - a client's brand kit, templates and
// assets can never leak into another client's production. Net-new tables only; the influencer video
// pipeline is untouched.

export type BrandKit = {
  id: string;
  client_id: string;
  name: string;
  colors: Record<string, string>;
  fonts: { family: string; weight?: string; style?: string; url: string }[];
  logos: { variant: string; url: string }[];
  tone_notes: string | null;
  locked: boolean;
};

export type StudioTemplate = {
  id: string;
  client_id: string;
  name: string;
  block: string;
  placement: string;
  width: number;
  height: number;
  engine: string;
  component_key: string | null;
  slot_schema: Record<string, unknown>;
  reference_url: string | null;
  analysis: Record<string, unknown>;
  version: number;
  status: string;
};

export type StudioAsset = {
  id: string;
  client_id: string;
  kind: string;
  name: string | null;
  url: string;
  meta: Record<string, unknown>;
};

export async function getBrandKit(clientId: string): Promise<BrandKit | null> {
  const rows = (await db().query(
    `select id, client_id, name, colors, fonts, logos, tone_notes, locked
     from studio_brand_kits where client_id = $1 order by created_at limit 1`,
    [clientId],
  )) as BrandKit[];
  return rows[0] ?? null;
}

// One brand kit per client for v1 - create on first touch, then patch.
export async function upsertBrandKit(clientId: string, name: string, patch: Partial<BrandKit>): Promise<BrandKit> {
  const existing = await getBrandKit(clientId);
  if (!existing) {
    const rows = (await db().query(
      `insert into studio_brand_kits (client_id, name, colors, fonts, logos, tone_notes)
       values ($1, $2, $3, $4, $5, $6)
       returning id, client_id, name, colors, fonts, logos, tone_notes, locked`,
      [clientId, name, JSON.stringify(patch.colors ?? {}), JSON.stringify(patch.fonts ?? []), JSON.stringify(patch.logos ?? []), patch.tone_notes ?? null],
    )) as BrandKit[];
    return rows[0];
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.colors !== undefined) { sets.push(`colors = $${i++}`); vals.push(JSON.stringify(patch.colors)); }
  if (patch.fonts !== undefined) { sets.push(`fonts = $${i++}`); vals.push(JSON.stringify(patch.fonts)); }
  if (patch.logos !== undefined) { sets.push(`logos = $${i++}`); vals.push(JSON.stringify(patch.logos)); }
  if (patch.tone_notes !== undefined) { sets.push(`tone_notes = $${i++}`); vals.push(patch.tone_notes); }
  if (patch.locked !== undefined) { sets.push(`locked = $${i++}`); vals.push(patch.locked); }
  if (!sets.length) return existing;
  vals.push(existing.id);
  const rows = (await db().query(
    `update studio_brand_kits set ${sets.join(", ")} where id = $${i}
     returning id, client_id, name, colors, fonts, logos, tone_notes, locked`,
    vals,
  )) as BrandKit[];
  return rows[0];
}

export async function addAsset(clientId: string, kind: string, url: string, name: string | null, meta: Record<string, unknown>): Promise<StudioAsset> {
  const rows = (await db().query(
    `insert into studio_assets (client_id, kind, name, url, meta) values ($1, $2, $3, $4, $5)
     returning id, client_id, kind, name, url, meta`,
    [clientId, kind, name, url, JSON.stringify(meta)],
  )) as StudioAsset[];
  return rows[0];
}

export async function listAssets(clientId: string, kind?: string): Promise<StudioAsset[]> {
  return (await db().query(
    kind
      ? `select id, client_id, kind, name, url, meta from studio_assets where client_id = $1 and kind = $2 order by created_at desc`
      : `select id, client_id, kind, name, url, meta from studio_assets where client_id = $1 order by created_at desc`,
    kind ? [clientId, kind] : [clientId],
  )) as StudioAsset[];
}

export async function deleteAsset(clientId: string, id: string): Promise<void> {
  await db().query(`delete from studio_assets where id = $1 and client_id = $2`, [id, clientId]);
}

// A template starts life as a DRAFT created from an uploaded reference. Its width/height are READ from
// the file, never typed - the spec's rule: "every template's dimensions are derived from an ingested
// reference file, never manually entered".
export async function createTemplateFromReference(o: {
  clientId: string; brandKitId?: string | null; name: string; block: string; placement: string;
  width: number; height: number; referenceUrl: string; engine?: string;
}): Promise<StudioTemplate> {
  const rows = (await db().query(
    `insert into studio_templates (client_id, brand_kit_id, name, block, placement, width, height, engine, reference_url)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, client_id, name, block, placement, width, height, engine, component_key, slot_schema, reference_url, analysis, version, status`,
    [o.clientId, o.brandKitId ?? null, o.name, o.block, o.placement, o.width, o.height, o.engine ?? "playwright", o.referenceUrl],
  )) as StudioTemplate[];
  return rows[0];
}

export async function listTemplates(clientId: string, block?: string): Promise<StudioTemplate[]> {
  return (await db().query(
    block
      ? `select id, client_id, name, block, placement, width, height, engine, component_key, slot_schema, reference_url, analysis, version, status
         from studio_templates where client_id = $1 and block = $2 order by created_at`
      : `select id, client_id, name, block, placement, width, height, engine, component_key, slot_schema, reference_url, analysis, version, status
         from studio_templates where client_id = $1 order by created_at`,
    block ? [clientId, block] : [clientId],
  )) as StudioTemplate[];
}

export async function saveTemplateAnalysis(id: string, clientId: string, analysis: Record<string, unknown>, slotSchema?: Record<string, unknown>): Promise<void> {
  if (slotSchema) {
    await db().query(`update studio_templates set analysis = $1, slot_schema = $2 where id = $3 and client_id = $4`,
      [JSON.stringify(analysis), JSON.stringify(slotSchema), id, clientId]);
  } else {
    await db().query(`update studio_templates set analysis = $1 where id = $2 and client_id = $3`,
      [JSON.stringify(analysis), id, clientId]);
  }
}

export async function deleteTemplate(clientId: string, id: string): Promise<void> {
  await db().query(`delete from studio_templates where id = $1 and client_id = $2`, [id, clientId]);
}
