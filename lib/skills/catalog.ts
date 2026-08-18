import { TENANT_ID } from "@/data/fixtures/world";
import type { Skill } from "@/lib/domain/types";

const createdAt = "2026-08-17T12:00:00.000Z";

export const lateShipmentSkill: Skill = {
  id: "skill_late_shipment_v2", tenantId: TENANT_ID, family: "late_shipment", name: "Late shipment status", description: "Explain current carrier state and updated delivery estimate.", version: 2, status: "promoted", intents: ["late shipment", "where is order", "tracking update", "delayed order"],
  applicability: [{ field: "intent", operator: "contains", value: "shipment" }], requiredContext: ["orderId"],
  steps: [{ kind: "tool", tool: "lookup_order" }, { kind: "tool", tool: "lookup_shipment" }, { kind: "assert", assertion: "record_exists" }, { kind: "tool", tool: "lookup_policy" }],
  responseTemplate: "Your order is {shipmentStatus}. The latest carrier estimate is {eta}.", escalationConditions: ["shipment_record_missing", "carrier_exception"], policyDependencies: ["shipping_policy_v1"], sourceCaseIds: ["seed_case_shipping_1", "seed_case_shipping_2"], confidence: 0.98, shadowPassRate: 1, successCount: 128, failureCount: 1, llmCallsAvoided: 128, createdAt, promotedAt: createdAt, learningSource: "seeded",
};

export const seedSkills: Skill[] = [
  lateShipmentSkill,
];

export function candidateFor(family: "partial_promo_refund" | "bundle_mixed_tender_refund", sourceCaseId: string, learningSource: "tier_2" | "human" = "tier_2"): Skill {
  const mixed = family === "bundle_mixed_tender_refund";
  return {
    id: mixed ? "skill_mixed_tender_v1" : "skill_promo_refund_v1", tenantId: TENANT_ID, family,
    name: mixed ? "Explain bundle mixed-tender refund" : "Explain partial promotional refund",
    description: mixed ? "Explain how a partial bundle refund returns to gift card and card." : "Explain proportional promotion allocation on a partial refund.",
    version: 1, status: "candidate", intents: mixed ? ["bundle mixed tender refund", "mixed tender bundle return", "store credit visa refund"] : ["partial promotional refund", "promotion refund explanation"],
    applicability: mixed ? [{ field: "isBundle", operator: "equals", value: true }, { field: "tender", operator: "equals", value: "mixed" }] : [{ field: "hasPromotion", operator: "equals", value: true }],
    requiredContext: ["orderId", "refundId"],
    steps: mixed ? [{ kind: "tool", tool: "lookup_order" }, { kind: "tool", tool: "lookup_refund" }, { kind: "assert", assertion: "record_exists" }, { kind: "tool", tool: "lookup_policy" }, { kind: "compute", operation: "mixed_tender_split" }] : [{ kind: "tool", tool: "lookup_order" }, { kind: "tool", tool: "lookup_refund" }, { kind: "tool", tool: "lookup_promotion" }, { kind: "tool", tool: "lookup_policy" }, { kind: "assert", assertion: "policy_compatible" }, { kind: "compute", operation: "promotion_refund" }],
    responseTemplate: mixed ? "Your refund was returned to the original payment methods: {giftCardAmount} to the gift card and {cardAmount} to the card." : "The promotion was allocated across the order, so this item's adjusted refundable value is {refundAmount}.",
    escalationConditions: mixed ? ["tender_breakdown_missing", "bundle_allocation_mismatch", "fraud_flag"] : ["refund_record_missing", "policy_version_mismatch", "fraud_flag"],
    policyDependencies: [mixed ? "mixed_tender_refund_policy_v1" : "promotion_allocation_policy_v1"], sourceCaseIds: [sourceCaseId], confidence: .78, shadowPassRate: 0, successCount: 0, failureCount: 0, llmCallsAvoided: 0, createdAt, learningSource,
  };
}
