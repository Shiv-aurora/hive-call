import type { Pool, PoolClient } from "pg";

export interface RetryOptions { maxAttempts?: number; baseDelayMs?: number; }
export const isRetryableTransactionError = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "40001");

export async function withRetryableTransaction<T>(pool: Pick<Pool, "connect">, work: (client: PoolClient) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    } finally {
      client.release();
    }
  }
  throw new Error("Transaction retry budget exhausted");
}
