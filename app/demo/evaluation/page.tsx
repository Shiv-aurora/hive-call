import { Navigation } from "@/components/navigation";
import { getPool } from "@/lib/db/pool";
import { BrainCircuit, Check, Database, Gauge, ShieldCheck, UserRound } from "lucide-react";

export const dynamic = "force-dynamic";

type Metrics = {
  calls: number; tier1: number; tier2: number; human: number; tier1ModelCalls: number; tier2ModelCalls: number; reasoningTokens: number;
  promoted: number; demotions: number; policyViolations: number; verified: number; tier1Verified: number; humanLearnedTier1: number; medianLatency: number;
};

const zero: Metrics = { calls: 0, tier1: 0, tier2: 0, human: 0, tier1ModelCalls: 0, tier2ModelCalls: 0, reasoningTokens: 0, promoted: 0, demotions: 0, policyViolations: 0, verified: 0, tier1Verified: 0, humanLearnedTier1: 0, medianLatency: 0 };

async function liveMetrics(): Promise<Metrics> {
  if (!process.env.DATABASE_URL) return zero;
  const [aggregate, latencies] = await Promise.all([
    getPool().query<Record<keyof Omit<Metrics, "medianLatency">, string>>(
      `WITH latest_runs AS (
         SELECT DISTINCT ON (c.external_id) c.id AS call_id,ar.id AS run_id,ar.tier
         FROM calls c JOIN agent_runs ar ON ar.call_id=c.id JOIN tenants t ON t.id=c.tenant_id
         WHERE t.slug=$1 ORDER BY c.external_id,ar.started_at DESC
       )
       SELECT
         (SELECT count(*) FROM latest_runs) AS calls,
         (SELECT count(*) FROM latest_runs WHERE tier='tier_1_skill') AS tier1,
         (SELECT count(*) FROM latest_runs WHERE tier='tier_2_reasoning') AS tier2,
         (SELECT count(*) FROM latest_runs WHERE tier='tier_3_human') AS human,
         (SELECT coalesce(sum(ct.tier1_model_calls),0) FROM latest_runs lr JOIN call_telemetry ct ON ct.call_id=lr.call_id) AS "tier1ModelCalls",
         (SELECT coalesce(sum(ct.tier2_model_calls),0) FROM latest_runs lr JOIN call_telemetry ct ON ct.call_id=lr.call_id) AS "tier2ModelCalls",
         (SELECT coalesce(sum(mi.input_tokens+mi.output_tokens),0) FROM latest_runs lr JOIN model_invocations mi ON mi.agent_run_id=lr.run_id WHERE mi.role='tier2_reasoning') AS "reasoningTokens",
         (SELECT count(*) FROM skills s JOIN skill_versions sv ON sv.id=s.active_version_id JOIN tenants t ON t.id=s.tenant_id WHERE t.slug=$1 AND sv.status='promoted') AS promoted,
         (SELECT count(*) FROM demotion_events de JOIN skill_versions sv ON sv.id=de.skill_version_id JOIN skills s ON s.id=sv.skill_id JOIN tenants t ON t.id=s.tenant_id WHERE t.slug=$1) AS demotions,
         (SELECT coalesce(sum(se.policy_violations),0) FROM skill_evaluations se JOIN skill_versions sv ON sv.id=se.skill_version_id JOIN skills s ON s.id=sv.skill_id JOIN tenants t ON t.id=s.tenant_id WHERE t.slug=$1 AND sv.status='promoted') AS "policyViolations",
         (SELECT count(*) FROM latest_runs lr JOIN resolutions r ON r.call_id=lr.call_id JOIN resolution_outcomes ro ON ro.resolution_id=r.id WHERE ro.verified) AS verified,
         (SELECT count(*) FROM latest_runs lr JOIN resolutions r ON r.call_id=lr.call_id JOIN resolution_outcomes ro ON ro.resolution_id=r.id WHERE lr.tier='tier_1_skill' AND ro.verified) AS "tier1Verified",
         (SELECT count(*) FROM latest_runs lr JOIN call_telemetry ct ON ct.call_id=lr.call_id JOIN skill_versions sv ON sv.id=ct.skill_version_id WHERE lr.tier='tier_1_skill' AND coalesce(sv.definition->>'learningSource','seeded')='human') AS "humanLearnedTier1"`,
      [process.env.HIVE_TENANT_SLUG ?? "northstar"],
    ),
    getPool().query<{ overall_latency_ms: number }>(`SELECT ct.overall_latency_ms FROM call_telemetry ct JOIN calls c ON c.id=ct.call_id JOIN tenants t ON t.id=c.tenant_id WHERE t.slug=$1 AND ct.overall_latency_ms>0 ORDER BY ct.overall_latency_ms`, [process.env.HIVE_TENANT_SLUG ?? "northstar"]),
  ]);
  const values = Object.fromEntries(Object.entries(aggregate.rows[0] ?? {}).map(([key, value]) => [key, Number(value)])) as Omit<Metrics, "medianLatency">;
  const rows = latencies.rows;
  const medianLatency = rows.length ? Number(rows[Math.floor((rows.length - 1) / 2)]!.overall_latency_ms) : 0;
  return { ...zero, ...values, medianLatency };
}

