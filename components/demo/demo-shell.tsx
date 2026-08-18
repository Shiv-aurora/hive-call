"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, Check, ChevronRight, CircleStop, Database, Headphones, PhoneCall, PhoneIncoming, RotateCcw, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { companyContext, customers, guidedCases } from "@/data/fixtures/world";
import type { ResolutionResult } from "@/lib/domain/types";
import { requestMicrophonePermission, startPcmCapture } from "@/lib/voice/browser-recorder";
import { isAffirmativeCallClosure } from "@/lib/voice/conversation";

const tierLabel = { tier_1_skill: "Tier 1 · Known issue", tier_2_reasoning: "Tier 2 · Reasoning", tier_3_human: "Tier 3 · Human takeover" } as const;
const callScript: Record<string, { ask: string; detail: string; bridge: string; closing: string }> = {
  call_a: { ask: "Sorry about the wait. Can you confirm the order number for me?", detail: "It's order #NS-10401, placed last week.", bridge: "Found it. Checking the live carrier status now.", closing: "Okay, good to know it's on the way. Thanks!" },
  call_b: { ask: "I can help with that. Which order is the return on?", detail: "Order #NS-10404. I returned the desk lamp.", bridge: "Got it. Let me look at exactly how that refund was calculated.", closing: "Ah, the promotion discount. Now the number makes sense." },
  call_c: { ask: "That sounds frustrating. Which order are we looking at?", detail: "Order #NS-10411. I paid half with a gift card.", bridge: "Part of a bundle and a split payment. Let me verify how that refund was put together.", closing: "Thank you for actually checking it properly." },
  call_d: { ask: "Happy to explain. Can you confirm the order for me?", detail: "Order #NS-10421, the return from Monday.", bridge: "Let me look at how that return was split across your payment methods.", closing: "Perfect, that's exactly what I needed." },
};
function callTone(up: boolean) {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.frequency.value = up ? 620 : 440;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
    oscillator.frequency.exponentialRampToValueAtTime(up ? 880 : 320, ctx.currentTime + 0.2);
    oscillator.start(); oscillator.stop(ctx.currentTime + 0.6);
    oscillator.onended = () => { void ctx.close(); };
  } catch { /* audio is decorative */ }
}
type VoicePhase = "speaking" | "listening" | "thinking" | "ended";
type VoiceTurn = { who: "you" | "hive"; text: string; tier?: ResolutionResult["tier"] };
type SystemProof = {
  provider?: string;
  aws?: { tier1Model?: string; tier2Model?: string; embeddingModel?: string; health?: Record<string, boolean> };
  callD?: { tier?: string; tier1_model_calls?: number; tier2_model_calls?: number; reasoning_escalation_avoided?: boolean; proof?: string };
  cockroach?: {
    ok?: boolean;
    reason?: string;
    vectorIndex?: string;
    managedMcp?: string;
    companyContextRetrieval?: string;
    mcpEvidence?: { query?: string; latencyMs?: string; evidence?: { resultCount?: number; topFamily?: string; topContext?: string; topScore?: number } };
    mcpLookups?: Array<{ query?: string }>;
  };
};

