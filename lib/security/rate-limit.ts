import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { emitHiveMetrics } from "@/lib/aws/metrics";

export type RateLimitPolicy = { routeKey: string; limit: number; windowMs: number };
export type RateLimitStore = (input: { routeKey: string; clientHash: string; windowStart: number; expiresAt: Date }) => Promise<number>;

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  return createHash("sha256").update(`${forwarded}|${agent}`).digest("hex").slice(0, 32);
}

const sqlStore: RateLimitStore = async ({ routeKey, clientHash, windowStart, expiresAt }) => {
  const result = await getPool().query<{ request_count: number }>(
    `INSERT INTO rate_limit_windows (route_key,client_hash,window_start,request_count,expires_at)
     VALUES ($1,$2,$3,1,$4)
     ON CONFLICT (route_key,client_hash,window_start) DO UPDATE SET request_count=rate_limit_windows.request_count+1
     RETURNING request_count`,
    [routeKey, clientHash, windowStart, expiresAt],
  );
  return Number(result.rows[0]!.request_count);
};

export async function enforceRateLimit(request: Request, policy: RateLimitPolicy, store: RateLimitStore = sqlStore) {
  const now = Date.now();
  const windowStart = Math.floor(now / policy.windowMs);
  const count = await store({ routeKey: policy.routeKey, clientHash: requestFingerprint(request), windowStart, expiresAt: new Date((windowStart + 2) * policy.windowMs) });
  const allowed = count <= policy.limit;
  if (!allowed) emitHiveMetrics({ RateLimitedRequests: 1 }, { Route: policy.routeKey });
  return { allowed, remaining: Math.max(0, policy.limit - count), retryAfterSeconds: Math.max(1, Math.ceil(((windowStart + 1) * policy.windowMs - now) / 1000)) };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json({ error: "Too many expensive requests; retry after the current safety window" }, { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" } });
}
