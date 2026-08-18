import { z } from "zod";
import type { RuntimeSupportCase, Skill } from "@/lib/domain/types";
import type { CockroachCommerceRepository } from "@/lib/db/commerce-repository";
import type { PersistedShadowCase } from "@/lib/db/skill-repository";
import { executePersistedSkill } from "@/lib/skills/persistent-executor";

const inputSchema = z.object({ id: z.string(), customerId: z.string(), orderId: z.string(), issue: z.string(), intent: z.string() });
const oracleSchema = z.object({
  expectedFamily: z.string(),
  mustContain: z.array(z.string()),
  expectedRefundAmount: z.number().nullable(),
  expectedTenderBreakdown: z.object({ card: z.number(), giftCard: z.number() }).nullable(),
  requiredTools: z.array(z.string()),
});

export async function evaluatePersistedCandidate(candidate: Skill, cases: PersistedShadowCase[], reader: CockroachCommerceRepository) {
  const details = [];
  for (const testCase of cases) {
    const supportCase: RuntimeSupportCase = inputSchema.parse(testCase.input);
    const oracle = oracleSchema.parse(testCase.oracle);
    const execution = await executePersistedSkill(candidate, supportCase, reader);
    const normalized = execution.response.toLowerCase();
    const factsMatch = oracle.mustContain.every((fact) => fact.toLowerCase().split(/\s+/).every((token) => normalized.includes(token)));
    const amountMatches = oracle.expectedRefundAmount === null || normalized.includes(`$${oracle.expectedRefundAmount}`);
    const splitMatches = oracle.expectedTenderBreakdown === null || (normalized.includes(`$${oracle.expectedTenderBreakdown.card}`) && normalized.includes(`$${oracle.expectedTenderBreakdown.giftCard}`));
    const toolsMatch = oracle.requiredTools.every((tool) => execution.tools.includes(tool));
    const familyMatches = candidate.family === oracle.expectedFamily;
    const safetyPassed = amountMatches && splitMatches && toolsMatch;
    details.push({ caseId: testCase.externalId, passed: execution.ok && factsMatch && familyMatches && safetyPassed, executionOk: execution.ok, factsMatch, familyMatches, amountMatches, splitMatches, toolsMatch, safetyPassed });
  }
  const passed = details.filter((detail) => detail.passed).length;
  const safetyPassed = details.filter((detail) => detail.safetyPassed).length;
  const total = details.length;
  const correctness = total ? passed / total : 0;
  const safetyRate = total ? safetyPassed / total : 0;
  const policyViolations = details.filter((detail) => !detail.toolsMatch).length;
  return { passed, total, correctness, safetyRate, policyViolations, details, promoted: total >= 5 && correctness === 1 && safetyRate === 1 && policyViolations === 0 };
}
