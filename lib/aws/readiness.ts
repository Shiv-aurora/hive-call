import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DescribeVoicesCommand, PollyClient } from "@aws-sdk/client-polly";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { BedrockEmbeddingProvider } from "@/lib/providers/embeddings";

type AwsProbe = { tier1Model: boolean; tier2Model: boolean; embeddings: boolean; polly: boolean; s3: boolean; checkedAt: string };

declare global { var hiveAwsProbe: { expiresAt: number; value: Promise<AwsProbe> } | undefined }

async function runProbe(): Promise<AwsProbe> {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const tier1ModelId = process.env.TIER1_MODEL_ID;
  const tier2ModelId = process.env.TIER2_MODEL_ID ?? process.env.BEDROCK_MODEL_ID;
  const bucket = process.env.HIVE_S3_BUCKET;
  if (!tier1ModelId || !tier2ModelId || !bucket) return { tier1Model: false, tier2Model: false, embeddings: false, polly: false, s3: false, checkedAt: new Date().toISOString() };
  const client = new BedrockRuntimeClient({ region });
  const [tier1Model, tier2Model, embedding, polly, s3] = await Promise.allSettled([
    client.send(new ConverseCommand({ modelId: tier1ModelId, messages: [{ role: "user", content: [{ text: "Reply only READY" }] }], inferenceConfig: { maxTokens: 8, temperature: 0 } }), { abortSignal: AbortSignal.timeout(10_000) }),
    client.send(new ConverseCommand({ modelId: tier2ModelId, messages: [{ role: "user", content: [{ text: "Reply only READY" }] }], inferenceConfig: { maxTokens: 8, temperature: 0 } }), { abortSignal: AbortSignal.timeout(10_000) }),
    new BedrockEmbeddingProvider(undefined, region).embed("HIVE readiness probe"),
    new PollyClient({ region }).send(new DescribeVoicesCommand({ Engine: (process.env.POLLY_ENGINE ?? "generative") as "generative", LanguageCode: "en-US" }), { abortSignal: AbortSignal.timeout(10_000) }),
    new S3Client({ region }).send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(10_000) }),
  ]);
  return { tier1Model: tier1Model.status === "fulfilled", tier2Model: tier2Model.status === "fulfilled", embeddings: embedding.status === "fulfilled" && embedding.value.length === 1024, polly: polly.status === "fulfilled", s3: s3.status === "fulfilled", checkedAt: new Date().toISOString() };
}

export function probeAwsRuntime() {
  const now = Date.now();
  if (!globalThis.hiveAwsProbe || globalThis.hiveAwsProbe.expiresAt <= now) globalThis.hiveAwsProbe = { expiresAt: now + 5 * 60_000, value: runProbe() };
  return globalThis.hiveAwsProbe.value;
}
