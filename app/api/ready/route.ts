import { probeAwsRuntime } from "@/lib/aws/readiness";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";

export const runtime = "nodejs";

export async function GET() {
  const requireExternal = process.env.REQUIRE_EXTERNAL_SERVICES === "true";
  const dependencies: Record<string, string> = {};
  if (!process.env.DATABASE_URL) {
    dependencies.cockroach = "credential_gate";
    dependencies.skillVectorIndex = "credential_gate";
    dependencies.callVectorIndex = "credential_gate";
    dependencies.companyContextVectorIndex = "credential_gate";
    dependencies.mcpEvidence = "credential_gate";
  } else {
    try {
      const repository = new CockroachSkillRepository();
      const [memory, mcpEvidence] = await Promise.all([repository.memoryHealth(), repository.latestMcpEvidence()]);
      dependencies.cockroach = memory.migration && memory.vectorProbe ? "ready" : "unavailable";
      dependencies.skillVectorIndex = memory.skillVectorIndex ? "ready" : "unavailable";
      dependencies.callVectorIndex = memory.callVectorIndex ? "ready" : "unavailable";
      dependencies.companyContextVectorIndex = memory.companyContextVectorIndex && memory.companyContextProbe ? "ready" : "unavailable";
      dependencies.mcpEvidence = mcpEvidence ? "ready" : "unavailable";
    } catch {
      dependencies.cockroach = "unavailable";
      dependencies.skillVectorIndex = "unavailable";
      dependencies.callVectorIndex = "unavailable";
      dependencies.companyContextVectorIndex = "unavailable";
      dependencies.mcpEvidence = "unavailable";
    }
  }
  if (process.env.AWS_REGION && process.env.TIER1_MODEL_ID && (process.env.TIER2_MODEL_ID || process.env.BEDROCK_MODEL_ID) && process.env.HIVE_S3_BUCKET) {
    const aws = await probeAwsRuntime();
    dependencies.fastResponseModel = aws.tier1Model ? "ready" : "unavailable";
    dependencies.reasoningModel = aws.tier2Model ? "ready" : "unavailable";
    dependencies.bedrock = aws.tier1Model && aws.tier2Model ? "ready" : "unavailable";
    dependencies.embeddings = aws.embeddings ? "ready" : "unavailable";
    dependencies.polly = aws.polly ? "ready" : "unavailable";
    dependencies.s3 = aws.s3 ? "ready" : "unavailable";
  } else {
    dependencies.fastResponseModel = dependencies.reasoningModel = dependencies.bedrock = dependencies.embeddings = dependencies.polly = dependencies.s3 = "credential_gate";
  }
  const ready = !requireExternal || Object.values(dependencies).every((value) => value === "ready");
  return Response.json({ ready, dependencies }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
