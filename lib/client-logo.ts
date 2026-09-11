import { db } from "./db";

// THE CLIENT'S LOGO FOR A BRANDED EMAIL (Gary). When an intelligence email or a CEO article goes out for a brain,
// the header wears the CLIENT's logo, not the GAS orb (falls back to GAS when the brain has none). The email panel
// is dark, so we prefer a dark-background / stacked variant that reads on it, then any logo on file.
type Logo = { url?: string; name?: string; variant?: string };

export function pickDarkLogo(logos: unknown): string | null {
  if (!Array.isArray(logos)) return null;
  const usable = (logos as Logo[]).filter((l) => l && typeof l.url === "string" && /^https?:\/\//.test(l.url));
  if (!usable.length) return null;
  const byName = (re: RegExp) => usable.find((l) => re.test(String(l.name || "")));
  const pick = byName(/stacked.*dark/i) || byName(/dark[ _-]?bg/i) || byName(/stacked/i) || usable[0];
  return pick.url || null;
}

// The best email-header logo for a brain, or null to fall back to the GAS orb.
export async function getClientEmailLogo(clientId: string): Promise<string | null> {
  if (!clientId) return null;
  const rows = (await db().query(`select logos from studio_brand_kits where client_id = $1`, [clientId]).catch(() => [])) as { logos: unknown }[];
  return pickDarkLogo(rows[0]?.logos);
}
