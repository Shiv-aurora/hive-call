export type SkillStatus = "candidate" | "shadow" | "promoted" | "degraded" | "deprecated" | "rejected";
export type ResolutionTier = "tier_1_skill" | "tier_2_reasoning" | "tier_3_human";
export type OutcomeType = "resolved_verified" | "resolved_customer_confirmed" | "resolved_tool_confirmed" | "escalated" | "abandoned" | "reopened" | "policy_exception" | "failed";

export interface Customer { id: string; tenantId: string; name: string; email: string; }
export interface Order { id: string; customerId: string; total: number; promotionId?: string; bundle?: boolean; tender: "card" | "gift_card" | "mixed"; }
export interface Shipment { id: string; orderId: string; status: "in_transit" | "delayed" | "delivered"; eta: string; carrier: string; }
export interface Refund { id: string; orderId: string; amount: number; itemPrice: number; status: "pending" | "completed"; tenderBreakdown?: { card: number; giftCard: number }; }
export interface Promotion { id: string; code: string; type: "fixed" | "percent"; value: number; allocation: "proportional"; }
export interface PolicyVersion { id: string; family: string; version: number; active: boolean; rules: string[]; }

export type Predicate = {
  field: "intent" | "hasPromotion" | "isBundle" | "tender" | "shipmentStatus";
  operator: "equals" | "contains";
  value: string | boolean;
};

export type SkillStep =
  | { kind: "tool"; tool: "lookup_order" | "lookup_shipment" | "lookup_refund" | "lookup_promotion" | "lookup_policy" }
  | { kind: "compute"; operation: "promotion_refund" | "mixed_tender_split" }
  | { kind: "assert"; assertion: "record_exists" | "policy_compatible" | "no_fraud_flag" };

export interface Skill {
  id: string;
  tenantId: string;
  family: string;
  name: string;
  description: string;
  version: number;
  status: SkillStatus;
  intents: string[];
  applicability: Predicate[];
  requiredContext: string[];
  steps: SkillStep[];
  responseTemplate: string;
  escalationConditions: string[];
  policyDependencies: string[];
  sourceCaseIds: string[];
  confidence: number;
  shadowPassRate: number;
  successCount: number;
  failureCount: number;
  llmCallsAvoided: number;
  createdAt: string;
  promotedAt?: string;
  learningSource?: "seeded" | "tier_2" | "human";
}

export interface SupportCase {
  id: string;
  customerId: string;
  orderId: string;
  issue: string;
  intent: string;
  expectedClass: "late_shipment" | "partial_promo_refund" | "bundle_mixed_tender_refund";
  expectedTier: ResolutionTier;
  requiredFacts: string[];
  shadowFamily?: string;
}

export type RuntimeSupportCase = Pick<SupportCase, "id" | "customerId" | "orderId" | "issue" | "intent">;

export function toRuntimeSupportCase(supportCase: SupportCase): RuntimeSupportCase {
  return { id: supportCase.id, customerId: supportCase.customerId, orderId: supportCase.orderId, issue: supportCase.issue, intent: supportCase.intent };
}

export interface TraceEvent {
  id: string;
  kind: "memory" | "context" | "routing" | "tool" | "conversation" | "reasoning" | "human" | "compiler" | "evaluation" | "promotion";
  label: string;
  detail: string;
  status: "success" | "neutral" | "warning";
}

export interface ModelUsage {
  role: "tier1_conversation" | "tier2_reasoning" | "skill_compiler";
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  requestId?: string;
}

export interface ResolutionTelemetry {
  tier1ModelCalls: number;
  tier2ModelCalls: number;
  skillCompilerCalls: number;
  modelUsage: ModelUsage[];
  embeddingRequests: number;
  pollyCharacters: number;
  contextRetrievalCount: number;
  overallLatencyMs: number;
  tier1LatencyMs: number;
  tier2LatencyMs: number;
  reasoningEscalationAvoided: boolean;
}

export interface ResolutionResult {
  caseId: string;
  tier: ResolutionTier;
  outcome: OutcomeType;
  response: string;
  skillId?: string;
  skillName?: string;
  reasoningModelCalls: number;
  humanEscalation: boolean;
  toolsUsed: string[];
  trace: TraceEvent[];
  candidate?: Skill;
  evaluation?: { passed: number; total: number; correctness: number; policyViolations: number; promoted: boolean };
  telemetry?: ResolutionTelemetry;
}

export interface HiveMemory {
  skills: Skill[];
  auditEvents: TraceEvent[];
  providerCallCount: number;
  humanHandoffCount: number;
}
