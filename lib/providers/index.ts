import type { ReasoningProvider } from "@/lib/providers/contracts";
import { BedrockReasoningProvider } from "@/lib/providers/bedrock";
import { GroqReasoningProvider } from "@/lib/providers/groq";
import { MockReasoningProvider } from "@/lib/providers/mock";

export function createReasoningProvider(name = process.env.REASONING_PROVIDER ?? "mock"): ReasoningProvider {
  if (name === "bedrock") return new BedrockReasoningProvider();
  if (name === "groq") return new GroqReasoningProvider();
  if (name === "mock") return new MockReasoningProvider();
  throw new Error(`Unsupported reasoning provider: ${name}`);
}
