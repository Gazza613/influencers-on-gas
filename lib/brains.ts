import { db } from "./db";

// A "brain" = a client knowledge base. client_id is the hard isolation key: every
// query and chunk is scoped to it, and a brain can never read another brain's data.
export type Brain = {
  id: string;
  name: string;
  slug: string;
  status: string;
  brand: Record<string, unknown>;
  created_at: string;
  chunk_count?: number;
  source_count?: number;
};

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "brain";
}

export async function listBrains(): Promise<Brain[]> {
  return (await db().query(
    `select c.id, c.name, c.slug, c.status, c.brand, c.created_at,
            (select count(*) from knowledge_chunks k where k.client_id = c.id)  as chunk_count,
            (select count(*) from knowledge_sources s where s.client_id = c.id) as source_count
     from clients c order by c.created_at desc`,
  )) as Brain[];
}

export async function getBrain(id: string): Promise<Brain | null> {
  const rows = (await db().query(
    `select id, name, slug, status, brand, created_at,
            (select count(*) from knowledge_chunks k where k.client_id = clients.id) as chunk_count
     from clients where id = $1`,
    [id],
  )) as Brain[];
  return rows[0] ?? null;
}

export async function createBrain(name: string): Promise<string> {
  const base = slugify(name);
  // Ensure slug uniqueness.
  const taken = (await db().query("select slug from clients where slug like $1", [`${base}%`])) as { slug: string }[];
  const set = new Set(taken.map((t) => t.slug));
  let slug = base;
  for (let i = 2; set.has(slug); i++) slug = `${base}-${i}`;
  const rows = (await db().query(
    "insert into clients (name, slug) values ($1, $2) returning id",
    [name.trim(), slug],
  )) as { id: string }[];
  return rows[0].id;
}

export async function deleteBrain(id: string): Promise<void> {
  await db().query("delete from clients where id = $1", [id]); // cascades to sources/chunks
}

// ── Knowledge sources ─────────────────────────────────────────────────────────
export type KnowledgeSource = {
  id: string;
  client_id: string;
  type: string;
  uri: string;
  status: string;
  last_synced_at: string | null;
  chunk_count?: number;
  error?: string | null;
};

export async function listSources(clientId: string): Promise<KnowledgeSource[]> {
  return (await db().query(
    `select s.id, s.client_id, s.type, s.uri, s.status, s.error, s.last_synced_at,
            (select count(*) from knowledge_chunks k where k.source_id = s.id) as chunk_count
     from knowledge_sources s where s.client_id = $1 order by s.id desc`,
    [clientId],
  )) as KnowledgeSource[];
}

export async function createSource(clientId: string, type: string, uri: string): Promise<string> {
  const rows = (await db().query(
    "insert into knowledge_sources (client_id, type, uri, status) values ($1, $2, $3, 'pending') returning id",
    [clientId, type, uri],
  )) as { id: string }[];
  return rows[0].id;
}

// A FAILURE HAS TO EXPLAIN ITSELF. This used to record only the word "failed", so a source that broke gave
// nobody anything to act on - the first site crawl could only be diagnosed by guessing at it. The reason is
// now stored with the status and shown on the brain page.
export async function setSourceStatus(id: string, status: string, error?: string | null): Promise<void> {
  await db().query(
    "update knowledge_sources set status = $2, error = $3, last_synced_at = now() where id = $1",
    [id, status, status === "failed" ? (error ?? null) : null],
  );
}

// Delete one source (its chunks + embeddings cascade). Scoped to the brain for safety.
export async function deleteSource(clientId: string, sourceId: string): Promise<void> {
  await db().query("delete from knowledge_sources where id = $1 and client_id = $2", [sourceId, clientId]);
}

// Nuke ALL knowledge for a brain (every source + every chunk/embedding), keeping the brain itself.
export async function purgeBrain(clientId: string): Promise<void> {
  await db().query("delete from knowledge_chunks where client_id = $1", [clientId]);
  await db().query("delete from knowledge_sources where client_id = $1", [clientId]);
}