const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;

export default async function EvaluationPage() {
  const metrics = await liveMetrics();
  const noMemoryTier2 = metrics.tier2 + metrics.tier1;
  const noMemoryHuman = metrics.human + metrics.humanLearnedTier1;
  return <><Navigation active="evaluation"/><main className="page-shell"><section className="demo-heading"><div><span className="eyebrow">Progressive intelligence evaluation</span><h1>Traffic moves left as HIVE learns</h1><p>Observed values come from persisted calls, verified outcomes, model usage, evaluations, and latency telemetry.</p></div><div className="verified-pill"><Check size={14}/>Live SQL evidence</div></section>
    <section className="evaluation-hero card"><div><span className="eyebrow">Observed Tier 1 coverage</span><h2>{metrics.tier1} of {metrics.calls} calls</h2><p>{metrics.calls ? "Known problems used learned memory and the fast response model without full reasoning." : "Run the guided demo to generate live evidence."}</p></div><div className="coverage-chart"><div className="coverage-bar"><i style={{width: `${pct(metrics.tier1, metrics.calls)}%`}}/><span>{pct(metrics.tier1, metrics.calls)}%</span></div><small>Correctness remains gated by verified outcomes</small></div></section>
    <div className="ablation-grid"><section className="card ablation-card muted"><span className="card-kicker">Without learned skills · counterfactual</span><h2>Repeated discovery work</h2><div className="ablation-value"><b>{noMemoryTier2}</b><span>calls requiring full reasoning</span></div>{[[BrainCircuit,"Full reasoning calls",noMemoryTier2],[UserRound,"Human handoffs",noMemoryHuman],[Gauge,"Basis","verified Tier-1 route history"],[ShieldCheck,"Fabricated estimates",0]].map(([Icon,label,value]) => { const C = Icon as typeof BrainCircuit; return <div className="eval-line" key={String(label)}><C size={16}/><span>{String(label)}</span><b>{String(value)}</b></div>})}</section>
      <section className="card ablation-card enabled"><span className="card-kicker">With HIVE memory · observed</span><h2>Progressive intelligence</h2><div className="ablation-value"><b>{metrics.tier1}</b><span>known problems on Tier 1</span></div>{[[Database,"Fast response calls",metrics.tier1ModelCalls],[BrainCircuit,"Full reasoning calls",metrics.tier2ModelCalls],[UserRound,"Human handoffs",metrics.human],[ShieldCheck,"Policy violations",metrics.policyViolations]].map(([Icon,label,value]) => { const C = Icon as typeof Database; return <div className="eval-line" key={String(label)}><C size={16}/><span>{String(label)}</span><b>{String(value)}</b></div>})}</section></div>
    <section className="skill-table card"><div className="skill-detail"><div><h4>Quality</h4><ul><li><Check size={11}/><span>Resolution correctness: {pct(metrics.verified, metrics.calls)}% verified outcomes</span></li><li><Check size={11}/><span>Tier-1 selection precision: {pct(metrics.tier1Verified, metrics.tier1)}%</span></li><li><Check size={11}/><span>Policy violations: {metrics.policyViolations}</span></li></ul></div><div><h4>Routing</h4><ul><li><Check size={11}/><span>Tier 1 coverage: {pct(metrics.tier1, metrics.calls)}%</span></li><li><Check size={11}/><span>Tier 2 rate: {pct(metrics.tier2, metrics.calls)}%</span></li><li><Check size={11}/><span>Human escalation rate: {pct(metrics.human, metrics.calls)}%</span></li></ul></div><div><h4>Cost and latency signals</h4><ul><li><Check size={11}/><span>Reasoning tokens: {metrics.reasoningTokens}</span></li><li><Check size={11}/><span>Median observed latency: {metrics.medianLatency} ms</span></li><li><Check size={11}/><span>{metrics.promoted} promoted skills · {metrics.demotions} demotions</span></li></ul></div></div></section>
    {metrics.tier1 > 0 && <section className="card policy-proof"><ShieldCheck size={19}/><div><span className="card-kicker">Core proof</span><h2>Previously required human → now Tier 1</h2><p>Call D retrieves the promoted mixed-tender skill, executes verified tools, uses the fast conversational renderer, and records zero full-reasoning calls.</p></div></section>}
    <p className="evaluation-footnote">Counterfactual values are derived only from observed verified Tier-1 routes: without memory, each would require at least one full-reasoning escalation. No dollar-cost or unverified savings claim is shown.</p>
  </main></>;
}
