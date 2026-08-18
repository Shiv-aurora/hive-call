import { Pool, type PoolConfig } from "pg";
import { getDatabaseConfig } from "@/lib/db/config";

declare global {
  var hiveDatabasePool: Pool | undefined;
}

export function getPool(): Pool {
  const config = getDatabaseConfig();
  if (!config) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.hiveDatabasePool) {
    const poolConfig: PoolConfig = {
      connectionString: config.DATABASE_URL,
      max: config.DATABASE_MAX_CONNECTIONS,
      statement_timeout: config.DATABASE_QUERY_TIMEOUT_MS,
      application_name: "hive-contact-center",
      ssl: config.DATABASE_URL.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    };
    globalThis.hiveDatabasePool = new Pool(poolConfig);
    globalThis.hiveDatabasePool.on("error", (error) => console.error("database_idle_client_error", { code: (error as NodeJS.ErrnoException).code ?? "unknown" }));
  }
  return globalThis.hiveDatabasePool;
}

export async function checkDatabase() {
  const started = Date.now();
  const result = await getPool().query<{ database: string; version: string }>("SELECT current_database() AS database, version() AS version");
  return { ok: true as const, latencyMs: Date.now() - started, database: result.rows[0]?.database ?? "unknown", engine: result.rows[0]?.version.includes("CockroachDB") ? "cockroachdb" : "postgresql" };
}
