"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, Check, ChevronRight, CircleStop, Database, Headphones, RotateCcw, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { customers, guidedCases } from "@/data/fixtures/world";
import type { ResolutionResult } from "@/lib/domain/types";

const tierLabel = { tier_1_skill: "Tier 1 · Known issue", tier_2_reasoning: "Tier 2 · Reasoning", tier_3_human: "Tier 3 · Human takeover" } as const;
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
  const currentCase = guidedCases[index];
  const currentResult = results[index];
  const customer = customers.find((value) => value.id === currentCase.customerId)!;

  async function runCurrent() {
    if (currentResult) return;
    setCallState("running");
    setCallError(undefined);
    try {
      const response = await fetch("/api/demo/reason", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId: currentCase.id }) });
      if (!response.ok) throw new Error("The live CockroachDB resolution path is unavailable");
      const payload = await response.json() as { result: ResolutionResult };
      setResults((value) => [...value, payload.result]);
      if (payload.result.candidate && !payload.result.trace.some((item) => item.label === "Persisted guided proof replayed")) setPromotedCount((value) => value + 1);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Resolution failed safely");
    } finally {
      setCallState("idle");
    }
  }
  function next() { if (index < guidedCases.length - 1) setIndex((value) => value + 1); }
  function reset() { setResults([]); setIndex(0); setProofOpen(false); setCallError(undefined); }
  async function openProof() {
    setProofOpen(true);
    try { const response = await fetch("/api/system-proof", { cache: "no-store" }); setProof(await response.json() as SystemProof); } catch { setProof({}); }
  }
  async function playVoice() {
    if (!currentResult) return;
    setVoiceState("loading");
    try {
      const response = await fetch("/api/voice/synthesize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: currentResult.response, cacheKey: currentResult.caseId }) });
      if (!response.ok) throw new Error("Voice unavailable");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setVoiceState("idle"); };
      await audio.play(); setVoiceState("playing");
    } catch { setVoiceState("fallback"); }
  }

  return <>
    <main className="demo-wrap">
      <section className="demo-heading">
        <div><span className="eyebrow">Progressive intelligence</span><h1>Known problems move to <span className="hl">the fast path</span></h1><p>Use learned memory for known territory. Spend stronger reasoning only on genuinely new problems.</p></div>
        <div className="heading-actions"><button className="ghost-button" onClick={reset}><RotateCcw size={15} />Reset demo</button><button className="ghost-button" onClick={openProof}><Database size={15} />System proof</button></div>
      </section>

      <div className="progress-strip" aria-label={`Guided call ${index + 1} of 4`}>
        {guidedCases.map((item, itemIndex) => <button key={item.id} disabled={itemIndex > results.length} onClick={() => setIndex(itemIndex)} className={itemIndex === index ? "progress-step current" : itemIndex < results.length ? "progress-step done" : "progress-step"}>
          <span>{itemIndex < results.length ? <Check size={13} /> : String.fromCharCode(65 + itemIndex)}</span><div><b>Call {String.fromCharCode(65 + itemIndex)}</b><small>{["Known · fast response", "Reasoning learns", "Human teaches", "Human → Tier 1"][itemIndex]}</small></div>
        </button>)}
      </div>

      <div className="demo-grid">
        <section className="call-panel card">
          <div className="call-bar"><div className="live-state"><span className="live-pulse" />{currentResult ? "Call complete" : "Live support call"}</div><span>00:{currentResult ? "48" : "12"}</span></div>
          <div className="customer-row"><div className="customer-avatar">{customer.name.split(" ").map((part) => part[0]).join("").slice(0,2)}</div><div><b>{customer.name}</b><span>Order {currentCase.orderId.replace("ord_", "#NS-104")}</span></div><button className="voice-chip" disabled={!currentResult || voiceState === "loading"} onClick={playVoice}><Headphones size={14} />{voiceState === "loading" ? "Synthesizing…" : voiceState === "playing" ? "Playing Polly" : voiceState === "fallback" ? "Text fallback" : currentResult ? "Play voice" : "Voice ready"}</button></div>
          <div className="transcript" aria-live="polite">
            <div className="message customer-message"><span>Customer</span><p>“{currentCase.issue}”</p></div>
            {!currentResult && <div className="agent-wait"><span className="hive-orb"><Sparkles size={16} /></span><div><b>HIVE is ready</b><p>Start the call to route this case through memory.</p></div></div>}
            {callError ? <div className="agent-wait"><span className="hive-orb"><ShieldCheck size={16} /></span><div><b>Resolution stopped safely</b><p>{callError}</p></div></div> : null}
            {currentResult && <div className="message hive-message"><span>HIVE · {tierLabel[currentResult.tier]}</span><p>“{currentResult.response}”</p></div>}
            {currentResult?.candidate && <div className="learning-card"><div className="learning-icon"><Sparkles size={18} /></div><div><span>HIVE learned something new</span><h3>{currentResult.candidate.name}</h3><div className="validation-row"><span><Check size={13} />{currentResult.evaluation?.passed}/{currentResult.evaluation?.total} shadow cases</span><span><ShieldCheck size={13} />{currentResult.evaluation?.policyViolations ?? 0} policy violations</span><b>{currentResult.evaluation?.promoted ? "Promoted" : "Not promoted"}</b></div></div></div>}
          </div>
          <div className="call-controls">
            {!currentResult ? <button className="primary-button" disabled={callState === "running"} onClick={runCurrent}><span className="control-dot"><ChevronRight size={16} /></span>{callState === "running" ? "Resolving safely…" : `Start call ${String.fromCharCode(65 + index)}`}</button> : index < 3 ? <button className="primary-button" onClick={next}>Next guided call<ArrowRight size={16} /></button> : <Link className="primary-button" href="/demo/evaluation">View evaluation<ArrowRight size={16} /></Link>}
            <button className="round-control" aria-label="End call"><CircleStop size={18} /></button>
            <div className={callState === "running" ? "waveform active" : "waveform"} aria-hidden="true">{Array.from({length: 23}, (_, i) => <i key={i} style={{height: `${7 + ((i * 7) % 17)}px`}} />)}</div>
          </div>
        </section>

        <aside className="insight-column">
          <section className="card resolution-card"><div className="card-title"><div><span>Resolution route</span><h2>{currentResult ? tierLabel[currentResult.tier] : "Awaiting call"}</h2></div>{currentResult && <span className={`tier-badge ${currentResult.tier}`}>{currentResult.tier === "tier_1_skill" ? `Fast response ${currentResult.telemetry?.tier1ModelCalls ?? 0} · Full reasoning 0` : currentResult.tier === "tier_2_reasoning" ? `Reasoning ${currentResult.telemetry?.tier2ModelCalls ?? currentResult.reasoningModelCalls}` : "Human judgment"}</span>}</div>
            <div className="route-rail">{(["tier_1_skill", "tier_2_reasoning", "tier_3_human"] as const).map((tier, tierIndex) => {
              const activeIndex = currentResult ? ["tier_1_skill", "tier_2_reasoning", "tier_3_human"].indexOf(currentResult.tier) : -1;
              const state = activeIndex === -1 ? "idle" : tierIndex < activeIndex ? "passed" : tierIndex === activeIndex ? "active" : "idle";
              const status = state === "active" ? ["Answered from learned memory", "Full reasoning engaged", "Human takeover"][tierIndex] : state === "passed" ? ["No confident match", "Couldn't verify safely", ""][tierIndex] : ["Checked first", "Only if needed", "Last resort"][tierIndex];
              return <div key={tier} className={`rail-row ${state} ${tier}`}><span className="rail-icon">{[<Database key="i" size={17}/>, <BrainCircuit key="i" size={17}/>, <UserRound key="i" size={17}/>][tierIndex]}</span><div><b>{["Memory", "Reasoning", "Human"][tierIndex]}</b><small>{status}</small></div>{state === "active" && <Check size={16} className="rail-check"/>}</div>;
            })}</div>
            <div className="path-list">
              {(currentResult?.trace ?? []).filter((item) => ["memory","context","routing","conversation","reasoning","human","promotion"].includes(item.kind)).map((item) => <div className="path-item" key={item.id}><span className={item.status}><Check size={13} /></span><div><b>{item.label}</b><small>{item.detail}</small></div></div>)}
              {!currentResult && <div className="path-empty"><div className="search-ring" /><p>HIVE checks promoted skills before using a reasoning model.</p></div>}
            </div>
          </section>

          <section className="card memory-card"><div className="card-title"><div><span>Shared memory</span><h2>{promotedCount} promoted skills</h2></div><Database size={18} /></div>
            <div className="metric-row"><div><span>Persisted Tier 1 coverage</span><b>{initialCallCount ? `${Math.round((initialTier1Count / initialCallCount) * 100)}%` : "No runs"}</b></div><div className="delta">Live SQL</div></div>
            {currentResult?.skillName && <div className="selected-skill"><span>Selected skill</span><b>{currentResult.skillName}</b><small>{currentResult.skillId} · policy compatible</small></div>}
            {currentResult && <div className="selected-skill"><span>Inference and context</span><b>{currentResult.telemetry?.contextRetrievalCount ?? 0} broader context objects</b><small>{currentResult.telemetry?.tier1ModelCalls ?? 0} fast-response call · {currentResult.telemetry?.tier2ModelCalls ?? currentResult.reasoningModelCalls} full reasoning call(s) · {currentResult.telemetry?.embeddingRequests ?? 0} embedding request(s)</small></div>}
            {currentResult?.caseId === "call_d" && currentResult.tier === "tier_1_skill" && <div className="selected-skill learned"><span>Progressive intelligence proof</span><b>Previously required human · now Tier 1</b><small>Full reasoning calls: 0 · Human escalation: 0</small></div>}
            {currentResult?.candidate && <div className="selected-skill learned"><span>New organizational capability</span><b>{currentResult.candidate.name}</b><small>v{currentResult.candidate.version} · {currentResult.evaluation?.passed}/{currentResult.evaluation?.total} shadow cases · evidence linked</small></div>}
          </section>
        </aside>
      </div>
    </main>

    {proofOpen && <div className="drawer-backdrop" onMouseDown={() => setProofOpen(false)}><aside className="proof-drawer" role="dialog" aria-modal="true" aria-labelledby="system-proof-title" onMouseDown={(event) => event.stopPropagation()}><button className="drawer-close" aria-label="Close system proof" onClick={() => setProofOpen(false)}>×</button><span className="eyebrow">Technical evidence</span><h2 id="system-proof-title">System proof</h2><p className="drawer-intro">This panel reports the active runtime configuration and connection state without exposing credentials.</p>
      <div className="proof-section"><h3>CockroachDB memory</h3><div className="proof-line"><Database size={16}/><div><b>Relational + vector schema</b><span>{proof?.cockroach?.ok ? "Live SQL connection verified" : `Migration ready · ${proof?.cockroach?.reason ?? "checking connection"}`}</span></div><em className={proof?.cockroach?.ok ? "ready" : undefined}>{proof?.cockroach?.ok ? "Live" : "Gated"}</em></div><div className="code-proof">SELECT id, 1 - (embedding &lt;=&gt; $1) AS score<br/>FROM skill_embeddings<br/>WHERE tenant_id = $2 AND status = &apos;promoted&apos;</div></div>
      <div className="proof-section"><h3>Runtime evidence</h3>{[["Fast response model",proof?.aws?.tier1Model ?? "Loading proof…"],["Reasoning model",proof?.aws?.tier2Model ?? "Loading proof…"],["AWS integrations",proof ? JSON.stringify(proof.aws?.health ?? {}) : "Loading redacted configuration…"],["Company-context retrieval",proof?.cockroach?.companyContextRetrieval ?? "Checking CockroachDB context index"],["Managed MCP lookup",proof?.cockroach?.mcpEvidence ? `${proof.cockroach.mcpEvidence.query} · ${proof.cockroach.mcpEvidence.evidence?.resultCount ?? 0} results · top ${proof.cockroach.mcpEvidence.evidence?.topFamily ?? proof.cockroach.mcpEvidence.evidence?.topContext ?? "unknown"} at ${Number(proof.cockroach.mcpEvidence.evidence?.topScore ?? 0).toFixed(3)} · ${proof.cockroach.mcpEvidence.latencyMs ?? "?"} ms · ${proof.cockroach.mcpLookups?.length ?? 1} stored proof(s)` : "No verified MCP evidence available"],["Call D proof",proof?.callD?.proof === "promoted_skill_to_fast_response_without_full_reasoning" ? `Tier 1 · fast response ${proof.callD.tier1_model_calls ?? 0} · full reasoning ${proof.callD.tier2_model_calls ?? 0}` : "Run Call D to create live proof"],["Promotion transaction",`${results.filter((result) => result.candidate?.status === "promoted").length} persisted promotion(s) observed in this view`]].map(([title, detail]) => <div className="proof-line" key={title}><ShieldCheck size={16}/><div><b>{title}</b><span>{detail}</span></div></div>)}</div>
    </aside></div>}
  </>;
}
