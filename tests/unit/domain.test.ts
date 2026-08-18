import { describe, expect, it } from "vitest";
import { skillSchema } from "@/lib/domain/schemas";
import { PROMOTION_CONFIG, evaluateCandidate } from "@/lib/evaluation/shadow";
import { candidateFor, seedSkills } from "@/lib/skills/catalog";
import { retrievePromotedSkill } from "@/lib/skills/retrieval";
import { guidedCases } from "@/data/fixtures/world";
import { executeSkill } from "@/lib/skills/executor";
import type { SupportCase } from "@/lib/domain/types";

describe("bounded skill memory", () => {
  it("serializes and validates core skill state", () => expect(skillSchema.parse(seedSkills[0]).status).toBe("promoted"));
  it("never retrieves a candidate into Tier 1", () => expect(retrievePromotedSkill([candidateFor("partial_promo_refund", "x")], guidedCases[1])).toBeUndefined());
  it("retrieves the known shipping procedure", () => expect(retrievePromotedSkill(seedSkills, guidedCases[0])?.family).toBe("late_shipment"));
  it("applies the explicit promotion threshold", () => { const result = evaluateCandidate(candidateFor("partial_promo_refund", "x")); expect(result.total).toBeGreaterThanOrEqual(PROMOTION_CONFIG.minimumCases); expect(result.promoted).toBe(true); });
  it("rejects a candidate that fails behavioral shadow oracles", () => { const unsafe = { ...candidateFor("partial_promo_refund", "x"), responseTemplate: "Your request was received." }; const result = evaluateCandidate(unsafe); expect(result.promoted).toBe(false); expect(result.passed).toBe(0); });
  it("rejects a candidate with an incompatible policy dependency", () => { const unsafe = { ...candidateFor("partial_promo_refund", "x"), policyDependencies: ["wrong_policy"] }; const result = evaluateCandidate(unsafe); expect(result.promoted).toBe(false); expect(result.policyViolations).toBe(result.total); });
  it("executes a bounded calculation without a model", () => { const result = executeSkill(candidateFor("bundle_mixed_tender_refund", "x"), guidedCases[2]); expect(result.ok).toBe(true); expect(result.response).toContain("gift card"); expect(result.response).toContain("card"); });
  it("fails closed when required evidence is missing", () => { const missing: SupportCase = { ...guidedCases[0], orderId: "missing" }; expect(executeSkill(seedSkills[0], missing).ok).toBe(false); });
  it("declines ambiguous promoted matches", () => { const duplicate = { ...seedSkills[0], id: "duplicate" }; expect(retrievePromotedSkill([...seedSkills, duplicate], guidedCases[0])).toBeUndefined(); });
  it("respects applicability predicates", () => { const mixedTender = { ...candidateFor("bundle_mixed_tender_refund", "x"), status: "promoted" as const }; expect(retrievePromotedSkill([mixedTender], guidedCases[1])).toBeUndefined(); });
});
