import { z } from "zod";
import { PollyVoiceService } from "@/lib/voice/polly";
import { S3ArtifactStore } from "@/lib/aws/artifacts";
import { createHash } from "node:crypto";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { emitHiveMetrics } from "@/lib/aws/metrics";
import { enforceRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const requestSchema = z.object({ text: z.string().trim().min(1).max(700), cacheKey: z.string().regex(/^[a-zA-Z0-9/_-]+$/).max(160).optional() });

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const limit = await enforceRateLimit(request, { routeKey: "voice-synthesize", limit: Number(process.env.VOICE_RATE_LIMIT ?? 12), windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000) });
    if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
    const textHash = createHash("sha256").update(input.text).digest("hex").slice(0, 24);
    const artifactKey = input.cacheKey && process.env.HIVE_S3_BUCKET ? `polly/${input.cacheKey}-${textHash}.mp3` : undefined;
    const store = new S3ArtifactStore();
    if (artifactKey) {
      const cached = await store.getArtifact(artifactKey);
      if (cached) {
        emitHiveMetrics({ ExpensiveRequests: 0, PollyCacheHits: 1 }, { Route: "voice-synthesize" });
        return new Response(new Uint8Array(cached.bytes).buffer, { headers: { "content-type": cached.contentType, "cache-control": "private, max-age=3600", "x-hive-polly-cache": "hit" } });
      }
    }
    emitHiveMetrics({ ExpensiveRequests: 1, PollyCharacters: input.text.length }, { Route: "voice-synthesize" });
    const audio = await new PollyVoiceService().synthesize(input.text);
    if (artifactKey) await store.putSanitizedArtifact(artifactKey, audio.bytes, audio.contentType, { pollyVoice: audio.voiceId, pollyEngine: audio.engine });
    if (input.cacheKey && process.env.DATABASE_URL) await new CockroachSkillRepository().recordPollyCharacters(input.cacheKey, input.text.length);
    return new Response(new Uint8Array(audio.bytes).buffer, { headers: { "content-type": audio.contentType, "cache-control": artifactKey ? "private, max-age=3600" : "no-store", "x-hive-polly-cache": "miss", "x-hive-polly-voice": audio.voiceId, "x-hive-polly-engine": audio.engine, ...(audio.requestId ? { "x-amzn-request-id": audio.requestId } : {}) } });
  } catch (error) {
    const configurationError = error instanceof Error && /configured|credentials|region/i.test(error.message);
    return Response.json({ error: configurationError ? "Voice service is not configured" : "Voice synthesis failed", textFallback: true }, { status: configurationError ? 503 : 502 });
  }
}
