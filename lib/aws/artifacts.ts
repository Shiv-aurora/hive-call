import { GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class S3ArtifactStore {
  private readonly client: S3Client;
  constructor(private readonly bucket = process.env.HIVE_S3_BUCKET, region = process.env.AWS_REGION ?? "us-east-1") { this.client = new S3Client({ region }); }
  async putSanitizedArtifact(key: string, body: Uint8Array | string, contentType: string, metadata: Record<string, string> = {}) {
    if (!this.bucket) throw new Error("HIVE_S3_BUCKET is not configured");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256", Metadata: { ...metadata, fictionalData: "true" } }));
    return { bucket: this.bucket, key };
  }

  async getArtifact(key: string) {
    if (!this.bucket) return undefined;
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
      if (!result.Body) return undefined;
      return { bytes: await result.Body.transformToByteArray(), contentType: result.ContentType ?? "audio/mpeg" };
    } catch (error) {
      if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return undefined;
      throw error;
    }
  }
}
