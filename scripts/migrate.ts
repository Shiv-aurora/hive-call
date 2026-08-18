import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../lib/db/pool";

function statements(sql: string) {
  return sql.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean);
}

async function main() {
  process.env.DATABASE_QUERY_TIMEOUT_MS ??= "30000";
  const migrationsDirectory = path.resolve(process.cwd(), "db/migrations");
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const pool = getPool();
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename STRING PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  for (const filename of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
    if (applied.rowCount) continue;
    const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
    for (const statement of statements(sql)) await pool.query(statement);
    await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING", [filename]);
    process.stdout.write(`applied ${filename}\n`);
  }
  await pool.end();
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
