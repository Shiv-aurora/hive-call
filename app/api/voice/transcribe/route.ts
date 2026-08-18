import { AmazonTranscribeService } from "@/lib/voice/transcribe";
import { emitHiveMetrics } from "@/lib/aws/metrics";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const BYTES_PER_SECOND = 16_000 * 2;

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.split(";")[0] !== "audio/l16") return Response.json({ error: "Expected 16 kHz mono PCM audio" }, { status: 415 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const maxSeconds = Number(process.env.TRANSCRIBE_UTTERANCE_MAX_SECONDS ?? 15);
    if (bytes.byteLength < 3_200 || bytes.byteLength > BYTES_PER_SECOND * maxSeconds || bytes.byteLength % 2 !== 0) return Response.json({ error: `Audio must be 0.1 to ${maxSeconds} seconds of 16 kHz mono PCM` }, { status: 400 });
    const seconds = bytes.byteLength / BYTES_PER_SECOND;
    const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000);
    const requestLimit = await enforceRateLimit(request, { routeKey: "voice-transcribe", limit: Number(process.env.VOICE_TRANSCRIBE_RATE_LIMIT ?? 20), windowMs });
    if (!requestLimit.allowed) return rateLimitResponse(requestLimit.retryAfterSeconds);
    const monthlyBudget = await enforceRateLimit(request, { routeKey: "voice-transcribe-seconds", limit: Number(process.env.TRANSCRIBE_MONTHLY_SECONDS_LIMIT ?? 3_000), windowMs: 30 * 24 * 60 * 60 * 1000, cost: seconds, scope: "global" });
    if (!monthlyBudget.allowed) return Response.json({ error: "The protected monthly transcription budget has been reached" }, { status: 429, headers: { "retry-after": String(monthlyBudget.retryAfterSeconds), "cache-control": "no-store" } });
    const transcript = await new AmazonTranscribeService().transcribePcm16(bytes);
    emitHiveMetrics({ ExpensiveRequests: 1, TranscribeSeconds: Math.ceil(seconds) }, { Route: "voice-transcribe" });
    return Response.json({ transcript, durationMs: Math.round(seconds * 1000), provider: "amazon-transcribe" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const noSpeech = error instanceof Error && /did not detect speech|no speech/i.test(error.message);
    console.error("voice_transcription_failed", { message: error instanceof Error ? error.message : "unknown" });
    return Response.json({ error: noSpeech ? "No speech was detected" : "Voice transcription failed safely" }, { status: noSpeech ? 422 : 503 });
  }
}
