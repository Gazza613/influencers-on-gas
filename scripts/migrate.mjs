// Apply db/schema.sql to Neon. Run after DATABASE_URL is set: `npm run db:migrate`.
// Idempotent — the schema uses `create ... if not exists`.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (or export it) first.");
  process.exit(1);
}

const sql = neon(url);
const ddl = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// Split into statements (no semicolons appear inside string literals in this schema).
const statements = ddl
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s && !s.split("\n").every((l) => l.trim() === "" || l.trim().startsWith("--")));

let applied = 0;
for (const stmt of statements) {
  try {
    await sql(stmt);
    applied++;
  } catch (e) {
    console.error("\nFailed on statement:\n" + stmt + "\n");
    throw e;
  }
}
console.log(`✓ Applied ${applied} statements to Neon.`);
