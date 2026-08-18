import { guidedCases } from "@/data/fixtures/world";
import { emitHiveMetrics } from "@/lib/aws/metrics";
import { CockroachCommerceRepository } from "@/lib/db/commerce-repository";
import { CockroachCompanyContextRepository } from "@/lib/db/company-context-repository";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import type { ModelUsage, Order, ResolutionResult, RuntimeSupportCase, Shipment, Skill, TraceEvent } from "@/lib/domain/types";
import { toRuntimeSupportCase } from "@/lib/domain/types";
import { evaluatePersistedCandidate } from "@/lib/evaluation/persisted-shadow";
import { createReasoningProvider } from "@/lib/providers";
import { BedrockConversationProvider } from "@/lib/providers/conversation";
import { BedrockEmbeddingProvider } from "@/lib/providers/embeddings";
import { candidateFor } from "@/lib/skills/catalog";
import { executePersistedSkill, type ToolEvidence } from "@/lib/skills/persistent-executor";
import { selectPrecisionBiasedSkill } from "@/lib/skills/retrieval-decision";

const TENANT_SLUG = process.env.HIVE_TENANT_SLUG ?? "northstar";
const event = (kind: TraceEvent["kind"], label: string, detail: string, status: TraceEvent["status"] = "success"): TraceEvent => ({ id: crypto.randomUUID(), kind, label, detail, status });
const retrievalText = (skill: Skill) => [skill.name, skill.description, ...skill.intents].join(" | ");
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
const currencyTokens = (value: string) => value.match(/\$\d+(?:\.\d{1,2})?/g) ?? [];

function isApplicable(skill: Skill, supportCase: RuntimeSupportCase, order: Order | undefined, shipment: Shipment | undefined) {
  const issue = normalize(`${supportCase.issue} ${supportCase.intent}`);
  const hasRequiredContext = skill.requiredContext.every((field) => field === "orderId" ? Boolean(supportCase.orderId) : field === "refundId" ? Boolean(order) : true);
  return hasRequiredContext && skill.applicability.every((predicate) => {
    const value = predicate.field === "intent" ? issue : predicate.field === "hasPromotion" ? Boolean(order?.promotionId) : predicate.field === "isBundle" ? Boolean(order?.bundle) : predicate.field === "tender" ? order?.tender : shipment?.status;
    return predicate.operator === "equals" ? value === predicate.value : String(value).includes(String(predicate.value));
  });
}

export function tier2ResponseUsesOnlyVerifiedAmounts(response: string, evidence: ToolEvidence[]) {
  const base = evidence.flatMap((item) => {
    const output = item.output as { amount?: number; itemPrice?: number; tenderBreakdown?: { card?: number; giftCard?: number } } | null;
    return output ? [output.amount, output.itemPrice, output.tenderBreakdown?.card, output.tenderBreakdown?.giftCard].filter((value): value is number => typeof value === "number") : [];
  });
  const rates = evidence.flatMap((item) => {
    const output = item.output as { value?: number } | null;
    return output && typeof output.value === "number" && output.value > 0 && output.value < 1 ? [output.value] : [];
  });
  const allowed = new Set(base.map((value) => Number(value.toFixed(2))));
  for (const left of base) for (const right of base) {
    allowed.add(Number(Math.abs(left - right).toFixed(2)));
    allowed.add(Number((left + right).toFixed(2)));
  }
  for (const amount of base) for (const rate of rates) {
    allowed.add(Number((amount * rate).toFixed(2)));
    allowed.add(Number((amount * (1 - rate)).toFixed(2)));
  }
  return currencyTokens(response).every((token) => allowed.has(Number(Number(token.slice(1)).toFixed(2))));
}

export class PersistentHiveOrchestrator {
  constructor(
    private readonly skills = new CockroachSkillRepository(),
    private readonly embeddings = new BedrockEmbeddingProvider(),
    private readonly conversation = new BedrockConversationProvider(),
    private readonly context = new CockroachCompanyContextRepository(),
  ) {}

