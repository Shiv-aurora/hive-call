import { describe, expect, it } from "vitest";
import { createInitialMemory, degradeSkillForPolicyChange, resolveCase, runGuidedDemo } from "@/lib/agents/orchestrator";
import { guidedCases } from "@/data/fixtures/world";

describe("critical local learning loop", () => {
  it.each(Array.from({ length: 10 }, (_, i) => i + 1))("is deterministic from fixture reset — run %i", () => {
    const { memory, results } = runGuidedDemo();
    expect(results.map((result) => result.tier)).toEqual(["tier_1_skill", "tier_2_reasoning", "tier_3_human", "tier_1_skill"]);
    expect(results[3].reasoningModelCalls).toBe(0);
    expect(results[3].humanEscalation).toBe(false);
    expect(results[3].skillName).toBe("Explain bundle mixed-tender refund");
    expect(memory.skills.find((skill) => skill.family === "bundle_mixed_tender_refund")?.status).toBe("promoted");
    expect(memory.providerCallCount).toBe(2);
  });

  it("removes a policy-invalidated skill from Tier 1", () => {
    const memory = createInitialMemory();
    resolveCase(memory, guidedCases[2]);
    expect(degradeSkillForPolicyChange(memory, "bundle_mixed_tender_refund", "mixed_tender_refund_policy_v2")).toBe(true);
    const future = resolveCase(memory, guidedCases[3]);
    expect(future.tier).toBe("tier_3_human");
    expect(future.reasoningModelCalls).toBe(1);
  });
});
