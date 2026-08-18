import { Navigation } from "@/components/navigation";
import { DemoShell } from "@/components/demo/demo-shell";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { getPool } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  let initialPromotedCount = 0;
  let initialCallCount = 0;
  let initialTier1Count = 0;
  if (process.env.DATABASE_URL) {
    const repository = new CockroachSkillRepository();
    const tenantId = await repository.tenantIdForSlug(process.env.HIVE_TENANT_SLUG ?? "northstar");
    const [promoted, coverage] = await Promise.all([
      repository.listPromoted(tenantId),
      getPool().query<{ calls: string; tier1: string }>(
        `WITH latest_runs AS (
           SELECT DISTINCT ON (c.external_id) c.external_id, ar.tier
           FROM calls c JOIN agent_runs ar ON ar.call_id = c.id
           WHERE c.tenant_id = $1
           ORDER BY c.external_id, ar.started_at DESC
         )
         SELECT count(*) AS calls,
                count(*) FILTER (WHERE tier = 'tier_1_skill') AS tier1
         FROM latest_runs`,
        [tenantId],
      ),
    ]);
    initialPromotedCount = promoted.length;
    initialCallCount = Number(coverage.rows[0]?.calls ?? 0);
    initialTier1Count = Number(coverage.rows[0]?.tier1 ?? 0);
  }
  return <><Navigation active="demo" /><DemoShell initialPromotedCount={initialPromotedCount} initialCallCount={initialCallCount} initialTier1Count={initialTier1Count} /></>;
}
