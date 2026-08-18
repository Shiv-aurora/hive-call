const TARGET_SAMPLE_RATE = 16_000;
const MICROPHONE_CONSTRAINTS: MediaStreamConstraints = { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

export async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}

export function resampleToPcm16(chunks: Float32Array[], inputSampleRate: number) {
  const inputLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(inputLength);
  let inputOffset = 0;
  for (const chunk of chunks) { input.set(chunk, inputOffset); inputOffset += chunk.length; }
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex]!;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
}

export type PcmCaptureSession = { result: Promise<{ pcm: ArrayBuffer; durationMs: number }>; stop: () => void };

export async function startPcmCapture(options: { silenceMs?: number; maxMs?: number; noSpeechMs?: number } = {}): Promise<PcmCaptureSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("microphone-unavailable");
  const stream = await navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(processor); processor.connect(silentGain); silentGain.connect(context.destination);

  const chunks: Float32Array[] = [];
  const startedAt = performance.now();
  let speechStartedAt = 0;
  let lastSpeechAt = 0;
  let settled = false;
  let resolveResult!: (value: { pcm: ArrayBuffer; durationMs: number }) => void;
  let rejectResult!: (reason: Error) => void;
  const result = new Promise<{ pcm: ArrayBuffer; durationMs: number }>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });

  const cleanup = () => {
    processor.onaudioprocess = null;
    source.disconnect(); processor.disconnect(); silentGain.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
  const finish = (reason?: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (reason) { rejectResult(new Error(reason)); return; }
    const durationMs = Math.round((chunks.reduce((sum, chunk) => sum + chunk.length, 0) / context.sampleRate) * 1000);
    resolveResult({ pcm: resampleToPcm16(chunks, context.sampleRate), durationMs });
  };

  processor.onaudioprocess = (event) => {
    const now = performance.now();
    const frame = new Float32Array(event.inputBuffer.getChannelData(0));
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const rms = Math.sqrt(energy / frame.length);
    if (rms >= 0.01) {
      if (!speechStartedAt) speechStartedAt = now;
      lastSpeechAt = now;
    }
    if (speechStartedAt) chunks.push(frame);
    if (!speechStartedAt && now - startedAt >= (options.noSpeechMs ?? 10_000)) finish("no-speech");
    else if (speechStartedAt && now - lastSpeechAt >= (options.silenceMs ?? 1_100) && now - speechStartedAt >= 350) finish();
    else if (now - startedAt >= (options.maxMs ?? 15_000)) finish(speechStartedAt ? undefined : "no-speech");
  };

  return { result, stop: () => finish("capture-stopped") };
}
