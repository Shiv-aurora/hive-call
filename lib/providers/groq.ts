import { skillSchema } from "@/lib/domain/schemas";
import { parseJsonObject, providerResolutionSchema, type ReasoningProvider, type ResolutionInput, type SkillCompileInput } from "@/lib/providers/contracts";

export class GroqReasoningProvider implements ReasoningProvider {
  readonly name = "groq" as const;
  constructor(private readonly apiKey = process.env.GROQ_API_KEY, private readonly model = process.env.GROQ_MODEL_ID ?? "llama-3.3-70b-versatile") {}
  private async complete(prompt: string) {
    if (!this.apiKey) throw new Error("GROQ_API_KEY is not configured");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Groq request failed (${response.status})`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq returned no structured response");
    return text;
  }
  async runResolution(input: ResolutionInput) { return providerResolutionSchema.parse(parseJsonObject(await this.complete(`Resolve this fictional support case using only supplied context. Return JSON matching status,resolutionSummary,customerResponse,evidenceRefs,toolsUsed,confidence,escalate,escalationReason,candidateLearningValue. Case: ${JSON.stringify(input.supportCase)} Policies: ${JSON.stringify(input.policyContext)}`))); }
  async compileSkill(input: SkillCompileInput) { return skillSchema.parse(parseJsonObject(await this.complete(`Compile this verified resolution into the exact bounded HIVE Skill JSON schema. Never invent tools or arbitrary code. Input: ${JSON.stringify(input)}`))); }
}
