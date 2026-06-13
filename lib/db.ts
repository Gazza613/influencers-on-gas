import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Lazy Neon client. The connection string is read at call time so the app
// builds without a DB and fails loudly only when a query is actually run.
let _sql: NeonQueryFunction<false, false> | null = null;

export function db(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = neon(url);
  return _sql;
}
