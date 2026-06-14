import { db } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";

// The vendor catalog. `required` = needed before the produce flow can run.
// `env` = environment vars that count as "connected" for v1 (so GAS's existing
// keys don't have to be re-entered). New vendors are connected via the vault.
export const PROVIDERS = [
  { id: "anthropic",  label: "Anthropic (Claude)", role: "Producer co-pilot + scripts",     required: true,  env: ["ANTHROPIC_API_KEY"] },
  { id: "voyage",     label: "Voyage",             role: "Embeddings for client brains",     required: true,  env: ["VOYAGE_API_KEY"] },
  { id: "firecrawl",  label: "Firecrawl",          role: "Website knowledge ingestion",      required: false, env: ["FIRECRAWL_API_KEY"] },
  { id: "elevenlabs", label: "ElevenLabs",         role: "Voice · music · SFX · STT",        required: true,  env: ["ELEVENLABS_API_KEY"] },
  { id: "heygen",     label: "HeyGen",             role: "A-roll talking-head avatar",       required: true,  env: ["HEYGEN_API_KEY"] },
  { id: "higgsfield", label: "Higgsfield",         role: "Identity (Soul) + b-roll",         required: true,  env: ["HIGGSFIELD_API_KEY", "HF_REFRESH_TOKEN"] },
  { id: "magnific",   label: "Magnific",           role: "Skin realism on hero frames",      required: false, env: ["MAGNIFIC_API_KEY"] },
  { id: "shotstack",  label: "Shotstack",          role: "Stitch · captions · mix",          required: true,  env: ["SHOTSTACK_API_KEY"] },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
export const isProvider = (x: string): x is ProviderId => PROVIDERS.some((p) => p.id === x);

const TENANT = "gas"; // v1 single tenant

export type ConnectionStatus = {
  id: ProviderId;
  label: string;
  role: string;
  required: boolean;
  connected: boolean;
  source: "vault" | "env" | null;
  verified: boolean | null; // vault secret decrypts? (null for env/none)
  updatedAt: string | null;
};

export async function listConnections(): Promise<ConnectionStatus[]> {
  const rows = (await db().query(
    "select provider, status, updated_at, secret_encrypted from connections where tenant=$1",
    [TENANT],
  )) as { provider: string; status: string; updated_at: string; secret_encrypted: string | null }[];
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return PROVIDERS.map((p) => {
    const row = byProvider.get(p.id);
    const envSet = p.env.some((e) => !!process.env[e]);
    const hasSecret = !!row?.secret_encrypted;
    let verified: boolean | null = null;
    if (hasSecret) {
      try {
        decryptSecret(row!.secret_encrypted!);
        verified = true;
      } catch {
        verified = false;
      }
    }
    return {
      id: p.id,
      label: p.label,
      role: p.role,
      required: p.required,
      connected: hasSecret || envSet,
      source: hasSecret ? "vault" : envSet ? "env" : null,
      verified,
      updatedAt: row?.updated_at ?? null,
    };
  });
}

export async function saveConnection(provider: ProviderId, secret: string): Promise<void> {
  const enc = encryptSecret(secret);
  await db().query(
    `insert into connections (tenant, provider, secret_encrypted, status, updated_at)
     values ($1, $2, $3, 'connected', now())
     on conflict (tenant, provider)
     do update set secret_encrypted = excluded.secret_encrypted, status = 'connected', updated_at = now()`,
    [TENANT, provider, enc],
  );
}

export async function deleteConnection(provider: ProviderId): Promise<void> {
  await db().query("delete from connections where tenant=$1 and provider=$2", [TENANT, provider]);
}

// Server-side secret resolver for the pipeline: vault first, then env fallback.
export async function getSecret(provider: ProviderId): Promise<string | null> {
  const rows = (await db().query(
    "select secret_encrypted from connections where tenant=$1 and provider=$2",
    [TENANT, provider],
  )) as { secret_encrypted: string | null }[];
  if (rows[0]?.secret_encrypted) {
    try {
      return decryptSecret(rows[0].secret_encrypted);
    } catch {
      /* fall through to env */
    }
  }
  const p = PROVIDERS.find((x) => x.id === provider);
  for (const e of p?.env ?? []) if (process.env[e]) return process.env[e]!;
  return null;
}
