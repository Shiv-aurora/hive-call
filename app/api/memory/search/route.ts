import { z } from "zod";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { BedrockEmbeddingProvider } from "@/lib/providers/embeddings";
import { forbiddenTenant, hasApiRole, isConfiguredTenant, unauthorized } from "@/lib/security/api-auth";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({ tenantId: z.string().uuid(), agentRunId: z.string().uuid(), query: z.string().min(3).max(2_000), limit: z.number().int().min(1).max(20).default(8) });

export async function POST(request: Request) {
  if (!hasApiRole(request, "runtime")) return unauthorized();
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid memory search request" }, { status: 400 });
  const startedAt = Date.now();
  try {
    const repository = new CockroachSkillRepository();
    if (!await isConfiguredTenant(parsed.data.tenantId, repository)) return forbiddenTenant();
    if (!await repository.agentRunBelongsToTenant(parsed.data.agentRunId, parsed.data.tenantId)) return forbiddenTenant();
    const limit = await enforceRateLimit(request, { routeKey: "memory-search", limit: 60, windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000) });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const embedding = await new BedrockEmbeddingProvider().embed(parsed.data.query);
    const matches = await repository.vectorSearch(parsed.data.tenantId, embedding, parsed.data.limit);
    await repository.recordMemoryRead({ agentRunId: parsed.data.agentRunId, source: "vector", queryRedacted: `[query:${parsed.data.query.length}_chars]`, selectedIds: matches.map((match) => match.skillVersionId), latencyMs: Date.now() - startedAt, evidence: { index: "skill_embedding_idx" } });
    return Response.json({ matches, embeddingDimensions: embedding.length });
  } catch {
    return Response.json({ error: "Vector memory is unavailable" }, { status: 503 });
  }
}
