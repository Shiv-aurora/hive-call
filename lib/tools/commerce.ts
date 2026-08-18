import { orders, policies, promotions, refunds, shipments } from "@/data/fixtures/world";

export const toolRegistry = {
  lookup_order: (orderId: string) => orders.find((value) => value.id === orderId),
  lookup_shipment: (orderId: string) => shipments.find((value) => value.orderId === orderId),
  lookup_refund: (orderId: string) => refunds.find((value) => value.orderId === orderId),
  lookup_promotion: (promotionId?: string) => promotions.find((value) => value.id === promotionId),
  lookup_policy: (policyId: string) => policies.find((value) => value.id === policyId && value.active),
};

export type ToolName = keyof typeof toolRegistry;

export function calculatePromotionalRefund(itemPrice: number, promotionRate: number) {
  return Math.round(itemPrice * (1 - promotionRate) * 100) / 100;
}

export function splitMixedTenderRefund(total: number, giftCardShare = 0.42) {
  const giftCard = Math.round(total * giftCardShare * 100) / 100;
  return { giftCard, card: Math.round((total - giftCard) * 100) / 100 };
}
