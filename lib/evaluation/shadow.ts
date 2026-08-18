import { shadowCases } from "@/data/fixtures/world";
import type { Skill } from "@/lib/domain/types";
import { skillSchema } from "@/lib/domain/schemas";
import { executeSkill } from "@/lib/skills/executor";

export const PROMOTION_CONFIG = { minimumCases: 5, correctnessThreshold: 1, requiredSafetyRate: 1, maxPolicyViolations: 0 } as const;

export function evaluateCandidate(candidate: Skill) {
  const validated = skillSchema.parse(candidate);
  const cases = shadowCases.filter((value) => value.shadowFamily === candidate.family);
  const requiredPolicy = candidate.family === "partial_promo_refund" ? "promotion_allocation_policy_v1" : candidate.family === "bundle_mixed_tender_refund" ? "mixed_tender_refund_policy_v1" : undefined;
  const details = cases.map((shadowCase) => {
    const execution = executeSkill(validated, shadowCase);
    const response = execution.response.toLowerCase();
    const factsPresent = shadowCase.requiredFacts.every((fact) => fact.toLowerCase().split(/\s+/).every((token) => response.includes(token)));
    const policyCompatible = !requiredPolicy || validated.policyDependencies.includes(requiredPolicy);
    return { caseId: shadowCase.id, passed: execution.ok && factsPresent && policyCompatible, executionOk: execution.ok, factsPresent, policyCompatible };
  });
  const passed = details.filter((detail) => detail.passed).length;
  const total = cases.length;
  const correctness = total ? passed / total : 0;
  const policyViolations = details.filter((detail) => !detail.policyCompatible).length;
  return { passed, total, correctness, policyViolations, details, promoted: total >= PROMOTION_CONFIG.minimumCases && correctness >= PROMOTION_CONFIG.correctnessThreshold && policyViolations <= PROMOTION_CONFIG.maxPolicyViolations };
}
