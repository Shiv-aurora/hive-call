import { probeAwsRuntime } from "@/lib/aws/readiness";
import { checkDatabase } from "@/lib/db/pool";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";

export const runtime = "nodejs";

export async function GET() {
  let database: Awaited<ReturnType<typeof checkDatabase>> | { ok: false; reason: string } = { ok: false, reason: "not_configured" };
  let memory: Awaited<ReturnType<CockroachSkillRepository["memoryHealth"]>> | null = null;
  let mcpEvidence: Awaited<ReturnType<CockroachSkillRepository["latestMcpEvidence"]>> | null = null;
  let mcpLookups: Awaited<ReturnType<CockroachSkillRepository["mcpEvidence"]>> = [];
  if (process.env.DATABASE_URL) {
    try {
      const repository = new CockroachSkillRepository();
      [database, memory, mcpEvidence, mcpLookups] = await Promise.all([checkDatabase(), repository.memoryHealth(), repository.latestMcpEvidence(), repository.mcpEvidence()]);
    } catch {
      database = { ok: false, reason: "unavailable" };
    }
  }
  const awsHealth = process.env.AWS_REGION && process.env.TIER1_MODEL_ID && (process.env.TIER2_MODEL_ID || process.env.BEDROCK_MODEL_ID) && process.env.HIVE_S3_BUCKET ? await probeAwsRuntime() : null;
  const callD = process.env.DATABASE_URL ? await new CockroachSkillRepository().latestCallProof("call_d").catch(() => null) : null;
  return Response.json({
    build: { version: "0.1.0", runtime: "nextjs-node", commit: process.env.BUILD_COMMIT?.slice(0, 12) ?? "local" },
    cockroach: {
      ...database,
      vectorIndex: memory?.skillVectorIndex && memory.callVectorIndex && memory.vectorProbe ? "live_verified" : "unavailable",
      skillVectorIndex: memory?.skillVectorIndex ?? false,
      callVectorIndex: memory?.callVectorIndex ?? false,
      companyContextVectorIndex: memory?.companyContextVectorIndex ?? false,
      companyContextRetrieval: memory?.companyContextProbe ? "live_verified" : "unavailable",
      promotionTransactions: memory?.migration ? "live_verified" : "unavailable",
      managedMcp: mcpEvidence ? "live_verified" : "unavailable",
      mcpEvidence: mcpEvidence ? { query: mcpEvidence.query_redacted, selectedIds: mcpEvidence.selected_ids, latencyMs: mcpEvidence.latency_ms, evidence: mcpEvidence.evidence, createdAt: mcpEvidence.created_at } : null,
      mcpLookups: mcpLookups.map((item) => ({ query: item.query_redacted, selectedIds: item.selected_ids, latencyMs: item.latency_ms, evidence: item.evidence, createdAt: item.created_at })),
    },
    aws: { region: process.env.AWS_REGION ?? null, tier1Model: process.env.TIER1_MODEL_ID ?? null, tier2Model: process.env.TIER2_MODEL_ID ?? process.env.BEDROCK_MODEL_ID ?? null, embeddingModel: process.env.BEDROCK_EMBEDDING_MODEL_ID ?? null, polly: "Amazon Polly", lambda: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME), s3: Boolean(process.env.HIVE_S3_BUCKET), apiGateway: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME), cloudWatch: Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME), health: awsHealth },
    callD: callD ? { ...callD, proof: callD.tier === "tier_1_skill" && Number(callD.tier2_model_calls) === 0 && callD.reasoning_escalation_avoided ? "promoted_skill_to_fast_response_without_full_reasoning" : "unverified" } : null,
    provider: process.env.REASONING_PROVIDER ?? "mock",
  }, { headers: { "cache-control": "no-store" } });
}
