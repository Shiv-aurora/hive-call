import { z } from "zod";
import { PersistentHiveOrchestrator } from "@/lib/agents/persistent-orchestrator";
import { emitHiveMetrics } from "@/lib/aws/metrics";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const inputSchema = z.object({ caseId: z.enum(["call_a", "call_b", "call_c", "call_d"]) });

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid guided case" }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  try {
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000);
    const generalLimit = await enforceRateLimit(request, { routeKey: "demo-reason", limit: Number(process.env.DEMO_RATE_LIMIT ?? 12), windowMs });
    if (!generalLimit.allowed) return rateLimitResponse(generalLimit.retryAfterSeconds);
    const replayLimit = await enforceRateLimit(request, { routeKey: `demo-reason:${parsed.data.caseId}`, limit: Number(process.env.DEMO_CASE_REPLAY_LIMIT ?? 3), windowMs });
    if (!replayLimit.allowed) return rateLimitResponse(replayLimit.retryAfterSeconds);
    emitHiveMetrics({ ExpensiveRequests: 1 }, { Route: "demo-reason" });
    const result = await new PersistentHiveOrchestrator().resolveGuidedCase(parsed.data.caseId);
    return Response.json({ result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("persistent_reasoning_failed", { caseId: parsed.data.caseId, message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "The persistent resolution path failed safely", escalate: true }, { status: 503 });
  }
}
