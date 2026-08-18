import type { PoolClient } from "pg";
import { skillSchema } from "@/lib/domain/schemas";
import type { ModelUsage, ResolutionResult, ResolutionTier, RuntimeSupportCase, Skill } from "@/lib/domain/types";
import { getPool } from "@/lib/db/pool";
import { withRetryableTransaction } from "@/lib/db/transactions";

type SkillVersionRow = { id: string; definition: unknown; status: Skill["status"]; confidence: string | number };
export type PersistedShadowCase = { id: string; externalId: string; input: unknown; oracle: unknown };
export type CandidateEvaluation = { passed: number; total: number; correctness: number; safetyRate: number; policyViolations: number; details: unknown[] };

export const vectorLiteral = (embedding: number[]) => `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;

export class CockroachSkillRepository {
  async loadGuidedReplay(caseId: string) {
    const result = await getPool().query<{ result: ResolutionResult }>("SELECT result FROM guided_demo_replays WHERE case_id=$1", [caseId]);
    return result.rows[0]?.result;
  }

  async saveGuidedReplay(caseId: string, result: ResolutionResult) {
    await getPool().query("INSERT INTO guided_demo_replays (case_id,result) VALUES ($1,$2) ON CONFLICT (case_id) DO UPDATE SET result=excluded.result,created_at=now()", [caseId, JSON.stringify(result)]);
  }

  async tenantIdForSlug(slug: string) {
    const result = await getPool().query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [slug]);
    if (!result.rowCount) throw new Error(`Tenant ${slug} is not seeded`);
    return result.rows[0]!.id;
  }

  async agentRunBelongsToTenant(agentRunId: string, tenantId: string) {
    const result = await getPool().query("SELECT 1 FROM agent_runs ar JOIN calls c ON c.id=ar.call_id WHERE ar.id=$1 AND c.tenant_id=$2", [agentRunId, tenantId]);
    return result.rowCount === 1;
  }

  async listPromoted(tenantId: string): Promise<Skill[]> {
    const result = await getPool().query<SkillVersionRow>(
      `SELECT sv.id, sv.definition, sv.status, sv.confidence
       FROM skills s JOIN skill_versions sv ON sv.id = s.active_version_id
       WHERE s.tenant_id = $1 AND sv.status = 'promoted'
       ORDER BY s.skill_family`, [tenantId],
    );
    return result.rows.map((row) => skillSchema.parse({ ...(row.definition as object), id: row.id, tenantId, status: row.status, confidence: Number(row.confidence) }));
  }

  async listLibrary(tenantId: string): Promise<Skill[]> {
    const result = await getPool().query<SkillVersionRow>(
      `SELECT sv.id, sv.definition, sv.status, sv.confidence
       FROM skill_versions sv JOIN skills s ON s.id = sv.skill_id
       WHERE s.tenant_id = $1 AND sv.status IN ('promoted','shadow','candidate','degraded')
       ORDER BY s.skill_family, sv.version DESC`, [tenantId],
    );
    return result.rows.map((row) => skillSchema.parse({ ...(row.definition as object), id: row.id, tenantId, status: row.status, confidence: Number(row.confidence) }));
  }

  async skillOperationalStats(tenantId: string) {
    const result = await getPool().query<{ id: string; uses: number; failures: number; shadow_pass_rate: string | number | null; source_cases: string[] | null }>(
      `SELECT sv.id,
              (SELECT count(*) FROM call_telemetry ct WHERE ct.skill_version_id=sv.id AND ct.reasoning_escalation_avoided) AS uses,
              (SELECT count(*) FROM demotion_events de WHERE de.skill_version_id=sv.id) AS failures,
              (SELECT correctness FROM skill_evaluations se WHERE se.skill_version_id=sv.id ORDER BY se.created_at DESC LIMIT 1) AS shadow_pass_rate,
              (SELECT array_agg(c.external_id) FROM skill_source_cases ssc JOIN calls c ON c.id=ssc.call_id WHERE ssc.skill_version_id=sv.id) AS source_cases
       FROM skill_versions sv JOIN skills s ON s.id=sv.skill_id WHERE s.tenant_id=$1`,
      [tenantId],
    );
    return new Map(result.rows.map((row) => [row.id, { uses: Number(row.uses), failures: Number(row.failures), shadowPassRate: row.shadow_pass_rate === null ? undefined : Number(row.shadow_pass_rate), sourceCases: row.source_cases ?? [] }]));
  }

  async vectorSearch(tenantId: string, embedding: number[], limit = 8) {
    const result = await getPool().query<SkillVersionRow & { score: number; retrieval_text: string }>(
      `SELECT sv.id, sv.definition, sv.status, sv.confidence,
              1 - (se.embedding <=> $1::VECTOR) AS score, se.retrieval_text
       FROM skill_embeddings se
       JOIN skill_versions sv ON sv.id = se.skill_version_id
       JOIN skills s ON s.id = sv.skill_id AND s.active_version_id = sv.id
       WHERE se.tenant_id = $2 AND s.tenant_id = $2 AND sv.status = 'promoted'
       ORDER BY se.embedding <=> $1::VECTOR LIMIT $3`, [vectorLiteral(embedding), tenantId, limit],
    );
    return result.rows.map((row) => ({
      skillVersionId: row.id,
      score: Number(row.score),
      retrievalText: row.retrieval_text,
      skill: skillSchema.parse({ ...(row.definition as object), id: row.id, tenantId, status: row.status, confidence: Number(row.confidence) }),
    }));
  }

  async createCall(tenantId: string, supportCase: RuntimeSupportCase, embedding: number[]) {
    const result = await getPool().query<{ id: string }>(
      `INSERT INTO calls (tenant_id, customer_id, external_id, normalized_problem, case_embedding)
       VALUES ($1, (SELECT id FROM customers WHERE tenant_id=$1 AND external_id=$2), $3, $4, $5::VECTOR)
       ON CONFLICT (tenant_id, external_id) DO UPDATE
       SET normalized_problem=excluded.normalized_problem, case_embedding=excluded.case_embedding
       RETURNING id`,
      [tenantId, supportCase.customerId, supportCase.id, `${supportCase.issue} ${supportCase.intent}`.toLowerCase(), vectorLiteral(embedding)],
    );
    return result.rows[0]!.id;
  }

  async callEmbedding(tenantId: string, externalCallId: string) {
    const result = await getPool().query<{ embedding: string }>("SELECT case_embedding::STRING AS embedding FROM calls WHERE tenant_id=$1 AND external_id=$2", [tenantId, externalCallId]);
    return result.rows[0]?.embedding ? JSON.parse(result.rows[0].embedding) as number[] : undefined;
  }

  async createAgentRun(input: { callId: string; tier: ResolutionTier; provider?: string; model?: string; modelCalls: number }) {
    const result = await getPool().query<{ id: string }>(
      "INSERT INTO agent_runs (call_id, tier, provider, model, model_calls, completed_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING id",
      [input.callId, input.tier, input.provider ?? null, input.model ?? null, input.modelCalls],
    );
    return result.rows[0]!.id;
  }

  async recordToolCalls(agentRunId: string, calls: Array<{ tool: string; input: unknown; output: unknown; latencyMs: number; success: boolean }>) {
    for (const call of calls) {
      await getPool().query(
        "INSERT INTO tool_calls (agent_run_id, tool_name, risk, input, output, latency_ms, success) VALUES ($1,$2,'read',$3,$4,$5,$6)",
        [agentRunId, call.tool, JSON.stringify(call.input), JSON.stringify(call.output), call.latencyMs, call.success],
      );
    }
  }

  async recordModelInvocations(agentRunId: string, usages: ModelUsage[]) {
    for (const usage of usages) {
      await getPool().query(
        `INSERT INTO model_invocations (agent_run_id,role,provider,model_id,input_tokens,output_tokens,latency_ms,request_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [agentRunId, usage.role, usage.provider, usage.modelId, usage.inputTokens, usage.outputTokens, usage.latencyMs, usage.requestId ?? null],
      );
    }
  }

  async recordCallTelemetry(callId: string, result: ResolutionResult) {
    const telemetry = result.telemetry;
    if (!telemetry) return;
    await getPool().query(
      `INSERT INTO call_telemetry (call_id,tier1_model_calls,tier2_model_calls,skill_compiler_calls,embedding_requests,polly_characters,context_retrieval_count,overall_latency_ms,tier1_latency_ms,tier2_latency_ms,human_escalation,reasoning_escalation_avoided,skill_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (call_id) DO UPDATE SET tier1_model_calls=excluded.tier1_model_calls,tier2_model_calls=excluded.tier2_model_calls,skill_compiler_calls=excluded.skill_compiler_calls,embedding_requests=excluded.embedding_requests,context_retrieval_count=excluded.context_retrieval_count,overall_latency_ms=excluded.overall_latency_ms,tier1_latency_ms=excluded.tier1_latency_ms,tier2_latency_ms=excluded.tier2_latency_ms,human_escalation=excluded.human_escalation,reasoning_escalation_avoided=excluded.reasoning_escalation_avoided,skill_version_id=excluded.skill_version_id,updated_at=now()`,
      [callId, telemetry.tier1ModelCalls, telemetry.tier2ModelCalls, telemetry.skillCompilerCalls, telemetry.embeddingRequests, telemetry.pollyCharacters, telemetry.contextRetrievalCount, telemetry.overallLatencyMs, telemetry.tier1LatencyMs, telemetry.tier2LatencyMs, result.humanEscalation, telemetry.reasoningEscalationAvoided, result.skillId ?? null],
    );
  }

  async recordPollyCharacters(externalCallId: string, characters: number) {
    await getPool().query(
      `UPDATE call_telemetry SET polly_characters=polly_characters+$1,updated_at=now()
       WHERE call_id=(SELECT id FROM calls WHERE external_id IN ($2,$2 || '_progressive_v1') AND tenant_id=(SELECT id FROM tenants WHERE slug=$3) ORDER BY opened_at DESC LIMIT 1)`,
      [characters, externalCallId, process.env.HIVE_TENANT_SLUG ?? "northstar"],
    );
  }

  async recordMemoryRead(input: { agentRunId: string; source: "sql" | "vector" | "managed_mcp"; queryRedacted: string; selectedIds: string[]; latencyMs: number; evidence?: Record<string, unknown> }) {
    await getPool().query(
      `INSERT INTO agent_memory_reads (agent_run_id, source, query_redacted, selected_ids, latency_ms, evidence)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.agentRunId, input.source, input.queryRedacted, input.selectedIds, input.latencyMs, JSON.stringify(input.evidence ?? {})],
    );
  }

  async recordResolution(tenantId: string, callId: string, result: ResolutionResult) {
    const resolution = await getPool().query<{ id: string }>(
      `INSERT INTO resolutions (tenant_id, call_id, tier, summary, evidence, finalized_at, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,now(),$6)
       ON CONFLICT (idempotency_key) DO UPDATE SET tier=excluded.tier,summary=excluded.summary,evidence=excluded.evidence,finalized_at=excluded.finalized_at
       RETURNING id`,
      [tenantId, callId, result.tier, result.response, JSON.stringify({ toolsUsed: result.toolsUsed, trace: result.trace, reasoningModelCalls: result.reasoningModelCalls, telemetry: result.telemetry, candidate: result.candidate, evaluation: result.evaluation }), `demo-resolution:${tenantId}:${callId}`],
    );
    await getPool().query(
      `INSERT INTO resolution_outcomes (resolution_id,outcome,verified,oracle_evidence)
       SELECT $1,$2,true,$3 WHERE NOT EXISTS (SELECT 1 FROM resolution_outcomes WHERE resolution_id=$1 AND verified)`,
      [resolution.rows[0]!.id, result.outcome, JSON.stringify({ evidenceLinked: true, toolsUsed: result.toolsUsed, policyViolations: result.evaluation?.policyViolations ?? 0 })],
    );
    return resolution.rows[0]!.id;
  }

  async recordHumanHandoff(callId: string, reason: string, context: Record<string, unknown>) {
    await getPool().query("INSERT INTO human_handoffs (call_id,reason,context) VALUES ($1,$2,$3)", [callId, reason, JSON.stringify(context)]);
  }

  async listShadowCases(tenantId: string, family: string): Promise<PersistedShadowCase[]> {
    const result = await getPool().query<{ id: string; external_id: string; input: unknown; oracle: unknown }>(
      "SELECT id, external_id, input, oracle FROM shadow_cases WHERE tenant_id=$1 AND skill_family=$2 AND split='shadow' ORDER BY external_id",
      [tenantId, family],
    );
    return result.rows.map((row) => ({ id: row.id, externalId: row.external_id, input: row.input, oracle: row.oracle }));
  }

  async persistCandidate(input: { tenantId: string; candidate: Skill; embedding: number[]; retrievalText: string; sourceCallId: string; evaluation: CandidateEvaluation }) {
    return withRetryableTransaction(getPool(), async (client) => {
      const skillRow = await client.query<{ id: string }>(
        `INSERT INTO skills (tenant_id, skill_family) VALUES ($1,$2)
         ON CONFLICT (tenant_id, skill_family) DO UPDATE SET skill_family=excluded.skill_family RETURNING id`,
        [input.tenantId, input.candidate.family],
      );
      const skillId = skillRow.rows[0]!.id;
      const versionRow = await client.query<{ version: number }>("SELECT COALESCE(max(version),0)+1 AS version FROM skill_versions WHERE skill_id=$1", [skillId]);
      const version = Number(versionRow.rows[0]!.version);
      const definition = skillSchema.parse({ ...input.candidate, tenantId: input.tenantId, version, status: "candidate" });
      const insertedVersion = await client.query<{ id: string }>(
        "INSERT INTO skill_versions (skill_id, version, status, definition, confidence) VALUES ($1,$2,'candidate',$3,$4) RETURNING id",
        [skillId, version, JSON.stringify(definition), definition.confidence],
      );
      const skillVersionId = insertedVersion.rows[0]!.id;
      await client.query("INSERT INTO skill_embeddings (skill_version_id, tenant_id, embedding, retrieval_text) VALUES ($1,$2,$3::VECTOR,$4)", [skillVersionId, input.tenantId, vectorLiteral(input.embedding), input.retrievalText]);
      await client.query("INSERT INTO skill_source_cases (skill_version_id, call_id) VALUES ($1,$2)", [skillVersionId, input.sourceCallId]);
      const dependencies = await client.query<{ id: string }>(
        `SELECT pv.id FROM policy_versions pv JOIN policies p ON p.id=pv.policy_id
         WHERE p.tenant_id=$1 AND pv.external_id = ANY($2::STRING[]) AND pv.active`,
        [input.tenantId, definition.policyDependencies],
      );
      if (dependencies.rowCount !== definition.policyDependencies.length) throw new Error("Candidate policy dependency is not active for tenant");
      for (const dependency of dependencies.rows) await client.query("INSERT INTO skill_policy_dependencies (skill_version_id, policy_version_id) VALUES ($1,$2)", [skillVersionId, dependency.id]);
      const evaluationRow = await client.query<{ id: string }>(
        `INSERT INTO skill_evaluations (skill_version_id,total,passed,correctness,safety_rate,policy_violations,details)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [skillVersionId, input.evaluation.total, input.evaluation.passed, input.evaluation.correctness, input.evaluation.safetyRate, input.evaluation.policyViolations, JSON.stringify(input.evaluation.details)],
      );
      return { skillId, skillVersionId, evaluationId: evaluationRow.rows[0]!.id, candidate: { ...definition, id: skillVersionId } };
    });
  }

  async promoteCandidate(input: { tenantId: string; skillId: string; skillVersionId: string; evaluationId: string; actor: string; idempotencyKey: string }) {
    return withRetryableTransaction(getPool(), async (client: PoolClient) => {
      const replay = await client.query<{ skill_version_id: string; evaluation_id: string; skill_id: string; tenant_id: string }>(
        `SELECT pe.skill_version_id,pe.evaluation_id,sv.skill_id,s.tenant_id
         FROM promotion_events pe JOIN skill_versions sv ON sv.id=pe.skill_version_id JOIN skills s ON s.id=sv.skill_id
         WHERE pe.idempotency_key=$1`,
        [input.idempotencyKey],
      );
      if (replay.rowCount) {
        const prior = replay.rows[0]!;
        if (prior.skill_version_id !== input.skillVersionId || prior.evaluation_id !== input.evaluationId || prior.skill_id !== input.skillId || prior.tenant_id !== input.tenantId) throw new Error("Idempotency key belongs to another tenant promotion");
        return { promoted: true as const, replayed: true as const, skillVersionId: input.skillVersionId };
      }
      const lock = await client.query<{ active_version_id: string | null }>("SELECT active_version_id FROM skills WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [input.skillId, input.tenantId]);
      if (!lock.rowCount) throw new Error("Skill family not found for tenant");
      const candidate = await client.query(
        `SELECT sv.id FROM skill_versions sv JOIN skills s ON s.id=sv.skill_id
         WHERE sv.id=$1 AND sv.skill_id=$2 AND s.tenant_id=$3 AND sv.status IN ('candidate','shadow')`,
        [input.skillVersionId, input.skillId, input.tenantId],
      );
      if (!candidate.rowCount) throw new Error("Candidate does not belong to tenant skill or is not promotable");
      const evaluation = await client.query<{ total: number; passed: number; safety_rate: string | number; policy_violations: number }>("SELECT total,passed,safety_rate,policy_violations FROM skill_evaluations WHERE id=$1 AND skill_version_id=$2", [input.evaluationId, input.skillVersionId]);
      const gate = evaluation.rows[0];
      if (!gate || Number(gate.total) < 5 || Number(gate.passed) !== Number(gate.total) || Number(gate.safety_rate) !== 1 || Number(gate.policy_violations) !== 0) throw new Error("Promotion gate not satisfied");
      const activeVersionId = lock.rows[0]!.active_version_id;
      if (activeVersionId && activeVersionId !== input.skillVersionId) await client.query("UPDATE skill_versions SET status='deprecated',superseded_by=$1,row_version=row_version+1 WHERE id=$2 AND status='promoted'", [input.skillVersionId, activeVersionId]);
      const promoted = await client.query("UPDATE skill_versions SET status='promoted',confidence=greatest(confidence,0.96),promoted_at=now(),row_version=row_version+1 WHERE id=$1 AND status IN ('candidate','shadow')", [input.skillVersionId]);
      if (promoted.rowCount !== 1) throw new Error("Candidate promotion lost a concurrent update");
      await client.query("UPDATE skills SET active_version_id=$1 WHERE id=$2 AND tenant_id=$3", [input.skillVersionId, input.skillId, input.tenantId]);
      await client.query("INSERT INTO promotion_events (skill_version_id,evaluation_id,actor,idempotency_key) VALUES ($1,$2,$3,$4)", [input.skillVersionId, input.evaluationId, input.actor, input.idempotencyKey]);
      await client.query("INSERT INTO audit_events (tenant_id,actor,action,object_type,object_id,detail) VALUES ($1,$2,'promote','skill_version',$3,$4)", [input.tenantId, input.actor, input.skillVersionId, JSON.stringify({ evaluationId: input.evaluationId })]);
      return { promoted: true as const, replayed: false as const, skillVersionId: input.skillVersionId };
    });
  }

  async degradeSkill(input: { tenantId: string; skillVersionId: string; reason: string; evidence: Record<string, unknown> }) {
    return withRetryableTransaction(getPool(), async (client) => {
      const degraded = await client.query(
        `UPDATE skill_versions AS sv SET status='degraded',row_version=row_version+1
         FROM skills AS s WHERE sv.id=$1 AND sv.skill_id=s.id AND s.tenant_id=$2 AND sv.status='promoted'`,
        [input.skillVersionId, input.tenantId],
      );
      if (degraded.rowCount !== 1) throw new Error("Promoted skill version not found for tenant");
      await client.query("UPDATE skills SET active_version_id=NULL WHERE tenant_id=$1 AND active_version_id=$2", [input.tenantId, input.skillVersionId]);
      await client.query("INSERT INTO demotion_events (skill_version_id,reason,evidence) VALUES ($1,$2,$3)", [input.skillVersionId, input.reason, JSON.stringify(input.evidence)]);
      await client.query("INSERT INTO audit_events (tenant_id,actor,action,object_type,object_id,detail) VALUES ($1,'policy-monitor','degrade','skill_version',$2,$3)", [input.tenantId, input.skillVersionId, JSON.stringify({ reason: input.reason, evidence: input.evidence })]);
      return { degraded: true as const };
    });
  }

  async memoryHealth() {
    const [migration, skillIndex, callIndex, vectorProbe] = await Promise.all([
      getPool().query("SELECT 1 FROM schema_migrations WHERE filename IN ('001_initial.sql','002_tiered_intelligence.sql','003_promotion_confidence.sql') HAVING count(*)=3"),
      getPool().query("SELECT 1 FROM [SHOW INDEXES FROM skill_embeddings] WHERE index_name='skill_embedding_idx'"),
      getPool().query("SELECT 1 FROM [SHOW INDEXES FROM calls] WHERE index_name='call_embedding_idx'"),
      getPool().query<{ score: number }>("SELECT 1 - (embedding <=> embedding) AS score FROM skill_embeddings LIMIT 1"),
    ]);
    const [contextIndex, contextProbe] = await Promise.all([
      getPool().query("SELECT 1 FROM [SHOW INDEXES FROM company_context] WHERE index_name='company_context_embedding_idx'"),
      getPool().query<{ score: number }>("SELECT 1 - (embedding <=> embedding) AS score FROM company_context LIMIT 1"),
    ]);
    return { migration: migration.rowCount === 1, skillVectorIndex: (skillIndex.rowCount ?? 0) > 0, callVectorIndex: (callIndex.rowCount ?? 0) > 0, companyContextVectorIndex: (contextIndex.rowCount ?? 0) > 0, vectorProbe: Number(vectorProbe.rows[0]?.score) === 1, companyContextProbe: Number(contextProbe.rows[0]?.score) === 1 };
  }

  async latestCallProof(externalCallId: string) {
    const result = await getPool().query<{
      external_id: string; tier: ResolutionTier; tier1_model_calls: number; tier2_model_calls: number; reasoning_escalation_avoided: boolean; skill_version_id: string | null; model_ids: string[] | null;
    }>(
      `SELECT c.external_id,ar.tier,ct.tier1_model_calls,ct.tier2_model_calls,ct.reasoning_escalation_avoided,ct.skill_version_id,
              array_agg(mi.model_id) FILTER (WHERE mi.model_id IS NOT NULL) AS model_ids
       FROM calls c JOIN agent_runs ar ON ar.call_id=c.id JOIN call_telemetry ct ON ct.call_id=c.id
       LEFT JOIN model_invocations mi ON mi.agent_run_id=ar.id
       WHERE c.external_id=$1
       GROUP BY c.external_id,ar.id,ar.tier,ct.tier1_model_calls,ct.tier2_model_calls,ct.reasoning_escalation_avoided,ct.skill_version_id
       ORDER BY ar.started_at DESC LIMIT 1`,
      [externalCallId],
    );
    const row = result.rows[0];
    return row ? { ...row, tier1_model_calls: Number(row.tier1_model_calls), tier2_model_calls: Number(row.tier2_model_calls) } : null;
  }

  async latestMcpEvidence() {
    const result = await getPool().query<{ query_redacted: string; selected_ids: string[]; latency_ms: number; evidence: unknown; created_at: Date }>(
      "SELECT query_redacted,selected_ids,latency_ms,evidence,created_at FROM agent_memory_reads WHERE source='managed_mcp' ORDER BY created_at DESC LIMIT 1",
    );
    return result.rows[0] ?? null;
  }

  async mcpEvidence(limit = 5) {
    const result = await getPool().query<{ query_redacted: string; selected_ids: string[]; latency_ms: number; evidence: unknown; created_at: Date }>(
      "SELECT query_redacted,selected_ids,latency_ms,evidence,created_at FROM agent_memory_reads WHERE source='managed_mcp' ORDER BY created_at DESC LIMIT $1",
      [limit],
    );
    return result.rows;
  }
}
