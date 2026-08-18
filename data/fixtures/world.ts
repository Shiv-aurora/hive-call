import type { Customer, Order, PolicyVersion, Promotion, Refund, Shipment, SupportCase } from "@/lib/domain/types";

export const TENANT_ID = "northstar";
export const customers: Customer[] = Array.from({ length: 24 }, (_, i) => ({ id: `cus_${String(i + 1).padStart(2, "0")}`, tenantId: TENANT_ID, name: ["Maya Chen", "Noah Williams", "Sofia Patel", "Eli Brooks", "Ava Thompson", "Liam Davis"][i % 6] + (i > 5 ? ` ${i + 1}` : ""), email: `customer${i + 1}@example.test` }));
export const promotions: Promotion[] = [{ id: "promo_summer", code: "SUMMER25", type: "percent", value: 0.25, allocation: "proportional" }, { id: "promo_bundle", code: "BUNDLE20", type: "fixed", value: 20, allocation: "proportional" }];
export const orders: Order[] = Array.from({ length: 48 }, (_, i) => ({ id: `ord_${String(i + 1).padStart(2, "0")}`, customerId: customers[i % customers.length].id, total: i % 5 === 0 ? 80 : 120 + (i % 4) * 20, promotionId: i % 3 === 0 ? "promo_summer" : i % 5 === 0 ? "promo_bundle" : undefined, bundle: i % 5 === 0, tender: i % 5 === 0 ? "mixed" : "card" }));
export const shipments: Shipment[] = orders.map((order, i) => ({ id: `shp_${i + 1}`, orderId: order.id, status: i % 4 === 0 ? "delayed" : i % 4 === 1 ? "delivered" : "in_transit", eta: "Aug 19, 2026", carrier: "Northstar Parcel" }));
export const refunds: Refund[] = orders.filter((_, i) => i % 3 === 0 || i % 5 === 0).map((order, i) => ({ id: `ref_${i + 1}`, orderId: order.id, amount: order.bundle ? 36 : 43, itemPrice: order.bundle ? 60 : 60, status: "completed", tenderBreakdown: order.tender === "mixed" ? { card: 21, giftCard: 15 } : undefined }));
export const policies: PolicyVersion[] = [
  { id: "shipping_policy_v1", family: "shipping", version: 1, active: true, rules: ["Report carrier status and latest ETA", "Escalate when tracking is missing"] },
  { id: "promotion_allocation_policy_v1", family: "promotion_allocation", version: 1, active: true, rules: ["Allocate promotion proportionally across returned items", "Never refund more than adjusted item value"] },
  { id: "mixed_tender_refund_policy_v1", family: "mixed_tender", version: 1, active: true, rules: ["Return funds to original tender", "Gift-card portion is restored before card settlement"] },
  { id: "subscription_cancel_policy_v1", family: "subscription", version: 1, active: true, rules: ["Require identity confirmation"] },
  { id: "address_change_policy_v1", family: "address_change", version: 1, active: true, rules: ["Only change before carrier acceptance"] },
];

export const companyContext = [
  { id: "ctx_shipping_status", kind: "procedure", title: "Shipment status procedure", content: "Read the live carrier state and latest ETA. Do not promise a delivery date that is absent from tracking.", policyId: "shipping_policy_v1" },
  { id: "ctx_promotion_allocation", kind: "promotion_policy", title: "Proportional promotion allocation", content: "A promotion is allocated proportionally across eligible order items. A returned item's refundable value can be lower than its list price.", policyId: "promotion_allocation_policy_v1" },
  { id: "ctx_mixed_tender", kind: "refund_policy", title: "Mixed-tender refunds", content: "Refunds return to original payment methods. The gift-card portion is restored before card settlement, and partial bundle allocation requires verified tender evidence.", policyId: "mixed_tender_refund_policy_v1" },
  { id: "ctx_bundle_returns", kind: "procedure", title: "Partial bundle return review", content: "Partial bundle returns require order, refund, bundle allocation, and original-tender evidence. Escalate when the split does not reconcile to the refund total.", policyId: "mixed_tender_refund_policy_v1" },
  { id: "ctx_northstar_catalog", kind: "product", title: "Northstar order products", content: "Northstar Commerce sells individual items and promotional bundles. Bundle discounts and item-level returns are represented in the order snapshot.", policyId: null },
] as const;

export const guidedCases: SupportCase[] = [
  { id: "call_a", customerId: "cus_01", orderId: "ord_01", issue: "Where is my order? It was supposed to arrive yesterday.", intent: "late shipment tracking", expectedClass: "late_shipment", expectedTier: "tier_1_skill", requiredFacts: ["delayed", "Aug 19"] },
  { id: "call_b", customerId: "cus_04", orderId: "ord_04", issue: "Why did I only get $43 back? The item I returned cost $60.", intent: "partial promotional refund", expectedClass: "partial_promo_refund", expectedTier: "tier_2_reasoning", requiredFacts: ["promotion", "$43"] },
  { id: "call_c", customerId: "cus_11", orderId: "ord_11", issue: "I returned part of a bundle, paid with a gift card and card, and now the refund looks wrong.", intent: "bundle mixed tender refund", expectedClass: "bundle_mixed_tender_refund", expectedTier: "tier_3_human", requiredFacts: ["gift card", "card", "original tender"] },
  { id: "call_d", customerId: "cus_21", orderId: "ord_21", issue: "My bundle return was split between store credit and my Visa. Can you explain the refund?", intent: "mixed tender bundle return", expectedClass: "bundle_mixed_tender_refund", expectedTier: "tier_1_skill", requiredFacts: ["gift card", "card"] },
];

const partialRefundShadowOrderIndexes = [3, 6, 9, 12, 18, 21];
export const shadowCases: SupportCase[] = Array.from({ length: 12 }, (_, i) => ({ id: `shadow_${i + 1}`, customerId: customers[(i + 5) % customers.length].id, orderId: i < 6 ? orders[partialRefundShadowOrderIndexes[i]!].id : orders[(i - 6) * 5].id, issue: i < 6 ? `Explain partial promotion refund variation ${i + 1}` : `Explain bundle mixed tender refund variation ${i - 5}`, intent: i < 6 ? "partial promotional refund" : "bundle mixed tender refund", expectedClass: i < 6 ? "partial_promo_refund" : "bundle_mixed_tender_refund", expectedTier: i < 6 ? "tier_2_reasoning" : "tier_3_human", requiredFacts: i < 6 ? ["promotion", "adjusted value"] : ["gift card", "card"], shadowFamily: i < 6 ? "partial_promo_refund" : "bundle_mixed_tender_refund" }));

export const heldOutCases: SupportCase[] = Array.from({ length: 40 }, (_, i) => ({ id: `eval_${i + 1}`, customerId: customers[i % customers.length].id, orderId: orders[i % orders.length].id, issue: i < 17 ? `Tracking update for delayed order ${i + 1}` : i < 29 ? `Promotional refund explanation ${i + 1}` : `Novel policy exception ${i + 1}`, intent: i < 17 ? "late shipment tracking" : i < 29 ? "partial promotional refund" : "policy exception", expectedClass: i < 17 ? "late_shipment" : i < 29 ? "partial_promo_refund" : "bundle_mixed_tender_refund", expectedTier: i < 17 ? "tier_1_skill" : "tier_2_reasoning", requiredFacts: [] }));
