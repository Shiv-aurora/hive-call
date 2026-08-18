import { guidedCases } from "@/data/fixtures/world";
import type { HiveMemory, ResolutionResult, Skill, SupportCase, TraceEvent } from "@/lib/domain/types";
import { humanResolutionSchema, skillSchema } from "@/lib/domain/schemas";
import { evaluateCandidate } from "@/lib/evaluation/shadow";
import { candidateFor, seedSkills } from "@/lib/skills/catalog";
import { executeSkill } from "@/lib/skills/executor";
import { retrievePromotedSkill } from "@/lib/skills/retrieval";

const event = (kind: TraceEvent["kind"], label: string, detail: string, status: TraceEvent["status"] = "success"): TraceEvent => ({ id: `${kind}_${label}_${Math.random().toString(36).slice(2, 7)}`, kind, label, detail, status });

export function createInitialMemory(): HiveMemory {
  return { skills: structuredClone(seedSkills), auditEvents: [], providerCallCount: 0, humanHandoffCount: 0 };
}

function promote(memory: HiveMemory, candidate: Skill) {
  const evaluation = evaluateCandidate(candidate);
  const validated = skillSchema.parse(candidate);
  const promoted: Skill = { ...validated, status: evaluation.promoted ? "promoted" : "rejected", shadowPassRate: evaluation.correctness, confidence: evaluation.promoted ? .96 : .4, promotedAt: evaluation.promoted ? "2026-08-17T12:04:00.000Z" : undefined };
  memory.skills = memory.skills.filter((skill) => skill.id !== promoted.id).map((skill) => skill.family === promoted.family && skill.status === "promoted" ? { ...skill, status: "deprecated" } : skill);
  memory.skills.push(promoted);
  memory.auditEvents.push(event("promotion", evaluation.promoted ? "Skill promoted" : "Skill rejected", `${evaluation.passed}/${evaluation.total} shadow cases passed; ${evaluation.policyViolations} policy violations`, evaluation.promoted ? "success" : "warning"));
  return { promoted, evaluation };
}

export function resolveCase(memory: HiveMemory, supportCase: SupportCase): ResolutionResult {
  const trace: TraceEvent[] = [event("memory", "Searching compiled memory", "Promoted skills only · tenant northstar · policy-compatible versions")];
  const skill = retrievePromotedSkill(memory.skills, supportCase);
  if (skill) {
    const executed = executeSkill(skill, supportCase);
    if (executed.ok) {
      skill.successCount += 1;
      skill.llmCallsAvoided += 1;
      trace.push(event("routing", "Tier 1 — promoted skill", `${skill.name} v${skill.version} matched conservatively`), ...executed.traces);
      return { caseId: supportCase.id, tier: "tier_1_skill", outcome: "resolved_verified", response: executed.response, skillId: skill.id, skillName: skill.name, reasoningModelCalls: 0, humanEscalation: false, toolsUsed: executed.tools, trace };
    }
  }
  trace.push(event("routing", "No promoted skill", "Applicability or confidence gate declined Tier 1", "neutral"));

  memory.providerCallCount += 1;
  trace.push(event("reasoning", "Tier 2 — reasoning agent", "Deterministic provider investigated within tool and call budgets"));
  if (supportCase.expectedClass === "partial_promo_refund") {
    const candidate = candidateFor("partial_promo_refund", supportCase.id);
    const { promoted, evaluation } = promote(memory, candidate);
    trace.push(event("tool", "Evidence gathered", "Order, refund, promotion allocation, and policy version checked"), event("compiler", "Candidate skill discovered", candidate.name), event("evaluation", `${evaluation.passed}/${evaluation.total} shadow cases passed`, "100% correctness · 0 policy violations"), event("promotion", "Skill promoted", "The procedure is now available to all Northstar support agents"));
    return { caseId: supportCase.id, tier: "tier_2_reasoning", outcome: "resolved_verified", response: "Your refund is correct. The SUMMER25 promotion was allocated proportionally, so the returned item's adjusted refundable value is $43 rather than its $60 list price.", reasoningModelCalls: 1, humanEscalation: false, toolsUsed: ["lookup_order", "lookup_refund", "lookup_promotion", "lookup_policy"], trace, candidate: promoted, evaluation };
  }

  memory.humanHandoffCount += 1;
  trace.push(event("human", "Tier 3 — human handoff", "Bundle allocation plus mixed tender exceeded the reasoning confidence boundary", "warning"));
  const human = humanResolutionSchema.parse({ caseId: supportCase.id, rationale: "Bundle allocation must be separated before restoring each original tender.", finalAnswer: "The refund was split back to the original gift card and payment card after the bundle discount was allocated.", toolsUsed: ["lookup_order", "lookup_refund", "lookup_policy"], policyId: "mixed_tender_refund_policy_v1" });
  const candidate = candidateFor("bundle_mixed_tender_refund", human.caseId);
  const { promoted, evaluation } = promote(memory, candidate);
  trace.push(event("human", "Human resolution captured", human.rationale), event("compiler", "Resolution compiled", candidate.name), event("evaluation", `${evaluation.passed}/${evaluation.total} shadow cases passed`, "Safety assertions 100% · prohibited actions 0"), event("promotion", "Skill promoted", "Human knowledge is now shared compiled memory"));
  return { caseId: supportCase.id, tier: "tier_3_human", outcome: "resolved_verified", response: "I checked the bundle allocation. Your $36 refund was split to the original payment methods: $15 to your gift card and $21 to your card.", reasoningModelCalls: 1, humanEscalation: true, toolsUsed: human.toolsUsed, trace, candidate: promoted, evaluation };
}

export function runGuidedDemo() {
  const memory = createInitialMemory();
  const results = guidedCases.map((supportCase) => resolveCase(memory, supportCase));
  return { memory, results };
}

export function degradeSkillForPolicyChange(memory: HiveMemory, family: string, policyId: string) {
  const skill = memory.skills.find((value) => value.family === family && value.status === "promoted");
  if (!skill) return false;
  skill.status = "degraded";
  memory.auditEvents.push(event("promotion", "Skill degraded", `${skill.name} removed from Tier 1 because ${policyId} changed`, "warning"));
  return true;
}
