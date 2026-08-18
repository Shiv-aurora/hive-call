import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";

const live = process.env.DATABASE_URL ? describe : describe.skip;

live("live CockroachDB memory", () => {
  const repository = new CockroachSkillRepository();

  afterAll(async () => { await getPool().end(); });

  it("has the migration, vector columns, and both distributed vector indexes", async () => {
    await expect(repository.memoryHealth()).resolves.toEqual({ migration: true, skillVectorIndex: true, callVectorIndex: true, companyContextVectorIndex: true, vectorProbe: true, companyContextProbe: true });
    const columns = await getPool().query<{ table_name: string; data_type: string }>("SELECT 'skill_embeddings' AS table_name,data_type FROM [SHOW COLUMNS FROM skill_embeddings] WHERE column_name='embedding' UNION ALL SELECT 'calls' AS table_name,data_type FROM [SHOW COLUMNS FROM calls] WHERE column_name='case_embedding'");
    expect(columns.rows.map((row) => [row.table_name, row.data_type])).toEqual(expect.arrayContaining([["skill_embeddings", "VECTOR(1024)"], ["calls", "VECTOR(1024)"]]));
  });

  it("retrieves targeted company context through CockroachDB vectors", async () => {
    const tenantId = await repository.tenantIdForSlug("northstar");
    const vector = await getPool().query<{ embedding: string }>("SELECT case_embedding::STRING AS embedding FROM calls WHERE tenant_id=$1 AND external_id='call_b'", [tenantId]);
    const rows = await getPool().query<{ external_id: string; score: string }>(
      `SELECT external_id,1-(embedding <=> $1::VECTOR) AS score FROM company_context WHERE tenant_id=$2 AND active ORDER BY embedding <=> $1::VECTOR LIMIT 3`,
      [vector.rows[0]!.embedding, tenantId],
    );
    expect(rows.rows.some((row) => row.external_id === "ctx_promotion_allocation")).toBe(true);
    expect(Number(rows.rows[0]?.score)).toBeGreaterThan(0.2);
  });

  it("retrieves Call D's promoted mixed-tender skill through the vector path", async () => {
    const tenantId = await repository.tenantIdForSlug("northstar");
    const vector = await getPool().query<{ embedding: string }>("SELECT case_embedding::STRING AS embedding FROM calls WHERE tenant_id=$1 AND external_id='call_d'", [tenantId]);
    const matches = await repository.vectorSearch(tenantId, JSON.parse(vector.rows[0]!.embedding), 3);
    expect(matches[0]?.skill.family).toBe("bundle_mixed_tender_refund");
    expect(matches[0]?.score).toBeGreaterThan(0.7);
  });

  it("does not expose another tenant's promoted memory", async () => {
    const tenantId = await repository.tenantIdForSlug("northstar");
    const vector = await getPool().query<{ embedding: string }>("SELECT embedding::STRING AS embedding FROM skill_embeddings WHERE tenant_id=$1 LIMIT 1", [tenantId]);
    const foreignTenant = randomUUID();
    await expect(repository.listPromoted(foreignTenant)).resolves.toEqual([]);
    await expect(repository.vectorSearch(foreignTenant, JSON.parse(vector.rows[0]!.embedding), 8)).resolves.toEqual([]);
  });

  it("replays the same promotion idempotently and rejects cross-tenant replay", async () => {
    const row = await getPool().query<{ tenant_id: string; skill_id: string; skill_version_id: string; evaluation_id: string; idempotency_key: string }>(
      `SELECT s.tenant_id,s.id AS skill_id,pe.skill_version_id,pe.evaluation_id,pe.idempotency_key
       FROM promotion_events pe JOIN skill_versions sv ON sv.id=pe.skill_version_id JOIN skills s ON s.id=sv.skill_id
       WHERE s.skill_family='bundle_mixed_tender_refund' AND s.active_version_id=pe.skill_version_id AND sv.status='promoted' ORDER BY pe.created_at DESC LIMIT 1`,
    );
    const input = { tenantId: row.rows[0]!.tenant_id, skillId: row.rows[0]!.skill_id, skillVersionId: row.rows[0]!.skill_version_id, evaluationId: row.rows[0]!.evaluation_id, actor: "idempotency-test", idempotencyKey: row.rows[0]!.idempotency_key };
    await expect(repository.promoteCandidate(input)).resolves.toMatchObject({ promoted: true, replayed: true, skillVersionId: input.skillVersionId });
    await expect(repository.promoteCandidate({ ...input, tenantId: randomUUID() })).rejects.toThrow(/another tenant promotion/);
    const active = await getPool().query("SELECT 1 FROM skills s JOIN skill_versions sv ON sv.id=s.active_version_id WHERE s.id=$1 AND sv.id=$2 AND sv.status='promoted'", [input.skillId, input.skillVersionId]);
    expect(active.rowCount).toBe(1);
  });

  it("preserves the real guided loop and MCP lookup evidence", async () => {
    const rows = await getPool().query<{ external_id: string; tier: string; model_calls: string }>(
      `SELECT DISTINCT ON (c.external_id) c.external_id,ar.tier,ar.model_calls
       FROM calls c JOIN agent_runs ar ON ar.call_id=c.id
       WHERE c.external_id IN ('call_b','call_c','call_d')
       ORDER BY c.external_id,ar.started_at DESC`,
    );
    const byCase = new Map(rows.rows.map((row) => [row.external_id, row]));
    expect(byCase.get("call_b")?.tier).toBe("tier_2_reasoning");
    expect(byCase.get("call_c")?.tier).toBe("tier_3_human");
    expect(byCase.get("call_d")).toMatchObject({ tier: "tier_1_skill", model_calls: "0" });
    const mcp = await repository.mcpEvidence();
    expect(mcp).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidence: expect.objectContaining({ server: "cockroachdb-cloud", readOnly: true, topFamily: "bundle_mixed_tender_refund" }) }),
      expect.objectContaining({ evidence: expect.objectContaining({ server: "cockroachdb-cloud", readOnly: true, topContext: "ctx_promotion_allocation" }) }),
    ]));
  });

  it("records distinct Tier-1 and Tier-2 model telemetry", async () => {
    const callD = await repository.latestCallProof("call_d");
    expect(callD).toMatchObject({ tier: "tier_1_skill", tier1_model_calls: 1, tier2_model_calls: 0, reasoning_escalation_avoided: true });
    const roles = await getPool().query<{ role: string; model_id: string; input_tokens: number; output_tokens: number }>(
      `SELECT mi.role,mi.model_id,mi.input_tokens,mi.output_tokens FROM model_invocations mi JOIN agent_runs ar ON ar.id=mi.agent_run_id JOIN calls c ON c.id=ar.call_id WHERE c.external_id IN ('call_d','call_b_progressive_v1')`,
    );
    expect(roles.rows).toEqual(expect.arrayContaining([expect.objectContaining({ role: "tier1_conversation", model_id: "amazon.nova-micro-v1:0" }), expect.objectContaining({ role: "tier2_reasoning", model_id: "amazon.nova-pro-v1:0" })]));
    expect(roles.rows.every((row) => Number(row.input_tokens) > 0 && Number(row.output_tokens) > 0)).toBe(true);
  });
});
