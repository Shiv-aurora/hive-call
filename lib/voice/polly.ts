import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

export class PollyVoiceService {
  private readonly client: PollyClient;
  constructor(region = process.env.AWS_REGION ?? "us-east-1", private readonly voiceId = process.env.POLLY_VOICE_ID ?? "Ruth", private readonly engine = process.env.POLLY_ENGINE ?? "generative") { this.client = new PollyClient({ region }); }
  async synthesize(text: string) {
    const response = await this.client.send(new SynthesizeSpeechCommand({ Text: text, OutputFormat: "mp3", VoiceId: this.voiceId as "Ruth", Engine: this.engine as "generative", LanguageCode: "en-US" }), { abortSignal: AbortSignal.timeout(Number(process.env.PROVIDER_TIMEOUT_MS ?? 20_000)) });
    if (!response.AudioStream) throw new Error("Polly returned no audio stream");
    return { bytes: await response.AudioStream.transformToByteArray(), contentType: response.ContentType ?? "audio/mpeg", requestId: response.$metadata.requestId, voiceId: this.voiceId, engine: this.engine };
  }
}
