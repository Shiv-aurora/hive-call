import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

const titanResponseSchema = z.object({ embedding: z.array(z.number()).min(256) });

export class BedrockEmbeddingProvider {
  private readonly client: BedrockRuntimeClient;
  constructor(private readonly modelId = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0", region = process.env.AWS_REGION ?? "us-east-1") { this.client = new BedrockRuntimeClient({ region }); }
  async embed(text: string) {
    const response = await this.client.send(new InvokeModelCommand({ modelId: this.modelId, contentType: "application/json", accept: "application/json", body: new TextEncoder().encode(JSON.stringify({ inputText: text, dimensions: 1024, normalize: true })) }), { abortSignal: AbortSignal.timeout(Number(process.env.PROVIDER_TIMEOUT_MS ?? 20_000)) });
    return titanResponseSchema.parse(JSON.parse(new TextDecoder().decode(response.body))).embedding;
  }
}
