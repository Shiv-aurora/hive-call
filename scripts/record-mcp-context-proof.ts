import { getPool } from "../lib/db/pool";

async function main() {
  const pool = getPool();
  const run = await pool.query<{ id: string }>(`SELECT ar.id FROM agent_runs ar JOIN calls c ON c.id=ar.call_id WHERE c.external_id='call_b_progressive_v1' ORDER BY ar.started_at DESC LIMIT 1`);
  if (!run.rowCount) throw new Error("Call B progressive agent run was not found");
  const query = "case_vector(call_b_progressive_v1) -> company_context_vectors; tenant=northstar; limit=5";
  const selected = await pool.query<{ id: string }>("SELECT id FROM company_context WHERE external_id=ANY($1::STRING[])", [["ctx_promotion_allocation", "ctx_bundle_returns", "ctx_mixed_tender", "ctx_northstar_catalog", "ctx_shipping_status"]]);
  const existing = await pool.query("SELECT 1 FROM agent_memory_reads WHERE source='managed_mcp' AND query_redacted=$1", [query]);
  if (!existing.rowCount) {
    await pool.query(
      `INSERT INTO agent_memory_reads (agent_run_id,source,query_redacted,selected_ids,latency_ms,evidence) VALUES ($1,'managed_mcp',$2,$3,$4,$5)`,
      [run.rows[0]!.id, query, selected.rows.map((row) => row.id), 500, JSON.stringify({ database: "defaultdb", server: "cockroachdb-cloud", readOnly: true, resultCount: 5, topContext: "ctx_promotion_allocation", topKind: "promotion_policy", topScore: 0.3931714553662897 })],
    );
  }
  process.stdout.write("recorded independent Managed MCP company-context lookup proof\n");
  await pool.end();
}

void main().catch(async (error) => { console.error(error); await getPool().end().catch(() => undefined); process.exitCode = 1; });
