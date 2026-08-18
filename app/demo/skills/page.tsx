import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, GitBranch, ShieldCheck } from "lucide-react";
import type { Skill } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const repository = new CockroachSkillRepository();
  const tenantId = process.env.DATABASE_URL ? await repository.tenantIdForSlug(process.env.HIVE_TENANT_SLUG ?? "northstar") : undefined;
  let skills: Skill[] = [];
  let stats = new Map<string, { uses: number; failures: number; shadowPassRate?: number; sourceCases: string[] }>();
  if (tenantId) [skills, stats] = await Promise.all([repository.listLibrary(tenantId), repository.skillOperationalStats(tenantId)]);
  const promotedCount = skills.filter((skill) => skill.status === "promoted").length;
  return <><Navigation active="skills" /><main className="page-shell"><section className="demo-heading"><div><span className="eyebrow">Organizational memory</span><h1>Skill library</h1><p>Versioned, validated procedures learned from resolved support cases.</p></div><div className="summary-pill"><BookOpen size={16}/><b>{promotedCount}</b> promoted</div></section>
    <section className="skill-table card">
      {skills.length > 0 && <div className="table-head"><span>Skill</span><span>Status</span><span>Trust</span><span>Confidence</span><span>Reasoning avoided</span><span /></div>}
      {skills.length === 0 && <div className="empty-state"><BookOpen size={20}/><h2>No skills in memory yet</h2><p>{process.env.DATABASE_URL ? "This tenant has not learned any skills. Run the guided demo to watch a human resolution become a validated, reusable skill." : "CockroachDB memory is not connected in this environment, so the library cannot be read."}</p><Link className="primary-button" href="/demo?mode=guided">Run the guided demo<ArrowRight size={15}/></Link></div>}
      {skills.map((skill) => { const observed = stats.get(skill.id) ?? { uses: 0, failures: 0, shadowPassRate: undefined, sourceCases: [] }; const passRate = observed.shadowPassRate ?? skill.shadowPassRate; const sourceCases = observed.sourceCases.length ? observed.sourceCases : skill.sourceCaseIds; return <details className="skill-row" key={skill.id}><summary><div className="table-row"><div className="skill-name"><span className="skill-glyph"><GitBranch size={16}/></span><div><b>{skill.name}</b><small>{skill.family} · active v{skill.version}</small></div></div><div><span className={`status-pill ${skill.status}`}><i />{skill.status}</span></div><div><b>{skill.learningSource === "human" ? "Human-taught" : skill.learningSource === "tier_2" ? "Reasoning-taught" : "Seeded verified"}</b><small>{Math.round(passRate * 100)}% shadow pass</small></div><div><div className="confidence"><span><i style={{width: `${skill.confidence * 100}%`}} /></span><b>{Math.round(skill.confidence * 100)}%</b></div></div><div><b>{observed.uses}</b><small>full reasoning escalations</small></div><ChevronRight size={16} className="row-arrow"/></div></summary>
        <div className="skill-detail">
          <div><h4>Where this knowledge came from</h4><ul><li><Check size={11}/><span>{skill.description}</span></li>{sourceCases.map((caseId) => <li key={caseId}><Check size={11}/><span>Learned from verified case <code>{caseId}</code></span></li>)}{skill.promotedAt && <li><Check size={11}/><span>Promoted {new Date(skill.promotedAt).toLocaleString()}</span></li>}</ul></div>
          <div><h4>Why HIVE may use it</h4><ul><li><ShieldCheck size={11}/><span>{Math.round(passRate * 100)}% pass rate on independent shadow cases</span></li>{skill.policyDependencies.map((policy) => <li key={policy}><ShieldCheck size={11}/><span>Bound to active policy <code>{policy}</code></span></li>)}<li><ShieldCheck size={11}/><span>{skill.escalationConditions.length} fail-closed escalation condition{skill.escalationConditions.length === 1 ? "" : "s"}</span></li></ul></div>
          <div><h4>What happened when it ran</h4><ul><li><Check size={11}/><span>{observed.uses} verified Tier-1 execution{observed.uses === 1 ? "" : "s"}, {observed.failures} recorded demotion{observed.failures === 1 ? "" : "s"}</span></li><li><Check size={11}/><span>{observed.uses} full-reasoning escalation{observed.uses === 1 ? "" : "s"} avoided</span></li><li><Check size={11}/><span>Executes {skill.steps.length} bounded step{skill.steps.length === 1 ? "" : "s"}: {skill.steps.map((step) => step.kind === "tool" ? step.tool : step.kind === "compute" ? step.operation : step.assertion).join(" → ")}</span></li></ul></div>
        </div>
      </details>; })}
    </section><div className="memory-note"><CheckCircle2 size={17}/><p><b>Why does HIVE know this?</b> Every skill retains its source cases, policy dependencies, shadow evaluations, versions, and promotion audit event. Click a row for full lineage.</p></div>
  </main></>;
}
