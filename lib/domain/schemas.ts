import { z } from "zod";

export const skillSchema = z.object({
  id: z.string().min(1), tenantId: z.string().min(1), family: z.string().min(1), name: z.string().min(1),
  description: z.string().min(1), version: z.number().int().positive(),
  status: z.enum(["candidate", "shadow", "promoted", "degraded", "deprecated", "rejected"]),
  intents: z.array(z.string()).min(1),
  applicability: z.array(z.object({ field: z.enum(["intent", "hasPromotion", "isBundle", "tender", "shipmentStatus"]), operator: z.enum(["equals", "contains"]), value: z.union([z.string(), z.boolean()]) })),
  requiredContext: z.array(z.string()),
  steps: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("tool"), tool: z.enum(["lookup_order", "lookup_shipment", "lookup_refund", "lookup_promotion", "lookup_policy"]) }),
    z.object({ kind: z.literal("compute"), operation: z.enum(["promotion_refund", "mixed_tender_split"]) }),
    z.object({ kind: z.literal("assert"), assertion: z.enum(["record_exists", "policy_compatible", "no_fraud_flag"]) }),
  ])).min(1),
  responseTemplate: z.string().min(1), escalationConditions: z.array(z.string()).min(1), policyDependencies: z.array(z.string()).min(1),
  sourceCaseIds: z.array(z.string()).min(1), confidence: z.number().min(0).max(1), shadowPassRate: z.number().min(0).max(1),
  successCount: z.number().int().nonnegative(), failureCount: z.number().int().nonnegative(), llmCallsAvoided: z.number().int().nonnegative(),
  createdAt: z.string(), promotedAt: z.string().optional(),
  learningSource: z.enum(["seeded", "tier_2", "human"]).default("seeded"),
});

export const humanResolutionSchema = z.object({ caseId: z.string(), rationale: z.string().min(12), finalAnswer: z.string().min(20), toolsUsed: z.array(z.string()).min(2), policyId: z.string() });