export function DemoShell({ initialPromotedCount, initialCallCount, initialTier1Count }: { initialPromotedCount: number; initialCallCount: number; initialTier1Count: number }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ResolutionResult[]>([]);
  const [promotedCount, setPromotedCount] = useState(initialPromotedCount);
  const [callError, setCallError] = useState<string>();
  const [proofOpen, setProofOpen] = useState(false);
  const [proof, setProof] = useState<SystemProof | null>(null);
  const [voiceState, setVoiceState] = useState<"idle" | "loading" | "playing" | "fallback">("idle");
  const [callState, setCallState] = useState<"idle" | "running">("idle");
  const [stage, setStage] = useState(0);
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testIssue, setTestIssue] = useState("");
  const [voiceCall, setVoiceCall] = useState<{ phase: VoicePhase; turns: VoiceTurn[]; lastResult?: ResolutionResult; interim: string; secondsLeft: number; endReason?: string; sttAvailable: boolean } | null>(null);
  const voiceCtl = useRef<{ ended: boolean; stopListening?: () => void; timer?: ReturnType<typeof setInterval>; audio?: HTMLAudioElement }>({ ended: false });
  const voiceResultRef = useRef<ResolutionResult | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const currentCase = guidedCases[index];
  const currentResult = results[index];
  const activeResult = voiceCall ? voiceCall.lastResult : currentResult;
  const customer = customers.find((value) => value.id === currentCase.customerId)!;
  const script = callScript[currentCase.id] ?? { ask: "Can you confirm the order for me?", detail: "Sure, one moment.", bridge: "One moment while I look into that.", closing: "Thanks for the help." };
  const firstName = customer.name.split(" ")[0];

  useEffect(() => {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
    setStage(results[index] ? 5 : 0);
  }, [index, results]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [voiceCall?.turns.length, voiceCall?.interim, voiceCall?.phase]);

  useEffect(() => {
    const ctl = voiceCtl.current;
    return () => { ctl.ended = true; ctl.stopListening?.(); ctl.audio?.pause(); if (ctl.timer) clearInterval(ctl.timer); };
  }, []);

  async function runCurrent() {
    if (currentResult) return;
    setCallState("running");
    setCallError(undefined);
    setStage(1);
    stageTimers.current.push(setTimeout(() => setStage(2), 1000), setTimeout(() => setStage(3), 2100), setTimeout(() => setStage(4), 3300), setTimeout(() => setStage(5), 4400));
    const startedAt = Date.now();
    try {
      const response = await fetch("/api/demo/reason", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: currentCase.id }) });
      if (!response.ok) throw new Error("The live CockroachDB resolution path is unavailable");
      const payload = await response.json() as { result: ResolutionResult };
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 5300 - (Date.now() - startedAt))));
      setResults((value) => [...value, payload.result]);
      if (payload.result.candidate && !payload.result.trace.some((item) => item.label === "Persisted guided proof replayed")) setPromotedCount((value) => value + 1);
    } catch (error) {
      stageTimers.current.forEach(clearTimeout);
      stageTimers.current = [];
      setStage(2);
      setCallError(error instanceof Error ? error.message : "Resolution failed safely");
    } finally {
      setCallState("idle");
    }
  }
  function next() { if (index < guidedCases.length - 1) setIndex((value) => value + 1); }
  function reset() { stageTimers.current.forEach(clearTimeout); stageTimers.current = []; setStage(0); setResults([]); setIndex(0); setProofOpen(false); setCallError(undefined); cleanupVoice(); voiceResultRef.current = undefined; setVoiceCall(null); setTestOpen(false); }
  const updateVoice = (fn: (value: NonNullable<typeof voiceCall>) => NonNullable<typeof voiceCall>) => setVoiceCall((value) => value ? fn(value) : value);
  function cleanupVoice() {
    voiceCtl.current.ended = true;
    voiceCtl.current.stopListening?.();
    voiceCtl.current.audio?.pause();
    if (voiceCtl.current.timer) clearInterval(voiceCtl.current.timer);
  }
  function exitTest() { cleanupVoice(); voiceResultRef.current = undefined; setVoiceCall(null); }
  function endVoiceCall(reason: string) {
    if (voiceCtl.current.ended) return;
    cleanupVoice();
    callTone(false);
    updateVoice((value) => ({ ...value, phase: "ended", endReason: reason, interim: "" }));
  }
  async function speak(text: string, cacheKey: string) {
    updateVoice((value) => ({ ...value, phase: "speaking" }));
    try {
      const response = await fetch("/api/voice/synthesize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, cacheKey }) });
      if (!response.ok) throw new Error("voice unavailable");
      const url = URL.createObjectURL(await response.blob());
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        voiceCtl.current.audio = audio;
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } catch { await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 1000 + text.length * 24))); }
  }
  async function listen() {
    if (voiceCtl.current.ended) return;
    updateVoice((value) => ({ ...value, phase: "listening", interim: "" }));
    try {
      const capture = await startPcmCapture({ silenceMs: 1_100, maxMs: 15_000, noSpeechMs: 10_000 });
      if (voiceCtl.current.ended) { capture.stop(); return; }
      voiceCtl.current.stopListening = capture.stop;
      const { pcm } = await capture.result;
      if (voiceCtl.current.ended) return;
      updateVoice((value) => ({ ...value, phase: "thinking", interim: "Transcribing with Amazon Transcribe…" }));
      const response = await fetch("/api/voice/transcribe", { method: "POST", headers: { "content-type": "audio/l16" }, body: pcm });
      const payload = await response.json().catch(() => null) as { transcript?: string; error?: string } | null;
      if (!response.ok || !payload?.transcript) throw new Error(payload?.error ?? "transcription-unavailable");
      await handleUtterance(payload.transcript);
    } catch (error) {
      if (voiceCtl.current.ended || (error instanceof Error && error.message === "capture-stopped")) return;
      if (error instanceof Error && error.message === "no-speech") { await handleTooShort(); return; }
      updateVoice((value) => ({ ...value, phase: "listening", sttAvailable: false, interim: "" }));
    }
  }
  async function handleTooShort() {
    const line = "Sorry, I didn't catch that. Could you say it again?";
    updateVoice((value) => ({ ...value, turns: [...value.turns, { who: "hive", text: line }] }));
    await speak(line, "test_voice_repeat_v1");
    if (!voiceCtl.current.ended) void listen();
  }
  async function handleUtterance(text: string) {
    updateVoice((value) => ({ ...value, phase: "thinking", interim: "", turns: [...value.turns, { who: "you", text }] }));
    if (voiceResultRef.current && isAffirmativeCallClosure(text)) {
      const closing = "Great, I'm glad I could help. Have a good day!";
      updateVoice((value) => ({ ...value, turns: [...value.turns, { who: "hive", text: closing }] }));
      await speak(closing, "test_voice_resolved_closing_v1");
      if (!voiceCtl.current.ended) endVoiceCall("Resolved with HIVE");
      return;
    }
    try {
      const response = await fetch("/api/demo/test-call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ issue: text }) });
      const payload = await response.json().catch(() => null) as { result?: ResolutionResult; error?: string } | null;
      if (!response.ok || !payload?.result) {
        if (response.status === 400) {
          const clarification = "I'm here to help with Ava's delayed delivery. Could you ask your order-status question another way?";
          updateVoice((value) => ({ ...value, turns: [...value.turns, { who: "hive", text: clarification }] }));
          await speak(clarification, "test_voice_clarification_v1");
          if (!voiceCtl.current.ended) void listen();
          return;
        }
        if (response.status === 429) { endVoiceCall("The protected demo-call limit was reached. Please try again after the safety window."); return; }
        throw new Error(payload?.error ?? "The live resolution path is unavailable");
      }
      const result = payload.result;
      voiceResultRef.current = result;
      const answer = `${result.response} Did that resolve your problem?`;
      updateVoice((value) => ({ ...value, lastResult: result, turns: [...value.turns, { who: "hive", text: answer, tier: result.tier }] }));
      await speak(answer, `${result.caseId}-confirmation`);
      if (voiceCtl.current.ended) return;
      if (result.tier === "tier_3_human") { endVoiceCall("HIVE routed this to a human. No human is staffed in this demo, so the call ends here — the handoff package is in the trace."); return; }
      void listen();
    } catch {
      const retry = "I had trouble verifying that turn, but the call is still connected. Please ask your delivery question again.";
      updateVoice((value) => ({ ...value, turns: [...value.turns, { who: "hive", text: retry }] }));
      await speak(retry, "test_voice_retry_v1");
      if (!voiceCtl.current.ended) void listen();
    }
  }
  async function startVoiceCall() {
    const sttAvailable = await requestMicrophonePermission();
    setTestOpen(false);
    voiceCtl.current = { ended: false };
    voiceResultRef.current = undefined;
    setVoiceCall({ phase: "speaking", turns: [], interim: "", secondsLeft: 180, sttAvailable });
    callTone(true);
    const deadline = Date.now() + 180_000;
    voiceCtl.current.timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      updateVoice((value) => ({ ...value, secondsLeft: left }));
      if (left <= 0) endVoiceCall("Three-minute demo limit reached. Thanks for calling Northstar.");
    }, 1000);
    const greeting = "Hi Ava, you've reached Northstar Commerce support. I can help with your delayed order and delivery status. What would you like to know?";
    updateVoice((value) => ({ ...value, turns: [{ who: "hive", text: greeting }] }));
    await speak(greeting, "test_voice_greeting_v1");
    if (!voiceCtl.current.ended) void listen();
  }
  async function openProof() {
    setProofOpen(true);
    try { const response = await fetch("/api/system-proof", { cache: "no-store" }); setProof(await response.json() as SystemProof); } catch { setProof({}); }
  }
  async function playVoice() {
    if (!activeResult) return;
    setVoiceState("loading");
    try {
      const response = await fetch("/api/voice/synthesize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: activeResult.response, cacheKey: activeResult.caseId }) });
      if (!response.ok) throw new Error("Voice unavailable");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setVoiceState("idle"); };
      await audio.play(); setVoiceState("playing");
    } catch { setVoiceState("fallback"); }
  }

  const outcomeBanner = (result: ResolutionResult) => <div className="call-outcome"><span className="outcome-badge"><Check size={16}/></span><div><b>Resolved · {tierLabel[result.tier]}</b><small>{result.tier === "tier_1_skill" ? `Answered from learned memory${result.skillName ? ` · ${result.skillName}` : ""} · full reasoning never woke up` : result.tier === "tier_2_reasoning" ? "Solved once by full reasoning · HIVE is turning it into a reusable skill" : "Human resolved it · HIVE captured the fix for next time"}</small></div>{result.tier === "tier_1_skill" && <em>0 reasoning calls</em>}</div>;

  return <>
    <main className="demo-wrap">
      <section className="demo-heading">
        <div><span className="eyebrow">Progressive intelligence</span><h1>Known problems move to <span className="hl">the fast path</span></h1><p>Use learned memory for known territory. Spend stronger reasoning only on genuinely new problems.</p></div>
        <div className="heading-actions"><button className="ghost-button test-cta" onClick={() => { setTestIssue(""); setTestOpen(true); }}><PhoneCall size={15} />Start your test call</button><button className="ghost-button" onClick={reset}><RotateCcw size={15} />Reset demo</button><button className="ghost-button" onClick={openProof}><Database size={15} />System proof</button></div>
      </section>

      {voiceCall ? <div className="test-banner"><PhoneCall size={15}/><p>Live voice call — Amazon Transcribe speech-to-text, Amazon Polly voice, and the real HIVE pipeline. Each turn is sent automatically after you pause.</p></div> : <div className="progress-strip" aria-label={`Guided call ${index + 1} of 4`}>
        {guidedCases.map((item, itemIndex) => <button key={item.id} disabled={itemIndex > results.length} onClick={() => setIndex(itemIndex)} className={itemIndex === index ? "progress-step current" : itemIndex < results.length ? "progress-step done" : "progress-step"}>
          <span>{itemIndex < results.length ? <Check size={13} /> : String.fromCharCode(65 + itemIndex)}</span><div><b>Call {String.fromCharCode(65 + itemIndex)}</b><small>{["Known · fast response", "Reasoning learns", "Human teaches", "Human → Tier 1"][itemIndex]}</small></div>
        </button>)}
      </div>}

      <div className="demo-grid">
        <section className="call-panel card">
          {voiceCall ? <>
          <div className="call-bar"><div className="live-state"><span className="live-pulse" />{voiceCall.phase === "ended" ? "Call ended" : "Live voice call · Northstar Commerce"}</div><span className="call-timer">{Math.floor(voiceCall.secondsLeft / 60)}:{String(voiceCall.secondsLeft % 60).padStart(2, "0")}</span></div>
          <div className="customer-row"><div className="customer-avatar">AT</div><div><b>Ava Thompson (you)</b><span>Order #NS-10405 · delayed shipment</span></div><span className={`phase-chip ${voiceCall.phase}`}>{voiceCall.phase === "listening" ? "● Listening" : voiceCall.phase === "thinking" ? "Routing…" : voiceCall.phase === "speaking" ? "Polly speaking" : "Ended"}</span></div>
          <div className="transcript voice-transcript" aria-live="polite" ref={transcriptRef}>
            {voiceCall.turns.map((turn, turnIndex) => <div key={turnIndex} className={`message ${turn.who === "you" ? "customer-message" : "hive-message"}${turn.tier ? " resolution-turn" : ""}`}><span>{turn.who === "you" ? "You" : turn.tier ? `HIVE · ${tierLabel[turn.tier]}` : "HIVE"}</span><p>“{turn.text}”</p></div>)}
            {voiceCall.interim && <div className="message customer-message interim"><span>You</span><p>“{voiceCall.interim}”</p></div>}
            {voiceCall.phase === "thinking" && <div className="typing" aria-label="HIVE is resolving"><i/><i/><i/></div>}
            {voiceCall.phase === "ended" && <div className="call-outcome"><span className="outcome-badge"><Check size={16}/></span><div><b>Call ended</b><small>{voiceCall.endReason}</small></div></div>}
          </div>
          {!voiceCall.sttAvailable && voiceCall.phase === "listening" && <div className="voice-fallback"><input value={testIssue} onChange={(event) => setTestIssue(event.target.value)} maxLength={280} placeholder="Voice input unavailable here — type what you'd say…" aria-label="Your words" onKeyDown={(event) => { if (event.key === "Enter" && testIssue.trim().length >= 8) { const text = testIssue.trim(); setTestIssue(""); void handleUtterance(text); } }} /><button className="primary-button" disabled={testIssue.trim().length < 8} onClick={() => { const text = testIssue.trim(); setTestIssue(""); void handleUtterance(text); }}>Say it</button></div>}
          <div className="voice-dock">
            <div className={`voice-orb ${voiceCall.phase}`} aria-hidden="true"><span/><span/><span/></div>
            <div className="voice-status"><b>{voiceCall.phase === "listening" ? "Listening…" : voiceCall.phase === "thinking" ? "Thinking…" : voiceCall.phase === "speaking" ? "Speaking…" : "Call ended"}</b><small>{voiceCall.phase === "ended" ? voiceCall.endReason : voiceCall.phase === "listening" ? (voiceCall.sttAvailable ? "Speak once HIVE finishes; Amazon Transcribe sends your turn after a short pause" : "Microphone transcription unavailable — type below and press Say it") : voiceCall.phase === "thinking" ? "Transcribing first, then memory and reasoning only if needed" : "Amazon Polly · generative voice"}</small></div>
            {voiceCall.phase === "ended" ? <button className="primary-button" onClick={() => setTestOpen(true)}><PhoneCall size={15}/>Call again</button> : <button className="round-control end-red" aria-label="End call" onClick={() => endVoiceCall("You ended the call")}><CircleStop size={18}/></button>}
            <button className="ghost-button" onClick={exitTest}>Exit</button>
          </div>
          </> : <>
          <div className="call-bar"><div className="live-state"><span className="live-pulse" />{currentResult ? "Call complete" : "Live support call"}</div><span>00:{currentResult ? "48" : "12"}</span></div>
          <div className="customer-row"><div className="customer-avatar">{customer.name.split(" ").map((part) => part[0]).join("").slice(0,2)}</div><div><b>{customer.name}</b><span>Order {currentCase.orderId.replace("ord_", "#NS-104")}</span></div><button className="voice-chip" disabled={!currentResult || voiceState === "loading"} onClick={playVoice}><Headphones size={14} />{voiceState === "loading" ? "Synthesizing…" : voiceState === "playing" ? "Playing Polly" : voiceState === "fallback" ? "Text fallback" : currentResult ? "Play voice" : "Voice ready"}</button></div>
          <div className="transcript" aria-live="polite">
            {stage === 0 && !currentResult && <div className="incoming-call"><span className="ring-wrap"><span className="ring-pulse" /><PhoneIncoming size={19} /></span><div><b>Incoming call · {customer.name}</b><p>{currentCase.intent} · Order {currentCase.orderId.replace("ord_", "#NS-104")}</p><small>Start the call to answer</small></div></div>}
            {stage >= 1 && <div className="message hive-message"><span>HIVE</span><p>“Hi {firstName}, you&apos;ve reached Northstar Commerce support. What can I do for you?”</p></div>}
            {stage >= 2 && <div className="message customer-message"><span>{customer.name}</span><p>“{currentCase.issue}”</p></div>}
            {stage >= 3 && <div className="message hive-message"><span>HIVE</span><p>“{script.ask}”</p></div>}
            {stage >= 4 && <div className="message customer-message"><span>{customer.name}</span><p>“{script.detail}”</p></div>}
            {stage >= 5 && <div className="message hive-message"><span>HIVE</span><p>“{script.bridge}”</p></div>}
            {callState === "running" && stage >= 5 && !currentResult && <div className="typing" aria-label="HIVE is resolving"><i/><i/><i/></div>}
            {callError ? <div className="agent-wait"><span className="hive-orb"><ShieldCheck size={16} /></span><div><b>Resolution stopped safely</b><p>{callError}</p></div></div> : null}
            {currentResult && <div className="message hive-message resolution-turn"><span>HIVE · {tierLabel[currentResult.tier]}</span><p>“{currentResult.response}”</p></div>}
            {currentResult && !callError && <div className="message customer-message closing-turn"><span>{customer.name}</span><p>“{script.closing}”</p></div>}
            {currentResult?.candidate && <div className="learning-card"><div className="learning-icon"><Sparkles size={18} /></div><div><span>HIVE learned something new</span><h3>{currentResult.candidate.name}</h3><div className="validation-row"><span><Check size={13} />{currentResult.evaluation?.passed}/{currentResult.evaluation?.total} shadow cases</span><span><ShieldCheck size={13} />{currentResult.evaluation?.policyViolations ?? 0} policy violations</span><b>{currentResult.evaluation?.promoted ? "Promoted" : "Not promoted"}</b></div></div></div>}
            {currentResult && !callError && outcomeBanner(currentResult)}
          </div>
          <div className="call-controls">
            {!currentResult ? <button className="primary-button" disabled={callState === "running"} onClick={runCurrent}><span className="control-dot"><ChevronRight size={16} /></span>{callState === "running" ? "Resolving safely…" : `Start call ${String.fromCharCode(65 + index)}`}</button> : index < 3 ? <button className="primary-button" onClick={next}>Next guided call<ArrowRight size={16} /></button> : <Link className="primary-button" href="/demo/evaluation">View evaluation<ArrowRight size={16} /></Link>}
            <button className="round-control" aria-label="End call"><CircleStop size={18} /></button>
            <div className={callState === "running" ? "waveform active" : "waveform"} aria-hidden="true">{Array.from({length: 23}, (_, i) => <i key={i} style={{height: `${7 + ((i * 7) % 17)}px`}} />)}</div>
          </div>
          </>}
        </section>

        <aside className="insight-column">
          <section className="card resolution-card"><div className="card-title"><div><span>Under the hood</span><h2>{activeResult ? tierLabel[activeResult.tier] : "Awaiting call"}</h2></div>{activeResult && <span className={`tier-badge ${activeResult.tier}`}>{activeResult.tier === "tier_1_skill" ? `Fast response ${activeResult.telemetry?.tier1ModelCalls ?? 0} · Full reasoning 0` : activeResult.tier === "tier_2_reasoning" ? `Reasoning ${activeResult.telemetry?.tier2ModelCalls ?? activeResult.reasoningModelCalls}` : "Human judgment"}</span>}</div>
            <div className="route-rail">{(["tier_1_skill", "tier_2_reasoning", "tier_3_human"] as const).map((tier, tierIndex) => {
              const activeIndex = activeResult ? ["tier_1_skill", "tier_2_reasoning", "tier_3_human"].indexOf(activeResult.tier) : -1;
              const state = activeIndex === -1 ? "idle" : tierIndex < activeIndex ? "passed" : tierIndex === activeIndex ? "active" : "idle";
              const status = state === "active" ? ["Answered from learned memory", "Full reasoning engaged", "Human takeover"][tierIndex] : state === "passed" ? ["No confident match", "Couldn't verify safely", ""][tierIndex] : ["Checked first", "Only if needed", "Last resort"][tierIndex];
              return <div key={tier} className={`rail-row ${state} ${tier}`}><span className="rail-icon">{[<Database key="i" size={17}/>, <BrainCircuit key="i" size={17}/>, <UserRound key="i" size={17}/>][tierIndex]}</span><div><b>{["Memory", "Reasoning", "Human"][tierIndex]}</b><small>{status}</small></div>{state === "active" && <Check size={16} className="rail-check"/>}</div>;
            })}</div>
            <div className="log-console">
              <div className="log-head"><i/><i/><i/><b>hive · live trace</b><em>{activeResult ? `${activeResult.trace.length} events` : callState === "running" ? "streaming…" : "idle"}</em></div>
              <div className="log-body">
                {(activeResult?.trace ?? []).map((item, itemIndex) => <details className={`log-line k-${item.kind} s-${item.status}`} style={{ animationDelay: `${Math.min(itemIndex * 0.22, 2.6)}s` }} key={item.id}>
                  <summary><i>{String(itemIndex + 1).padStart(2, "0")}</i><em>{item.kind}</em><span>{item.label}</span></summary>
                  <p>{item.detail}</p>
                </details>)}
                {!activeResult && <div className="log-idle">{callState === "running" ? "resolving call… trace lands when the route completes" : "start a call to stream what HIVE does under the hood"}</div>}
              </div>
              {activeResult && <small className="log-hint">fast {activeResult.telemetry?.tier1ModelCalls ?? 0} · reasoning {activeResult.telemetry?.tier2ModelCalls ?? activeResult.reasoningModelCalls} · embeddings {activeResult.telemetry?.embeddingRequests ?? 0} · context {activeResult.telemetry?.contextRetrievalCount ?? 0} — click a line for detail</small>}
            </div>
          </section>

          <section className="card memory-card">
            <div className="memory-strip"><Database size={17}/><div><b>{promotedCount}</b><span>promoted skills</span></div><i/><div><b>{initialCallCount ? `${Math.round((initialTier1Count / initialCallCount) * 100)}%` : "—"}</b><span>Tier 1 coverage</span></div><em className="delta">Live SQL</em></div>
            {activeResult?.caseId === "call_d" && activeResult.tier === "tier_1_skill" && <div className="selected-skill learned"><span>Progressive intelligence proof</span><b>Previously required human · now Tier 1</b><small>Full reasoning calls: 0 · Human escalation: 0</small></div>}
            {activeResult?.candidate && <div className="selected-skill learned"><span>New organizational capability</span><b>{activeResult.candidate.name}</b><small>v{activeResult.candidate.version} · {activeResult.evaluation?.passed}/{activeResult.evaluation?.total} shadow cases · evidence linked</small></div>}
          </section>
        </aside>
      </div>
    </main>

    {testOpen && <div className="modal-backdrop" onMouseDown={() => setTestOpen(false)}><div className="test-modal card" role="dialog" aria-modal="true" aria-labelledby="test-call-title" onMouseDown={(event) => event.stopPropagation()}>
      <span className="eyebrow">Live test call</span>
      <h2 id="test-call-title">Call Northstar Commerce yourself</h2>
      <p className="test-intro">A live voice call: <b>Amazon Transcribe</b> converts your microphone audio to text after you pause, HIVE routes it through the real pipeline, and <b>Amazon Polly</b> speaks every reply. You&apos;re calling as <b>Ava Thompson</b>, whose fictional order <b>#NS-10405</b> ($120, paid by card) is delayed with an Aug 19 ETA.</p>
      <div className="context-chips"><span>Verified company context</span><div>{companyContext.filter((item) => item.id === "ctx_shipping_status").map((item) => <em key={item.id}>{item.title}</em>)}</div></div>
      <div className="test-suggestions">{["Where is my order? It was supposed to arrive already.", "What is the latest delivery estimate for my package?"].map((suggestion) => <span className="suggestion-chip" key={suggestion}>“{suggestion}”</span>)}</div>
      <p className="test-warning"><ShieldCheck size={14}/>Wait until HIVE finishes speaking, then talk. Your turn is sent after about one second of silence. HIVE asks whether the answer resolved your problem and closes only after your confirmation, manual hang-up, timeout, safety limit, or human handoff.</p>
      <div className="test-actions"><button className="ghost-button" onClick={() => setTestOpen(false)}>Cancel</button><button className="primary-button" onClick={() => void startVoiceCall()}><PhoneCall size={15}/>Start voice call</button></div>
    </div></div>}

    {proofOpen && <div className="drawer-backdrop" onMouseDown={() => setProofOpen(false)}><aside className="proof-drawer" role="dialog" aria-modal="true" aria-labelledby="system-proof-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="Close system proof" onClick={() => setProofOpen(false)}>×</button><span className="eyebrow">Technical evidence</span><h2 id="system-proof-title">System proof</h2><p className="drawer-intro">This panel reports the active runtime configuration and connection state without exposing credentials.</p>
      <div className="proof-section"><h3>CockroachDB memory</h3><div className="proof-line"><Database size={16}/><div><b>Relational + vector schema</b><span>{proof?.cockroach?.ok ? "Live SQL connection verified" : `Migration ready · ${proof?.cockroach?.reason ?? "checking connection"}`}</span></div><em className={proof?.cockroach?.ok ? "ready" : undefined}>{proof?.cockroach?.ok ? "Live" : "Gated"}</em></div><div className="code-proof">SELECT id, 1 - (embedding &lt;=&gt; $1) AS score<br/>FROM skill_embeddings<br/>WHERE tenant_id = $2 AND status = &apos;promoted&apos;</div></div>
      <div className="proof-section"><h3>Runtime evidence</h3>{[["Fast response model",proof?.aws?.tier1Model ?? "Loading proof…"],["Reasoning model",proof?.aws?.tier2Model ?? "Loading proof…"],["AWS integrations",proof ? JSON.stringify(proof.aws?.health ?? {}) : "Loading redacted configuration…"],["Company-context retrieval",proof?.cockroach?.companyContextRetrieval ?? "Checking CockroachDB context index"],["Managed MCP lookup",proof?.cockroach?.mcpEvidence ? `${proof.cockroach.mcpEvidence.query} · ${proof.cockroach.mcpEvidence.evidence?.resultCount ?? 0} results · top ${proof.cockroach.mcpEvidence.evidence?.topFamily ?? proof.cockroach.mcpEvidence.evidence?.topContext ?? "unknown"} at ${Number(proof.cockroach.mcpEvidence.evidence?.topScore ?? 0).toFixed(3)} · ${proof.cockroach.mcpEvidence.latencyMs ?? "?"} ms · ${proof.cockroach.mcpLookups?.length ?? 1} stored proof(s)` : "No verified MCP evidence available"],["Call D proof",proof?.callD?.proof === "promoted_skill_to_fast_response_without_full_reasoning" ? `Tier 1 · fast response ${proof.callD.tier1_model_calls ?? 0} · full reasoning ${proof.callD.tier2_model_calls ?? 0}` : "Run Call D to create live proof"],["Promotion transaction",`${results.filter((result) => result.candidate?.status === "promoted").length} persisted promotion(s) observed in this view`]].map(([title, detail]) => <div className="proof-line" key={title}><ShieldCheck size={16}/><div><b>{title}</b><span>{detail}</span></div></div>)}</div>
    </aside></div>}
  </>;
}
