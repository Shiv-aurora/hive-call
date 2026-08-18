import { PersistentHiveOrchestrator } from "../lib/agents/persistent-orchestrator";
import { getPool } from "../lib/db/pool";

async function main() {
  const orchestrator = new PersistentHiveOrchestrator();
  const results = [];
  const caseIds = (process.env.CASE_IDS ?? "call_a,call_b,call_c,call_d").split(",").map((value) => value.trim()).filter(Boolean);
  for (const caseId of caseIds) {
    const result = await orchestrator.resolveGuidedCase(caseId);
    results.push({ caseId, tier: result.tier, reasoningModelCalls: result.reasoningModelCalls, skillId: result.skillId ?? result.candidate?.id ?? null, candidatePromoted: result.candidate?.status === "promoted", shadow: result.evaluation ? `${result.evaluation.passed}/${result.evaluation.total}` : null });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  await getPool().end();
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await getPool().end().catch(() => undefined);
  process.exitCode = 1;
});
