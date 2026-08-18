import { orders } from "@/data/fixtures/world";
import type { Skill, SupportCase, TraceEvent } from "@/lib/domain/types";
import { splitMixedTenderRefund, toolRegistry } from "@/lib/tools/commerce";

export function executeSkill(skill: Skill, supportCase: SupportCase) {
  let order: ReturnType<typeof toolRegistry.lookup_order>;
  let shipment: ReturnType<typeof toolRegistry.lookup_shipment>;
  let refund: ReturnType<typeof toolRegistry.lookup_refund>;
  let promotion: ReturnType<typeof toolRegistry.lookup_promotion>;
  let policy: ReturnType<typeof toolRegistry.lookup_policy>;
  const traces: TraceEvent[] = [];
  const tools: string[] = [];
  for (const step of skill.steps) {
    if (step.kind === "tool") {
      tools.push(step.tool);
      if (step.tool === "lookup_order") order = toolRegistry.lookup_order(supportCase.orderId);
      if (step.tool === "lookup_shipment") shipment = toolRegistry.lookup_shipment(supportCase.orderId);
      if (step.tool === "lookup_refund") refund = toolRegistry.lookup_refund(supportCase.orderId);
      if (step.tool === "lookup_promotion") promotion = toolRegistry.lookup_promotion(order?.promotionId);
      if (step.tool === "lookup_policy") policy = toolRegistry.lookup_policy(skill.policyDependencies[0]);
      const found = step.tool === "lookup_order" ? order : step.tool === "lookup_shipment" ? shipment : step.tool === "lookup_refund" ? refund : step.tool === "lookup_promotion" ? promotion : policy;
      traces.push({ id: `tool_${traces.length}`, kind: "tool", label: step.tool.replaceAll("_", " "), detail: found ? "Typed read completed and evidence recorded" : "Required evidence was not found", status: found ? "success" : "warning" });
      if (!found) return { ok: false as const, response: "", tools, traces };
    }
    if (step.kind === "assert" && step.assertion === "record_exists" && !order) return { ok: false as const, response: "", tools, traces };
    if (step.kind === "assert" && step.assertion === "policy_compatible" && !skill.policyDependencies.every((id) => Boolean(toolRegistry.lookup_policy(id)))) return { ok: false as const, response: "", tools, traces };
  }
  let response = "";
  if (skill.family === "late_shipment" && shipment) response = skill.responseTemplate.replace("{shipmentStatus}", shipment.status.replace("_", " ")).replace("{eta}", shipment.eta);
  if (skill.family === "partial_promo_refund" && refund) response = skill.responseTemplate.replace("{refundAmount}", `$${refund.amount}`).replace("{itemPrice}", `$${refund.itemPrice}`);
  if (skill.family === "bundle_mixed_tender_refund" && refund) {
    const split = refund.tenderBreakdown ?? splitMixedTenderRefund(refund.amount);
    response = skill.responseTemplate.replace("{refundAmount}", `$${refund.amount}`).replace("{giftCardAmount}", `$${split.giftCard}`).replace("{cardAmount}", `$${split.card}`);
  }
  return { ok: Boolean(response), response, tools, traces, order: orders.find((value) => value.id === supportCase.orderId) };
}
