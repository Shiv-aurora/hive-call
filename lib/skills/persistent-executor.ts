import type { Order, PolicyVersion, Promotion, Refund, RuntimeSupportCase, Shipment, Skill, TraceEvent } from "@/lib/domain/types";

export interface SkillToolReader {
  lookupOrder(orderId: string): Promise<Order | undefined>;
  lookupShipment(orderId: string): Promise<Shipment | undefined>;
  lookupRefund(orderId: string): Promise<Refund | undefined>;
  lookupPromotion(promotionId?: string): Promise<Promotion | undefined>;
  lookupPolicy(policyId: string): Promise<PolicyVersion | undefined>;
}

export interface ToolEvidence { tool: string; input: unknown; output: unknown; latencyMs: number; success: boolean }

export async function executePersistedSkill(skill: Skill, supportCase: RuntimeSupportCase, reader: SkillToolReader) {
  let order: Order | undefined;
  let shipment: Shipment | undefined;
  let refund: Refund | undefined;
  let promotion: Promotion | undefined;
  const policies = new Map<string, PolicyVersion>();
  const traces: TraceEvent[] = [];
  const evidence: ToolEvidence[] = [];

  async function read(tool: string, input: unknown, operation: () => Promise<unknown>) {
    const started = Date.now();
    try {
      const output = await operation();
      evidence.push({ tool, input, output: output ?? null, latencyMs: Date.now() - started, success: Boolean(output) });
      traces.push({ id: `tool_${evidence.length}`, kind: "tool", label: tool.replaceAll("_", " "), detail: output ? "CockroachDB evidence read and recorded" : "Required evidence was not found", status: output ? "success" : "warning" });
      return output;
    } catch (error) {
      evidence.push({ tool, input, output: { error: error instanceof Error ? error.message : "read_failed" }, latencyMs: Date.now() - started, success: false });
      throw error;
    }
  }

  for (const step of skill.steps) {
    if (step.kind === "tool") {
      if (step.tool === "lookup_order") order = await read(step.tool, { orderId: supportCase.orderId }, () => reader.lookupOrder(supportCase.orderId)) as Order | undefined;
      if (step.tool === "lookup_shipment") shipment = await read(step.tool, { orderId: supportCase.orderId }, () => reader.lookupShipment(supportCase.orderId)) as Shipment | undefined;
      if (step.tool === "lookup_refund") refund = await read(step.tool, { orderId: supportCase.orderId }, () => reader.lookupRefund(supportCase.orderId)) as Refund | undefined;
      if (step.tool === "lookup_promotion") promotion = await read(step.tool, { promotionId: order?.promotionId ?? null }, () => reader.lookupPromotion(order?.promotionId)) as Promotion | undefined;
      if (step.tool === "lookup_policy") {
        for (const policyId of skill.policyDependencies) {
          const policy = await read(step.tool, { policyId }, () => reader.lookupPolicy(policyId)) as PolicyVersion | undefined;
          if (policy) policies.set(policyId, policy);
        }
      }
      if (evidence.at(-1)?.success === false) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };
    }
    if (step.kind === "assert" && step.assertion === "record_exists" && !order) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };
    if (step.kind === "assert" && step.assertion === "policy_compatible" && skill.policyDependencies.some((id) => !policies.has(id))) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };
    if (step.kind === "assert" && step.assertion === "no_fraud_flag" && Boolean((order as Order & { fraudFlag?: boolean } | undefined)?.fraudFlag)) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };
  }

  if (skill.escalationConditions.includes("tender_breakdown_missing") && !refund?.tenderBreakdown) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };
  if (skill.escalationConditions.includes("bundle_allocation_mismatch") && refund?.tenderBreakdown && Math.abs(refund.tenderBreakdown.card + refund.tenderBreakdown.giftCard - refund.amount) > 0.001) return { ok: false as const, response: "", tools: evidence.map((item) => item.tool), traces, evidence };

  let response = "";
  let verifiedFacts: Record<string, string | number | boolean> = { skillFamily: skill.family };
  if (skill.family === "late_shipment" && shipment) {
    response = skill.responseTemplate.replace("{shipmentStatus}", shipment.status.replace("_", " ")).replace("{eta}", shipment.eta);
    verifiedFacts = { ...verifiedFacts, shipmentStatus: shipment.status, eta: shipment.eta, carrier: shipment.carrier };
  }
  if (skill.family === "partial_promo_refund" && refund && promotion) {
    response = skill.responseTemplate.replace("{refundAmount}", `$${refund.amount}`).replace("{itemPrice}", `$${refund.itemPrice}`);
    verifiedFacts = { ...verifiedFacts, refundAmount: refund.amount, originalItemPrice: refund.itemPrice, promotionCode: promotion.code, allocation: promotion.allocation };
  }
  if (skill.family === "bundle_mixed_tender_refund" && refund?.tenderBreakdown) {
    response = skill.responseTemplate.replace("{refundAmount}", `$${refund.amount}`).replace("{giftCardAmount}", `$${refund.tenderBreakdown.giftCard}`).replace("{cardAmount}", `$${refund.tenderBreakdown.card}`);
    verifiedFacts = { ...verifiedFacts, refundAmount: refund.amount, giftCardAmount: refund.tenderBreakdown.giftCard, cardAmount: refund.tenderBreakdown.card, tender: "mixed" };
  }
  if (!response) return { ok: false as const, response, tools: evidence.map((item) => item.tool), traces, evidence };
  return { ok: true as const, response, verifiedFacts, tools: evidence.map((item) => item.tool), traces, evidence };
}
