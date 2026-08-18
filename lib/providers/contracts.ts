import { z } from "zod";
import type { ModelUsage, RuntimeSupportCase, Skill } from "@/lib/domain/types";

export const providerResolutionSchema = z.object({
  status: z.enum(["resolved", "escalated", "failed"]),
  resolutionSummary: z.string().min(1),
  customerResponse: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  toolsUsed: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  escalate: z.boolean(),
  escalationReason: z.string().optional(),
  candidateLearningValue: z.enum(["low", "medium", "high"]),
}).superRefine((value, context) => {
  if (value.status === "resolved" && value.escalate) context.addIssue({ code: "custom", path: ["escalate"], message: "Resolved results cannot require escalation" });
  if (value.status !== "resolved" && !value.escalate) context.addIssue({ code: "custom", path: ["escalate"], message: "Unresolved results must escalate" });
  if (value.escalate && !value.escalationReason) context.addIssue({ code: "custom", path: ["escalationReason"], message: "Escalations require a reason" });
});

export type ProviderResolution = z.infer<typeof providerResolutionSchema> & { modelCalls?: number };
export interface ResolutionInput { supportCase: RuntimeSupportCase; policyContext: string[]; companyContext: Array<{ id: string; kind: string; title: string; content: string; score: number }>; relatedCaseSummaries: string[]; verifiedEvidence?: unknown[]; maxModelCalls?: number; maxToolCalls?: number; toolExecutor?: (name: string, input: unknown) => Promise<unknown>; onUsage?: (usage: ModelUsage) => void; }
export interface SkillCompileInput { resolution: ProviderResolution; sourceCaseId: string; toolTrace: Array<{ tool: string; input: unknown; output: unknown }>; policyIds: string[]; onUsage?: (usage: ModelUsage) => void; }
export interface ReasoningProvider {
  readonly name: "mock" | "groq" | "bedrock";
  runResolution(input: ResolutionInput): Promise<ProviderResolution>;
  compileSkill(input: SkillCompileInput): Promise<Skill>;
}

export function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = fenced ?? (start >= 0 && end > start ? text.slice(start, end + 1) : "");
  if (!candidate) throw new Error(`Provider returned no JSON object: ${text.slice(0, 160)}`);
  return JSON.parse(candidate);
}
