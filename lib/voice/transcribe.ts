import { StartStreamTranscriptionCommand, TranscribeStreamingClient } from "@aws-sdk/client-transcribe-streaming";

const SAMPLE_RATE = 16_000;
const CHUNK_BYTES = 3_200;

export class AmazonTranscribeService {
  private readonly client: TranscribeStreamingClient;

  constructor(region = process.env.AWS_REGION ?? "us-east-1") {
    this.client = new TranscribeStreamingClient({ region });
  }

  async transcribePcm16(bytes: Uint8Array) {
    async function* audioStream() {
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
        yield { AudioEvent: { AudioChunk: bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.byteLength)) } };
      }
    }

    const response = await this.client.send(new StartStreamTranscriptionCommand({
      LanguageCode: "en-US",
      MediaEncoding: "pcm",
      MediaSampleRateHertz: SAMPLE_RATE,
      EnablePartialResultsStabilization: true,
      PartialResultsStability: "high",
      AudioStream: audioStream(),
    }), { abortSignal: AbortSignal.timeout(20_000) });

    const segments: string[] = [];
    if (!response.TranscriptResultStream) throw new Error("Amazon Transcribe returned no result stream");
    for await (const event of response.TranscriptResultStream) {
      for (const result of event.TranscriptEvent?.Transcript?.Results ?? []) {
        const text = result.Alternatives?.[0]?.Transcript?.trim();
        if (!result.IsPartial && text) segments.push(text);
      }
    }
    const transcript = segments.join(" ").trim();
    if (!transcript) throw new Error("Amazon Transcribe did not detect speech");
    return transcript;
  }
}
