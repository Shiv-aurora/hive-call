import { z } from "zod";

const databaseConfigSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql"),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function getDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig | undefined {
  if (!env.DATABASE_URL) return undefined;
  return databaseConfigSchema.parse(env);
}
