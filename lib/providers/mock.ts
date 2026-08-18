import { candidateFor } from "@/lib/skills/catalog";
import type { ReasoningProvider, ResolutionInput, SkillCompileInput } from "@/lib/providers/contracts";

export class MockReasoningProvider implements ReasoningProvider {
  readonly name = "mock" as const;
  async runResolution(input: ResolutionInput) {
    const problem = `${input.supportCase.issue} ${input.supportCase.intent}`.toLowerCase();
    if (problem.includes("promotion") || problem.includes("promotional")) return { status: "resolved" as const, resolutionSummary: "Promotion allocated proportionally", customerResponse: "The promotion reduced the refundable item value to $43.", evidenceRefs: [input.supportCase.orderId, "promotion_allocation_policy_v1"], toolsUsed: ["lookup_order", "lookup_refund", "lookup_promotion", "lookup_policy"], confidence: .97, escalate: false, candidateLearningValue: "high" as const };
    return { status: "escalated" as const, resolutionSummary: "Mixed-tender bundle allocation needs human review", customerResponse: "I’m transferring this with the evidence already gathered.", evidenceRefs: [input.supportCase.orderId], toolsUsed: ["lookup_order", "lookup_refund", "lookup_policy"], confidence: .52, escalate: true, escalationReason: "Policy boundary", candidateLearningValue: "high" as const };
  }
  async compileSkill(input: SkillCompileInput) {
    return candidateFor(input.policyIds.includes("mixed_tender_refund_policy_v1") ? "bundle_mixed_tender_refund" : "partial_promo_refund", input.sourceCaseId);
  }
}
