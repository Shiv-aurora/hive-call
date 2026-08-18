import { BedrockRuntimeClient, ConverseCommand, type ContentBlock, type Message, type Tool, type ToolResultBlock } from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import { skillSchema } from "@/lib/domain/schemas";
import { z } from "zod";
import { parseJsonObject, providerResolutionSchema, type ReasoningProvider, type ResolutionInput, type SkillCompileInput } from "@/lib/providers/contracts";
import { candidateFor } from "@/lib/skills/catalog";

const resolutionTools: Tool[] = ["lookup_order", "lookup_shipment", "lookup_refund", "lookup_promotion", "lookup_policy"].map((name) => ({ toolSpec: { name, description: `Read-only Northstar Commerce ${name.replaceAll("_", " ")}`, inputSchema: { json: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }));
const compilerTextSchema = z.object({ description: z.string().min(1).max(2_000).transform((value) => value.slice(0, 500).trim()) });

export function buildTier2Prompt(input: ResolutionInput) {
  return `You are HIVE's bounded Tier-2 support agent. Investigate using the targeted company context, verified evidence, and optional read-only tools. Do not claim success when evidence is missing. Return only a JSON object matching this exact contract: {"status":"resolved|escalated|failed","resolutionSummary":"string","customerResponse":"string","evidenceRefs":["string"],"toolsUsed":["string"],"confidence":0.0,"escalate":false,"escalationReason":"optional string","candidateLearningValue":"low|medium|high"}. confidence must be a JSON number from 0 to 1; evidenceRefs must contain only supplied identifiers. Case: ${JSON.stringify(input.supportCase)} Policies: ${JSON.stringify(input.policyContext)} Targeted company context: ${JSON.stringify(input.companyContext)} Verified evidence: ${JSON.stringify(input.verifiedEvidence ?? [])} Related verified cases: ${JSON.stringify(input.relatedCaseSummaries)}`;
}

export class BedrockReasoningProvider implements ReasoningProvider {
  readonly name = "bedrock" as const;
  private readonly client: BedrockRuntimeClient;
  private readonly timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS ?? 20_000);
  constructor(private readonly modelId = process.env.TIER2_MODEL_ID ?? process.env.BEDROCK_MODEL_ID, region = process.env.AWS_REGION ?? "us-east-1") { this.client = new BedrockRuntimeClient({ region }); }
  private requireModel() { if (!this.modelId) throw new Error("TIER2_MODEL_ID is not configured"); return this.modelId; }

  async runResolution(input: ResolutionInput) {
    const messages: Message[] = [{ role: "user", content: [{ text: buildTier2Prompt(input) }] }];
    const maxModelCalls = input.maxModelCalls ?? 4;
    const maxToolCalls = input.maxToolCalls ?? 8;
    let toolCalls = 0;
    for (let modelCall = 1; modelCall <= maxModelCalls; modelCall += 1) {
      const started = Date.now();
      const response = await this.client.send(new ConverseCommand({ modelId: this.requireModel(), messages, toolConfig: { tools: resolutionTools }, inferenceConfig: { maxTokens: 1200, temperature: 0 } }), { abortSignal: AbortSignal.timeout(this.timeoutMs) });
      input.onUsage?.({ role: "tier2_reasoning", provider: "bedrock", modelId: this.requireModel(), inputTokens: response.usage?.inputTokens ?? 0, outputTokens: response.usage?.outputTokens ?? 0, latencyMs: Date.now() - started, requestId: response.$metadata.requestId });
      const assistantMessage = response.output?.message;
      const blocks = assistantMessage?.content ?? [];
      const toolUses = blocks.flatMap((block: ContentBlock) => "toolUse" in block && block.toolUse ? [block.toolUse] : []);
      if (toolUses.length) {
        if (!input.toolExecutor) throw new Error("Bedrock requested a tool but no bounded tool executor was supplied");
        if (toolCalls + toolUses.length > maxToolCalls) throw new Error("Bedrock tool-call budget exhausted");
        if (!assistantMessage) throw new Error("Bedrock tool request had no assistant message");
        messages.push(assistantMessage);
        const results: ContentBlock[] = [];
        for (const toolUse of toolUses) {
          toolCalls += 1;
          try {
            const output = await input.toolExecutor(toolUse.name ?? "", toolUse.input);
            const safeOutput = output == null ? { found: false } : output;
            const toolResult: ToolResultBlock = { toolUseId: toolUse.toolUseId!, content: [{ json: safeOutput as DocumentType }], status: "success" };
            results.push({ toolResult });
          } catch (error) {
            const toolResult: ToolResultBlock = { toolUseId: toolUse.toolUseId!, content: [{ text: error instanceof Error ? error.message : "Tool failed" }], status: "error" };
            results.push({ toolResult });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = blocks.flatMap((block: ContentBlock) => "text" in block && block.text ? [block.text] : []).join("\n");
      if (!text) throw new Error("Bedrock returned no structured resolution");
      try {
        return { ...providerResolutionSchema.parse(parseJsonObject(text)), modelCalls: modelCall };
      } catch (error) {
        if (modelCall === maxModelCalls || !assistantMessage) throw error;
        messages.push(assistantMessage, { role: "user", content: [{ text: "Your prior response was not valid contract JSON. Return only the required JSON object now, with no prose or markdown." }] });
      }
    }
    throw new Error("Bedrock model-call budget exhausted");
  }

  async compileSkill(input: SkillCompileInput) {
    const family = input.policyIds.includes("mixed_tender_refund_policy_v1") ? "bundle_mixed_tender_refund" : "partial_promo_refund";
    const boundedSkeleton = candidateFor(family, input.sourceCaseId, "tier_2");
    const started = Date.now();
    const response = await this.client.send(new ConverseCommand({ modelId: this.requireModel(), messages: [{ role: "user", content: [{ text: `You are the HIVE Skill Compiler. Return only {"description":"..."}. Keep description under 500 characters. Summarize the verified procedure; never emit code, templates, tools, identifiers, or status fields. Skeleton: ${JSON.stringify(boundedSkeleton)} Verified input: ${JSON.stringify({ resolution: input.resolution, sourceCaseId: input.sourceCaseId, toolTrace: input.toolTrace, policyIds: input.policyIds })}` }] }], inferenceConfig: { maxTokens: 240, temperature: 0 } }), { abortSignal: AbortSignal.timeout(this.timeoutMs) });
    input.onUsage?.({ role: "skill_compiler", provider: "bedrock", modelId: this.requireModel(), inputTokens: response.usage?.inputTokens ?? 0, outputTokens: response.usage?.outputTokens ?? 0, latencyMs: Date.now() - started, requestId: response.$metadata.requestId });
    const text = response.output?.message?.content?.flatMap((block) => block.text ? [block.text] : []).join("\n");
    if (!text) throw new Error("Bedrock returned no candidate skill");
    const editable = compilerTextSchema.parse(parseJsonObject(text));
    return skillSchema.parse({ ...boundedSkeleton, description: editable.description });
  }
}
