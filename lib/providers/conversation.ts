import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";
import type { ModelUsage, RuntimeSupportCase, Skill } from "@/lib/domain/types";
import { parseJsonObject } from "@/lib/providers/contracts";

const responseSchema = z.object({ customerResponse: z.string().trim().min(1).max(700) });
const factualTokenPattern = /\$\d+(?:\.\d{1,2})?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?/gi;

export type Tier1ConversationInput = {
  supportCase: RuntimeSupportCase;
  skill: Pick<Skill, "name" | "family" | "responseTemplate">;
  verifiedResolution: string;
  verifiedFacts: Record<string, string | number | boolean>;
  tone: "concise" | "reassuring" | "clarifying";
};

function tokens(value: string) {
  return (value.match(factualTokenPattern) ?? []).map((token) => token.toLowerCase());
}

export function validateConversationalResponse(response: string, verifiedResolution: string) {
  const allowed = new Set(tokens(verifiedResolution));
  const produced = tokens(response);
  return produced.every((token) => allowed.has(token)) && [...allowed].every((token) => produced.includes(token));
}

export function buildTier1Prompt(input: Tier1ConversationInput) {
  return `You are HIVE's Tier-1 conversational presenter. The business resolution is already complete. Make it natural and ${input.tone}, using only the narrow verified context below. Do not calculate, infer, add policy, change amounts or dates, or introduce new facts. Preserve every currency amount and date exactly. Return only {"customerResponse":"..."}.\nCustomer issue: ${JSON.stringify(input.supportCase.issue)}\nVerified skill: ${JSON.stringify(input.skill)}\nVerified facts: ${JSON.stringify(input.verifiedFacts)}\nAuthoritative resolution: ${JSON.stringify(input.verifiedResolution)}`;
}

export class BedrockConversationProvider {
  private readonly client: BedrockRuntimeClient;
  private readonly timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS ?? 20_000);

  constructor(private readonly modelId = process.env.TIER1_MODEL_ID, region = process.env.AWS_REGION ?? "us-east-1") {
    this.client = new BedrockRuntimeClient({ region });
  }

  private requireModel() {
    if (!this.modelId) throw new Error("TIER1_MODEL_ID is not configured");
    return this.modelId;
  }

  async render(input: Tier1ConversationInput): Promise<{ text: string; usage: ModelUsage; usedFallback: boolean }> {
    const started = Date.now();
    const response = await this.client.send(new ConverseCommand({
      modelId: this.requireModel(),
      messages: [{ role: "user", content: [{ text: buildTier1Prompt(input) }] }],
      inferenceConfig: { maxTokens: 220, temperature: 0.2 },
    }), { abortSignal: AbortSignal.timeout(this.timeoutMs) });
    const text = response.output?.message?.content?.flatMap((block) => block.text ? [block.text] : []).join("\n");
    if (!text) throw new Error("Tier-1 model returned no response");
    const parsed = responseSchema.parse(parseJsonObject(text));
    const safe = validateConversationalResponse(parsed.customerResponse, input.verifiedResolution);
    const usage: ModelUsage = {
      role: "tier1_conversation",
      provider: "bedrock",
      modelId: this.requireModel(),
      inputTokens: response.usage?.inputTokens ?? 0,
      outputTokens: response.usage?.outputTokens ?? 0,
      latencyMs: Date.now() - started,
      requestId: response.$metadata.requestId,
    };
    return { text: safe ? parsed.customerResponse : input.verifiedResolution, usage, usedFallback: !safe };
  }
}
