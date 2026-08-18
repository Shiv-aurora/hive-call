import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PersistentHiveOrchestrator } from "@/lib/agents/persistent-orchestrator";
import { emitHiveMetrics } from "@/lib/aws/metrics";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const inputSchema = z.object({ issue: z.string().trim().min(8).max(280) });
// The test caller is always the seeded Northstar customer Ava Thompson with her delayed order,
// so deterministic tools have real order/shipment state to verify against.
const TEST_CUSTOMER_ID = "cus_05";
const TEST_ORDER_ID = "ord_05";

export function classifyTestCallIntent(issue: string) {
  const normalized = issue.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const directShipmentQuestion = /\b(order|package|shipment|delivery|tracking|track|arrive|arrival|eta|late|delayed)\b/.test(normalized);
  const contextualFollowUp = /\bwhen\b.*\b(here|coming|delivered)\b/.test(normalized) || /\bhow\s+(much\s+)?long(?:er)?\b/.test(normalized);
  return directShipmentQuestion || contextualFollowUp
    ? "late shipment tracking"
    : undefined;
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Describe the issue in 8 to 280 characters" }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  try {
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000);
    const generalLimit = await enforceRateLimit(request, { routeKey: "demo-test-call", limit: Number(process.env.DEMO_TEST_CALL_LIMIT ?? 5), windowMs });
    if (!generalLimit.allowed) return rateLimitResponse(generalLimit.retryAfterSeconds);
    const intent = classifyTestCallIntent(parsed.data.issue);
    if (!intent) return Response.json({ error: "This test caller can help with Ava's delayed order and delivery status only" }, { status: 400 });
    emitHiveMetrics({ ExpensiveRequests: 1 }, { Route: "demo-test-call" });
    const result = await new PersistentHiveOrchestrator().resolve({ id: `test_${randomUUID().slice(0, 8)}`, customerId: TEST_CUSTOMER_ID, orderId: TEST_ORDER_ID, issue: parsed.data.issue, intent });
    return Response.json({ result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("test_call_failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: "The test call failed safely", escalate: true }, { status: 503 });
  }
}