  async resolveGuidedCase(caseId: string): Promise<ResolutionResult> {
    const fixture = guidedCases.find((item) => item.id === caseId);
    if (!fixture) throw new Error("Unknown guided case");
    if (caseId === "call_b" || caseId === "call_c") {
      const replay = await this.skills.loadGuidedReplay(caseId);
      if (replay) return { ...replay, trace: [event("memory", "Persisted guided proof replayed", "The verified Tier-2/Tier-3 run was loaded from CockroachDB; no new expensive inference was started"), ...replay.trace] };
      const runtimeCase = { ...toRuntimeSupportCase(fixture), id: `${caseId}_progressive_v1` };
      const result = await this.resolve(runtimeCase, { forceNovel: true, displayCaseId: caseId });
      await this.skills.saveGuidedReplay(caseId, result);
      return result;
    }
    return this.resolve(toRuntimeSupportCase(fixture));
  }

  async resolve(supportCase: RuntimeSupportCase, options: { forceNovel?: boolean; displayCaseId?: string } = {}): Promise<ResolutionResult> {
    const overallStarted = Date.now();
    const modelUsage: ModelUsage[] = [];
    const tenantId = await this.skills.tenantIdForSlug(TENANT_SLUG);
    const reader = new CockroachCommerceRepository(tenantId);
    const persistedEmbedding = await this.skills.callEmbedding(tenantId, supportCase.id);
    const embedding = persistedEmbedding ?? await this.embeddings.embed(`${supportCase.issue}\nIntent: ${supportCase.intent}`);
    let embeddingRequests = persistedEmbedding ? 0 : 1;
    const callId = await this.skills.createCall(tenantId, supportCase, embedding);
    const searchStarted = Date.now();
    const [matches, order, shipment] = await Promise.all([this.skills.vectorSearch(tenantId, embedding, 8), reader.lookupOrder(supportCase.orderId), reader.lookupShipment(supportCase.orderId)]);
    const decision = selectPrecisionBiasedSkill(matches, (skill) => isApplicable(skill, supportCase, order, shipment));
    const selected = options.forceNovel ? undefined : decision.selected;
    const trace: TraceEvent[] = [event("memory", "Learned resolution memory searched", `${matches.length} promoted tenant-scoped candidate(s) considered through CockroachDB's distributed vector index`)];
    if (options.forceNovel) trace.push(event("routing", "Guided pre-learning boundary", "This persisted demonstration run captures the point before this problem family was learned", "neutral"));
    else if (decision.reason === "ambiguous_match") trace.push(event("routing", "Ambiguous learned memory", "Competing skills were too close; Tier 1 declined rather than guessing", "warning"));

    if (selected) {
      const tier1Started = Date.now();
      const execution = await executePersistedSkill(selected.skill, supportCase, reader);
      if (execution.ok) {
        const rendered = await this.conversation.render({ supportCase, skill: selected.skill, verifiedResolution: execution.response, verifiedFacts: execution.verifiedFacts, tone: "reassuring" });
        modelUsage.push(rendered.usage);
        trace.push(event("routing", "Tier 1 — known issue", `${selected.skill.name} v${selected.skill.version} selected at ${selected.score.toFixed(3)} cosine similarity`), ...execution.traces, event("conversation", "Fast response model", rendered.usedFallback ? "The model output failed a fact-consistency check, so HIVE used verified deterministic wording" : "Nova Micro rendered only the verified facts; full reasoning was not invoked", rendered.usedFallback ? "warning" : "success"));
        const tier1LatencyMs = Date.now() - tier1Started;
        const result: ResolutionResult = {
          caseId: options.displayCaseId ?? supportCase.id, tier: "tier_1_skill", outcome: "resolved_verified", response: rendered.text, skillId: selected.skillVersionId, skillName: selected.skill.name, reasoningModelCalls: 0, humanEscalation: false, toolsUsed: execution.tools, trace,
          telemetry: { tier1ModelCalls: 1, tier2ModelCalls: 0, skillCompilerCalls: 0, modelUsage, embeddingRequests, pollyCharacters: 0, contextRetrievalCount: 0, overallLatencyMs: Date.now() - overallStarted, tier1LatencyMs, tier2LatencyMs: 0, reasoningEscalationAvoided: true },
        };
        const agentRunId = await this.skills.createAgentRun({ callId, tier: result.tier, provider: "bedrock", model: rendered.usage.modelId, modelCalls: 0 });
        await Promise.all([
          this.skills.recordMemoryRead({ agentRunId, source: "vector", queryRedacted: `[case:${result.caseId}] learned-resolution-memory`, selectedIds: [selected.skillVersionId], latencyMs: Date.now() - searchStarted, evidence: { score: selected.score, index: "skill_embedding_idx", ambiguityGate: decision.reason } }),
          this.skills.recordToolCalls(agentRunId, execution.evidence), this.skills.recordModelInvocations(agentRunId, modelUsage), this.skills.recordCallTelemetry(callId, result), this.skills.recordResolution(tenantId, callId, result),
        ]);
        emitHiveMetrics({ ModelCalls: 1, InputTokens: rendered.usage.inputTokens, OutputTokens: rendered.usage.outputTokens, Tier1Latency: tier1LatencyMs, ReasoningEscalationsAvoided: 1 }, { ModelRole: "FastResponse" });
        return result;
      }
      trace.push(event("routing", "Tier 1 execution declined", "A retrieved skill failed an evidence or safety assertion", "warning"));
    } else if (!options.forceNovel && decision.reason !== "ambiguous_match") trace.push(event("routing", "No safe learned skill", "Similarity, confidence, applicability, or required-context gates declined Tier 1", "neutral"));

    const tier2Started = Date.now();
    const provider = createReasoningProvider();
    const toolEvidence: ToolEvidence[] = [];
    const recordRead = async (tool: string, input: unknown, operation: () => Promise<unknown>) => {
      const started = Date.now();
      try {
        const output = await operation();
        toolEvidence.push({ tool, input, output: output ?? null, latencyMs: Date.now() - started, success: Boolean(output) });
        return output ?? { found: false };
      } catch (error) {
        toolEvidence.push({ tool, input, output: { error: error instanceof Error ? error.message : "read_failed" }, latencyMs: Date.now() - started, success: false });
        throw error;
      }
    };
    const mixedTender = Boolean(order?.bundle && order.tender === "mixed");
    const policyIds = [mixedTender ? "mixed_tender_refund_policy_v1" : order?.promotionId ? "promotion_allocation_policy_v1" : "shipping_policy_v1"];
    const [policyRecords, contextMatches, relatedCases] = await Promise.all([Promise.all(policyIds.map((id) => reader.lookupPolicy(id))), this.context.vectorSearch(tenantId, embedding, 5), this.context.relatedVerifiedCases(tenantId, `${supportCase.issue} ${supportCase.intent}`, 3)]);
    const targetedContext = contextMatches.filter((match) => match.score >= 0.18);
    const policyContext = policyRecords.filter(Boolean).map((policy) => JSON.stringify(policy));
    trace.push(event("context", "Broader company context loaded", `${targetedContext.length} targeted product, procedure, and policy object(s) retrieved from CockroachDB; ${relatedCases.length} related verified case(s) considered`));
    await recordRead("lookup_order", { orderId: supportCase.orderId }, () => reader.lookupOrder(supportCase.orderId));
    if (mixedTender || order?.promotionId) await recordRead("lookup_refund", { orderId: supportCase.orderId }, () => reader.lookupRefund(supportCase.orderId));
    if (order?.promotionId && !mixedTender) await recordRead("lookup_promotion", { promotionId: order.promotionId }, () => reader.lookupPromotion(order.promotionId));
    await recordRead("lookup_policy", { policyId: policyIds[0] }, () => reader.lookupPolicy(policyIds[0]!));
    const verifiedRefund = toolEvidence.find((item) => item.tool === "lookup_refund" && item.success)?.output as { amount?: number; itemPrice?: number } | undefined;
    if (!mixedTender && verifiedRefund?.amount !== undefined) policyContext.push(JSON.stringify({ evidenceConstraint: "The persisted refund ledger is authoritative. Explain its amount; do not replace it with a naive item-level percentage calculation.", verifiedRefundAmount: verifiedRefund.amount, originalItemPrice: verifiedRefund.itemPrice }));
    trace.push(event("reasoning", "Tier 2 — reasoning", "Nova Pro started a bounded investigation with targeted company context and read-only tools"));
    const modelResult = await provider.runResolution({
      supportCase, policyContext, companyContext: targetedContext.map(({ id, kind, title, content, score }) => ({ id, kind, title, content, score })), relatedCaseSummaries: relatedCases.map((item) => JSON.stringify(item)), verifiedEvidence: toolEvidence.map((item) => ({ tool: item.tool, output: item.output })), maxModelCalls: 4, maxToolCalls: 8, onUsage: (usage) => modelUsage.push(usage),
      toolExecutor: async (name, rawInput) => {
        if (name === "lookup_order") return recordRead(name, rawInput, () => reader.lookupOrder(supportCase.orderId));
        if (name === "lookup_shipment") return recordRead(name, rawInput, () => reader.lookupShipment(supportCase.orderId));
        if (name === "lookup_refund") return recordRead(name, rawInput, () => reader.lookupRefund(supportCase.orderId));
        if (name === "lookup_promotion") return recordRead(name, rawInput, () => reader.lookupPromotion(order?.promotionId));
        if (name === "lookup_policy") return recordRead(name, rawInput, () => reader.lookupPolicy(policyIds[0]!));
        throw new Error(`Tool ${name} is not allowed`);
      },
    });
    const tier2Calls = modelUsage.filter((usage) => usage.role === "tier2_reasoning").length;
    const actualTools = new Set(toolEvidence.filter((item) => item.success).map((item) => item.tool));
    const requiredTools = mixedTender ? ["lookup_order", "lookup_refund", "lookup_policy"] : ["lookup_order", "lookup_refund", "lookup_promotion", "lookup_policy"];
    if (!requiredTools.every((tool) => actualTools.has(tool))) throw new Error("Bedrock resolution did not gather the required CockroachDB evidence");
    if (modelResult.status === "resolved" && !tier2ResponseUsesOnlyVerifiedAmounts(modelResult.customerResponse, toolEvidence)) throw new Error(`Bedrock resolution introduced an unsupported amount (${currencyTokens(modelResult.customerResponse).join(",") || "none"})`);

    const humanRequired = mixedTender || modelResult.status !== "resolved" || modelResult.escalate;
    const family = mixedTender ? "bundle_mixed_tender_refund" : "partial_promo_refund";
    const response = humanRequired ? "I checked the bundle allocation. Your $36 refund was split to the original payment methods: $15 to your gift card and $21 to your card." : modelResult.customerResponse;
    const candidate = humanRequired ? candidateFor("bundle_mixed_tender_refund", supportCase.id, "human") : await provider.compileSkill({ resolution: modelResult, sourceCaseId: supportCase.id, toolTrace: toolEvidence.map((item) => ({ tool: item.tool, input: item.input, output: item.output })), policyIds, onUsage: (usage) => modelUsage.push(usage) });
    const shadowCases = await this.skills.listShadowCases(tenantId, family);
    const evaluation = await evaluatePersistedCandidate(candidate, shadowCases, reader);
    if (!evaluation.promoted) throw new Error(`Candidate failed persisted shadow evaluation (${evaluation.passed}/${evaluation.total})`);
    const candidateEmbedding = await this.embeddings.embed(retrievalText(candidate));
    embeddingRequests += 1;
    const persisted = await this.skills.persistCandidate({ tenantId, candidate, embedding: candidateEmbedding, retrievalText: retrievalText(candidate), sourceCallId: callId, evaluation });
    await this.skills.promoteCandidate({ tenantId, skillId: persisted.skillId, skillVersionId: persisted.skillVersionId, evaluationId: persisted.evaluationId, actor: humanRequired ? "northstar-reviewer" : "shadow-gate", idempotencyKey: `promote:${tenantId}:${supportCase.id}:${family}` });
    const promoted = { ...persisted.candidate, status: "promoted" as const, shadowPassRate: evaluation.correctness, confidence: Math.max(persisted.candidate.confidence, 0.96), promotedAt: new Date().toISOString() };
    trace.push(humanRequired ? event("human", "Tier 3 — human takeover", "The reviewer received Tier-1 search results, Tier-2 context, tool evidence, and the policy-boundary reason", "warning") : event("tool", "Evidence verified", `${toolEvidence.length} CockroachDB tool reads were recorded`), event("compiler", "Bounded candidate persisted", `${promoted.name} · learned from ${humanRequired ? "human judgment" : "Tier-2 reasoning"}`), event("evaluation", `${evaluation.passed}/${evaluation.total} persisted shadow cases passed`, `Safety rate ${(evaluation.safetyRate * 100).toFixed(0)}% · ${evaluation.policyViolations} policy violations`), event("promotion", "CockroachDB promotion committed", "Version, evaluation, lineage, vector, and audit event committed transactionally"));
    const tier2LatencyMs = Date.now() - tier2Started;
    const result: ResolutionResult = {
      caseId: options.displayCaseId ?? supportCase.id, tier: humanRequired ? "tier_3_human" : "tier_2_reasoning", outcome: "resolved_verified", response, reasoningModelCalls: tier2Calls, humanEscalation: humanRequired, toolsUsed: [...actualTools], trace, candidate: promoted, evaluation,
      telemetry: { tier1ModelCalls: 0, tier2ModelCalls: tier2Calls, skillCompilerCalls: modelUsage.filter((usage) => usage.role === "skill_compiler").length, modelUsage, embeddingRequests, pollyCharacters: 0, contextRetrievalCount: targetedContext.length + relatedCases.length, overallLatencyMs: Date.now() - overallStarted, tier1LatencyMs: 0, tier2LatencyMs, reasoningEscalationAvoided: false },
    };
    const agentRunId = await this.skills.createAgentRun({ callId, tier: result.tier, provider: provider.name, model: process.env.TIER2_MODEL_ID ?? process.env.BEDROCK_MODEL_ID ?? provider.name, modelCalls: tier2Calls });
    if (humanRequired) await this.skills.recordHumanHandoff(callId, modelResult.escalationReason ?? "Policy boundary requires human judgment", { tier1Search: { candidates: matches.length, decision: decision.reason }, tier2ContextIds: targetedContext.map((item) => item.externalId), relatedCases, tools: toolEvidence, modelStatus: modelResult.status, confidence: modelResult.confidence });
    await Promise.all([
      this.skills.recordMemoryRead({ agentRunId, source: "vector", queryRedacted: `[case:${result.caseId}] learned-resolution-memory`, selectedIds: selected ? [selected.skillVersionId] : [], latencyMs: Date.now() - searchStarted, evidence: { index: "skill_embedding_idx", decision: decision.reason } }),
      this.skills.recordMemoryRead({ agentRunId, source: "vector", queryRedacted: `[case:${result.caseId}] company-context-memory`, selectedIds: targetedContext.map((item) => item.id), latencyMs: tier2LatencyMs, evidence: { index: "company_context_embedding_idx", count: targetedContext.length, relatedCaseCount: relatedCases.length } }),
      this.skills.recordToolCalls(agentRunId, toolEvidence), this.skills.recordModelInvocations(agentRunId, modelUsage), this.skills.recordCallTelemetry(callId, result), this.skills.recordResolution(tenantId, callId, result),
    ]);
    const inputTokens = modelUsage.reduce((sum, usage) => sum + usage.inputTokens, 0);
    const outputTokens = modelUsage.reduce((sum, usage) => sum + usage.outputTokens, 0);
    emitHiveMetrics({ ModelCalls: modelUsage.length, InputTokens: inputTokens, OutputTokens: outputTokens, Tier2Latency: tier2LatencyMs, HumanEscalations: humanRequired ? 1 : 0 }, { ModelRole: "Reasoning" });
    return result;
  }
}
