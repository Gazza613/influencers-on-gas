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
const raw = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// Strip `--` line comments first (they can contain semicolons), then split into
// statements. (No `--` or `;` appears inside a string literal in this schema.)
const cleaned = raw
  .split("\n")
  .map((line) => {
    const i = line.indexOf("--");
    return i >= 0 ? line.slice(0, i) : line;
  })
  .join("\n");

const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

let applied = 0;
for (const stmt of statements) {
  try {
    await sql.query(stmt); // raw, parameterless DDL
    applied++;
  } catch (e) {
    console.error("\nFailed on statement:\n" + stmt + "\n");
    throw e;
  }
}
console.log(`✓ Applied ${applied} statements to Neon.`);
