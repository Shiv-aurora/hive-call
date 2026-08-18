# HIVE — Implementation Plan
## Phase-Wise Build Plan for Codex

**Companion document:** `VISION.md`  
**Goal:** Build the self-learning contact-center system end-to-end before spending time on the landing page.  
**Critical demo invariant:** A resolution must become a validated skill, and a later similar call must use that skill without another Tier-2 reasoning call.

---

## Final implementation override — August 2026

This deployed architecture supersedes older phase text where it conflicts:

- `TIER1_MODEL_ID=amazon.nova-micro-v1:0` is the fast conversational renderer. Its prompt contains only the customer utterance, selected promoted skill, verified facts, authoritative deterministic resolution, tone, and response constraints. Currency/date consistency checks fail closed to verified wording.
- `TIER2_MODEL_ID=amazon.nova-pro-v1:0` is the bounded reasoning and tool-use model. It receives targeted CockroachDB company context, active policies, related verified cases, customer state, and typed tools.
- `company_context.embedding VECTOR(1024)` and `company_context_embedding_idx` provide distributed semantic context retrieval alongside the separate learned-skill index.
- `model_invocations` and `call_telemetry` record role-specific model IDs, token usage, latency, embeddings, Polly characters, context retrievals, escalation, and skill reuse.
- Public expensive routes use CockroachDB-backed fixed-window limits. API Gateway additionally enforces 25 requests/second with burst 50. Guided Tier-2/Tier-3 proofs are replayed from CockroachDB after the first verified run to prevent uncontrolled repeat inference.
- Polly audio is content-addressed and reused from private S3.
- CloudWatch Embedded Metric Format reports requests, model calls/tokens, latency, rate-limit events, human escalation, and full-reasoning avoidance.
- Strict readiness requires both Bedrock roles, Titan, Polly, S3, SQL, all three vector indexes, vector probes, and persisted Managed MCP evidence.

The landing page is frozen and is not part of this implementation override.

---

# 0. How to use this plan

Codex must read `VISION.md` in full before starting.

The vision document is product authority.

This file is execution order.

Do not start from the landing page.

Do not spend substantial time on animation or brand polish until the core learning loop passes its verification gate.

---

# 1. AWS plugin / credential handoff map

This is the important handoff boundary.

## Codex can complete Phases 0–5 WITHOUT the AWS plugin

These phases build:

- repo;
- domain;
- simulated commerce backend;
- CockroachDB schema;
- vector-ready memory;
- Tier 1;
- provider-abstracted Tier 2 using Groq/local fallback if available;
- human handoff;
- Skill Compiler;
- shadow validation;
- complete local text learning loop.

### GO/NO-GO before AWS

Before you give Codex AWS access, it must prove locally:

```text
novel case
   ↓
Tier 2 or human resolution
   ↓
candidate skill
   ↓
shadow evaluation
   ↓
promotion
   ↓
new similar case
   ↓
Tier 1 skill
   ↓
NO Tier-2 LLM call
```

If this does not work, AWS integration will not save the project.

---

## Phase 6 requires the AWS plugin

# **AWS GATE A**

Use AWS access for:

- Amazon Bedrock;
- Amazon Polly;
- S3;
- IAM / secrets needed for those services.

Codex should stop before Phase 6 if AWS credentials/tooling are not available.

---

## Phase 7 requires the AWS plugin

# **AWS GATE B**

Use AWS access to deploy:

- Lambda;
- API Gateway;
- S3;
- CloudWatch;
- frontend hosting on AWS;
- secrets;
- environment configuration.

The submitted functional app must run on AWS.

---

## Phase 8 optionally requires the AWS plugin

# **AWS GATE C — OPTIONAL**

Amazon Connect real telephony.

This is P1.

Do not block the project on it.

---

## Phases 9–14 do not need new AWS provisioning

They use the deployed services but mostly cover:

- UI polish;
- landing page;
- evaluation;
- readiness;
- demo;
- submission.

---

# Phase 0 — Repository scaffold and product contracts
## AWS plugin required?

**NO**

## Goal

Create a clean architecture and prevent the app from turning into a generic chatbot.

## Recommended stack

Frontend:

- Next.js;
- TypeScript;
- React;
- simple CSS system / CSS modules;
- Zod.

Backend:

Prefer one language and one deployable backend.

Good options:

- Next.js server routes for simplest codebase;
- lightweight Node service if backend separation improves testing.

Do not introduce Python unless a concrete dependency requires it.

Persistence:

- CockroachDB-compatible PostgreSQL driver;
- explicit SQL migrations;
- vector columns/indexes.

Agent orchestration:

- small typed state machine first;
- LangGraph JS only if it simplifies the workflow.

Do not build an agent framework for its own sake.

## Repository shape

```text
hive/
  app/
    page.tsx                  # landing page, built last
    demo/
      page.tsx
      skills/
      evaluation/
  components/
    call/
    memory/
    skills/
    evaluation/
    system-proof/
  lib/
    domain/
    tools/
    skills/
    routing/
    agents/
    evaluation/
    providers/
    db/
    voice/
  db/
    migrations/
    seed/
  data/
    fixtures/
    evaluation/
  scripts/
  tests/
    unit/
    integration/
    e2e/
  docs/
    architecture.md
    memory-model.md
    safety.md
    demo.md
    aws-handoff.md
  VISION.md
  IMPLEMENTATION.md
  README.md
  LICENSE
```

## Core types

Create typed contracts for:

```text
Tenant
Customer
Order
Shipment
Refund
Promotion
Policy
PolicyVersion

Call
CallMessage
CallEvent
AgentRun
ToolCall

Resolution
ResolutionOutcome
HumanHandoff

Skill
SkillVersion
SkillApplicability
SkillStep
SkillEvaluation
ShadowCase

MemoryRead
PromotionEvent
DemotionEvent
AuditEvent
```

## Skill states

```text
candidate
shadow
promoted
degraded
deprecated
rejected
```

## Resolution tiers

```text
tier_1_skill
tier_2_reasoning
tier_3_human
```

## Verification

Phase passes when:

- repo installs cleanly;
- typecheck passes;
- basic tests run;
- core domain state can be serialized and validated.

---

# Phase 1 — Fictional support world and deterministic tools
## AWS plugin required?

**NO**

## Goal

Build a believable customer-support world before adding any LLM.

## Fictional company

**Northstar Commerce**

Create deterministic fixture data for:

- 20+ customers;
- 40+ orders;
- shipments;
- promotions;
- refunds;
- returns;
- subscriptions;
- policy versions.

## Typed tools

Implement:

```text
lookup_customer
lookup_order
lookup_shipment
lookup_refund
lookup_promotion
calculate_refund
lookup_policy
cancel_subscription
change_shipping_address
issue_refund
escalate_to_human
```

P0 call paths should mostly use read operations.

For write tools:

- simulate;
- require risk classification;
- verify preconditions;
- use idempotency.

## Policy engine

Create explicit support policies.

Example:

```text
refund_policy_v1
shipping_address_policy_v1
subscription_cancel_policy_v1
promotion_allocation_policy_v1
```

Rules must be deterministic and testable.

## Ground-truth outcomes

Every evaluation case needs:

- expected resolution class;
- expected tools;
- expected escalation behavior;
- policy version;
- required response facts.

This will later make skill validation possible.

## Verification

Phase passes when 20+ support cases can be solved deterministically by the fixture oracle.

---

# Phase 2 — CockroachDB memory foundation
## AWS plugin required?

**NO**

## External dependency

CockroachDB local instance or CockroachDB Cloud credentials.

AWS is not required.

## Goal

Make CockroachDB the authoritative shared memory before implementing agents.

## Migrations

Create tables for:

```text
tenants
customers
orders
shipments
refunds
promotions
policies
policy_versions

calls
call_messages
call_events
agent_runs
tool_calls
resolutions
resolution_outcomes
human_handoffs

skills
skill_versions
skill_source_cases
skill_policy_dependencies
skill_embeddings

shadow_cases
skill_evaluations
promotion_events
demotion_events

agent_memory_reads
audit_events
```

## Important constraints

- tenant scoping;
- immutable IDs;
- one active version pointer per promoted skill family;
- idempotency keys on resolution/finalization;
- foreign keys for lineage;
- status constraints;
- created/updated timestamps.

## Vector preparation

Add vector columns for:

- normalized calls/cases;
- skill retrieval text.

If embeddings are unavailable locally, use deterministic fixture vectors or a local provider only for development.

The production embeddings will be generated through AWS later.

## Transaction helpers

Build retryable transaction wrapper.

Use it for:

- resolution finalization;
- candidate creation;
- promotion;
- supersession;
- demotion.

## Seed data

Seed:

- 5–8 promoted skills;
- 2 candidates;
- 1 deprecated skill;
- 1 degraded skill;
- source cases and evaluation history.

## Verification

Phase passes when:

- migrations apply from zero;
- seed works;
- transaction rollback tests pass;
- tenant-isolation tests pass;
- current skill-version queries are deterministic.

---

# Phase 3 — Tier 1: Compiled skill execution
## AWS plugin required?

**NO**

## Goal

Build the most important cost-saving path first.

No general-purpose reasoning model.

## Skill DSL

Implement a bounded declarative skill format.

Do NOT execute generated JavaScript/Python.

Skill contains:

```text
intent
description
applicability predicates
required context
typed tool steps
computations
assertions
response template
escalation conditions
policy dependencies
```

## Retrieval

Implement:

1. normalize customer problem;
2. retrieve skill candidates;
3. filter `status == promoted`;
4. enforce tenant;
5. enforce policy compatibility;
6. validate applicability;
7. score;
8. choose one skill or return no match.

Until real embeddings are wired, allow deterministic lexical/fixture matching behind the same interface.

## Executor

Execute steps sequentially.

Every step records:

- input;
- output;
- latency;
- success/failure;
- evidence.

## Verification

Create tests proving:

- known late-shipment question resolves Tier 1;
- no reasoning provider is invoked;
- ambiguous match refuses Tier 1;
- invalid policy version refuses Tier 1;
- failed assertion escalates instead of bluffing.

## Phase metric

Expose:

```text
reasoning_model_calls = 0
resolution_tier = tier_1_skill
skill_id = ...
```

This becomes part of the demo.

---

# Phase 4 — Tier 2 reasoning agent and provider abstraction
## AWS plugin required?

**NO initially**

Use Groq or a mocked provider to build the flow.

AWS Bedrock becomes primary in Phase 6.

## Goal

Handle the long tail without hard-coding every resolution.

## Provider interface

```ts
interface ReasoningProvider {
  runResolution(input: ResolutionInput): Promise<ResolutionResult>;
  compileSkill(input: SkillCompileInput): Promise<CandidateSkill>;
}
```

Implement:

- mock deterministic provider;
- Groq provider if `GROQ_API_KEY` is present;
- Bedrock provider interface stub.

## Tier-2 tools

The model can request approved tools.

Use structured tool calls.

Hard cap:

- max model calls;
- max tool calls;
- max wall time.

## Context

Provide:

- customer issue;
- structured customer/order context;
- current policy;
- related historical cases;
- related skills;
- tool descriptions.

Do not dump the whole database.

## Output contract

Require:

```text
status
resolution summary
customer-facing response
evidence refs
tools used
confidence
escalate boolean
escalation reason
candidate learning value
```

## Verification

Tier 2 must solve Call B:

> partial promotional refund

without a pre-existing promoted skill.

The deterministic outcome oracle must confirm correctness.

---

# Phase 5 — Human handoff + skill learning flywheel
## AWS plugin required?

**NO**

## Goal

Complete the entire core product locally.

This is the most important phase.

## Human console

When Tier 2 escalates, show:

- customer;
- issue;
- transcript;
- tools already checked;
- evidence;
- reason for escalation;
- typed tool controls;
- response box;
- resolve/escalate state.

## Resolution capture

When human marks resolved, store:

- final answer;
- tools;
- policy;
- outcome;
- rationale;
- structured trace.

## Skill Compiler

Take a verified Tier-2 or human resolution and propose a candidate DSL skill.

Validate:

- schema;
- tool names;
- allowed computations;
- policy dependencies;
- escalation conditions;
- applicability bounds.

Invalid candidate → reject.

## Shadow evaluator

Build deterministic replay runner.

For each candidate:

1. find matching shadow cases;
2. execute candidate;
3. compare against oracle;
4. record correctness;
5. record policy violations;
6. record false-positive scope.

## Promotion rule

Initial P0 requirements:

- minimum 5 relevant shadow cases;
- 100% required safety assertions;
- configurable correctness threshold;
- zero prohibited actions.

Do not hard-code 95% if dataset is tiny.

Use a threshold defined in config and report the exact setting.

## Promotion transaction

Within one transaction:

- finalize shadow evaluation;
- set candidate promoted;
- supersede prior version if relevant;
- write promotion event;
- update active pointer;
- write audit event.

## Core go/no-go demo

Call C:

1. no Tier-1 match;
2. Tier 2 cannot solve;
3. human resolves;
4. skill compiler generates candidate;
5. shadow suite passes;
6. skill promoted.

Then Call D:

1. new customer / different wording;
2. new skill matches;
3. Tier 1 resolves;
4. reasoning provider call count remains 0;
5. no human handoff.

## GO/NO-GO GATE

**Do not proceed to AWS or UI polish unless this works repeatedly.**

Run the complete learning loop 10 times from reset fixtures.

It must be deterministic.

---

# Phase 6 — AWS intelligence + voice
## AWS plugin required?

# **YES — AWS GATE A**

This is the first phase where you need to give Codex the AWS plugin / credentials.

## Goal

Replace local placeholders with meaningful AWS usage.

The hackathon requires the agentic app to be deployed on AWS, and AWS integration must be meaningful.

## 6A. Amazon Bedrock

Implement production `BedrockReasoningProvider`.

Use Bedrock Converse / ConverseStream.

Responsibilities:

- Tier-2 reasoning;
- Skill Compiler;
- optional bounded skill-revision reasoning.

Use:

- tool calling;
- structured outputs where supported;
- strict schemas;
- call budgets;
- explicit model ID configuration.

Do not allow the model direct database credentials.

## Model choice

Codex should inspect currently available Bedrock models in the provided region.

Priorities:

1. reliable tool use;
2. structured output;
3. strong reasoning;
4. latency acceptable for call-center demo.

Do not hard-code an unavailable model.

Record selected model in System Proof.

## 6B. Embeddings

Use an AWS Bedrock embedding model for:

- call/case embeddings;
- skill embeddings.

Store vectors in CockroachDB.

Build the real Distributed Vector Index.

Re-run retrieval tests using actual embeddings.

## 6C. Amazon Polly

Implement:

```text
POST /api/voice/synthesize
```

Use Polly generative TTS.

Initial default:

`Ruth`, engine `generative`, US English.

Audition:

- Ruth;
- Danielle;
- Matthew.

Select the best voice after listening.

Fallback:

- neural Joanna or Matthew.

Cache demo audio in S3 when useful.

## 6D. S3

Bucket for:

- Polly audio;
- evaluation artifacts;
- sanitized call replay artifacts.

Use lifecycle configuration if appropriate.

## 6E. Secrets

Store:

- Bedrock config;
- Groq key if used;
- Cockroach connection;
- MCP credentials;

using deployment secrets / Secrets Manager.

Never expose them client-side.

## AWS Gate A verification

Phase passes when:

- Call B uses Bedrock;
- skill compiler uses Bedrock;
- real embeddings are stored in CockroachDB;
- vector retrieval passes;
- Polly speaks HIVE's response;
- System Proof displays redacted AWS/Cockroach evidence.

---

# Phase 7 — AWS deployment
## AWS plugin required?

# **YES — AWS GATE B**

## Goal

Put the submitted application on AWS.

Do not rely on Vercel as the official functional demo.

## Recommended deployment architecture

Keep it simple:

```text
Browser
  ↓
AWS-hosted frontend
  ↓
API Gateway
  ↓
Lambda
  ├── HIVE orchestration
  ├── Bedrock
  ├── Polly
  ├── CockroachDB
  └── S3
```

Frontend options:

- AWS Amplify Hosting;
- S3 + CloudFront for static frontend;
- another AWS-hosted option justified by the chosen Next.js architecture.

Codex should choose the least risky option compatible with the repository.

## CDK

Use AWS CDK.

Suggested stacks:

```text
HiveDataStack
HiveApiStack
HiveWebStack
HiveObservabilityStack
```

## Lambda

Endpoints:

- calls;
- message/step;
- resolve;
- human handoff;
- skill compile;
- shadow evaluate;
- skill promote;
- skill detail;
- evaluation;
- Polly synth;
- health.

Use async jobs only where necessary.

For a small demo, avoid unnecessary queues/state machines.

## API Gateway

Configure:

- CORS;
- throttling;
- sensible timeout behavior;
- JSON limits.

## CloudWatch

Track:

- function errors;
- agent latency;
- Bedrock calls;
- Tier-1/Tier-2 counts;
- skill compiler failures;
- shadow evaluator failures.

## Health

Implement:

```text
/api/health
/api/ready
/api/version
```

Readiness includes:

- CockroachDB connectivity;
- configured Bedrock model;
- Polly availability status;
- S3 bucket.

## AWS Gate B verification

From a clean browser:

1. open AWS-hosted URL;
2. reset demo;
3. complete all four guided calls;
4. hear Polly;
5. observe real Bedrock call;
6. observe skill promotion;
7. complete future Tier-1 call;
8. open System Proof;
9. no localhost dependency.

---

# Phase 8 — Optional Amazon Connect integration
## AWS plugin required?

# **YES — AWS GATE C**

## Priority

**P1 / OPTIONAL**

Do not block submission on this.

## Goal

Let a real phone call enter HIVE.

## Architecture

```text
phone call
   ↓
Amazon Connect
   ↓
contact flow
   ↓
Lambda / HIVE API
   ↓
Tier routing
```

Potentially use:

- Connect voice;
- Lambda blocks;
- Polly voice;
- contact attributes.

## Stop condition

If setup becomes brittle or requires substantial account/telephony approval:

**stop immediately and keep the web call simulator.**

The web simulator already demonstrates the innovation.

---

# Phase 9 — App UI/UX polish
## AWS plugin required?

**NO NEW AWS ACCESS**

## Goal

Make the working app feel like a real product.

The UI should be inspired by:

> `https://clay-ai-lms.vercel.app`

Use the same broad principles:

- light;
- airy;
- calm;
- subtle blue/neutral surfaces;
- soft borders;
- restrained shadows;
- readable typography;
- generous whitespace;
- small amount of motion;
- no visual AI clichés.

## Important

Do not copy Clay's product content or exact component arrangement.

Use its design quality and restraint.

## Main route

`/demo`

Primary screen:

- current call;
- transcript;
- voice state;
- resolution tier;
- memory activity;
- learning result.

Secondary surfaces:

- `/demo/skills`
- `/demo/evaluation`

System Proof is a drawer.

## Call state animation

Use subtle transitions:

```text
Searching memory...
No promoted skill
Reasoning agent investigating...
Resolved
Compiling candidate...
Shadow test 1/5...
5/5 passed
Skill promoted
```

Do not show hidden chain-of-thought.

Only show high-level process states.

## Verify

Test:

- 1440×900;
- 1920×1080;
- 1280×720.

No broken scroll.

No tiny text.

No dark-mode default.

---

# Phase 10 — Landing page
## AWS plugin required?

**NO NEW AWS ACCESS**

## IMPORTANT

**BUILD THIS AFTER THE APP IS COMPLETE.**

The landing page must be informed by the actual product screenshots and real evaluation numbers.

Do not invent the marketing site first.

## Route

`/`

## Goal

Explain HIVE in under 10 seconds.

## Hero

Headline:

> **Every escalation teaches HIVE how not to escalate next time.**

Support:

> HIVE compiles successful AI and human resolutions into validated skills, so repeated problems move from expensive reasoning to fast autonomous execution.

Primary CTA:

> **View demo**

Secondary:

> See how it learns

## Hero visual

Use real app components.

Show:

```text
Human resolves
     ↓
Candidate skill
     ↓
5/5 shadow tests
     ↓
Promoted
     ↓
Next call: Tier 1
```

## Sections

Keep short.

### Resolve

AI handles known work or investigates the long tail.

### Learn

Resolved cases become candidate skills.

### Validate

Shadow evaluation prevents bad memory from going live.

### Compound

Promoted skills reduce future reasoning and escalation.

### Proof

Use real evaluation results.

### Architecture

Small clean diagram.

## Style

Clay-inspired.

Minimal copy.

No stock images.

No giant logo wall.

No long FAQ unless needed for submission.

---

# Phase 11 — Evaluation hardening
## AWS plugin required?

**NO NEW AWS ACCESS**

## Goal

Prove the memory benefit rather than only demo it.

## Dataset

Target 30–50 deterministic support cases.

Split:

- discovery;
- shadow;
- held-out final.

## Run A — Memory disabled

Disable Tier 1.

Measure:

- Tier-2 calls;
- human escalation;
- correctness;
- policy violations;
- resolution steps.

## Run B — Memory enabled

Promoted skills active.

Measure same metrics.

## Required output

Create:

`evaluation/report.json`

and:

`evaluation/report.md`

Include:

```text
Tier-1 coverage
Tier-2 reasoning calls
Human escalations
Resolution accuracy
Skill selection precision
Policy violations
Median steps
```

## Critical rule

Memory-enabled quality must not get worse simply to reduce model use.

If it does, tighten Tier-1 matching.

## Demo metric

Use a real line such as:

> **17 of 40 held-out calls resolved through validated skills with zero Tier-2 model calls.**

Only if the evaluation truly says that.

---

# Phase 12 — Production-readiness pass
## AWS plugin required?

**NO NEW AWS PROVISIONING**

## Goal

Win Product Readiness points.

## Audit

### Database

- transaction retries;
- indexes;
- vector index health;
- migrations;
- tenant isolation;
- idempotency.

### Agents

- tool budgets;
- provider timeouts;
- fallback;
- structured output;
- no unsupported success claims.

### Skills

- versioning;
- promotion;
- demotion;
- evidence;
- policy dependencies.

### Security

- secrets;
- injection boundary;
- log redaction;
- input validation;
- authorization.

### AWS

- least-privilege IAM;
- CloudWatch;
- health checks;
- error alarms if practical.

### UI

- clear errors;
- no fake loading;
- accessible controls;
- reduced motion;
- keyboard navigation where practical.

## Failure demo

Include one promoted skill invalidated by policy change.

Show HIVE degrading it and routing the next case to Tier 2.

This is a strong production-readiness proof.

---

# Phase 13 — Guided demo freeze
## AWS plugin required?

**NO NEW AWS ACCESS**

## Goal

Make the three-minute Devpost video trivial to record.

## Exact sequence

### 0:00–0:20

Landing page.

> Every escalation teaches HIVE how not to escalate next time.

Click `View demo`.

### 0:20–0:40 — Call A

Known shipping problem.

Tier 1.

Point out:

> `0 reasoning calls`

### 0:40–1:10 — Call B

Novel promotional refund.

Tier 2 Bedrock solves.

Candidate skill appears.

Shadow suite passes.

Skill promoted.

### 1:10–1:45 — Call C

Hard bundle/mixed-tender case.

Tier 2 cannot safely solve.

Human takeover.

Human resolves.

HIVE compiles the resolution.

Candidate passes shadow validation.

Skill promoted.

### 1:45–2:10 — Call D

New customer with same underlying class.

HIVE now resolves Tier 1.

Point out:

> no Bedrock reasoning call  
> no human escalation

### 2:10–2:35

Evaluation.

Show before/after memory ablation.

### 2:35–2:50

System Proof.

Show:

- CockroachDB vector retrieval;
- Managed MCP memory lookup;
- Bedrock;
- Polly;
- AWS deployment.

### 2:50–3:00

Close:

> **A solved call should never be learned only once. HIVE turns every verified resolution into capability the entire contact center can reuse.**

## Reliability

Run guided sequence from reset 10 times.

No failures.

---

# Phase 14 — Submission package
## AWS plugin required?

**NO**

## Required

The hackathon requires:

- public repo;
- open-source license;
- functional demo;
- text description;
- <3-minute public video;
- footage showing CockroachDB memory layer;
- explanation of CockroachDB tools;
- explanation of AWS services.

## README

Lead with:

> **Every escalation teaches HIVE how not to escalate next time.**

Then:

1. problem;
2. learning loop;
3. demo;
4. architecture;
5. memory model;
6. evaluation;
7. setup;
8. deployment;
9. limitations.

Do not lead with framework names.

## Architecture diagram

Show:

```text
Customer / Call simulator
          ↓
HIVE Orchestrator on AWS
    ┌─────┼─────┐
 Tier 1 Tier 2 Human
    └─────┼─────┘
      Resolution
          ↓
     Skill Compiler
          ↓
    Shadow Evaluator
          ↓
      CockroachDB
   relational + vector
          ↺
```

## Submission claims

Allowed:

- actual held-out evaluation results;
- actual model-call reduction;
- actual skill coverage;
- real AWS deployment;
- real CockroachDB tools.

Avoid:

- "99% automation";
- unmeasured dollar savings;
- production customer claims;
- human replacement framing.

---

# Critical dependency graph

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ↓
Phase 5  ← LOCAL CORE GO/NO-GO
  ↓
[AWS PLUGIN HANDOFF]
  ↓
Phase 6  ← Bedrock + Polly + vectors
  ↓
Phase 7  ← AWS deployment
  ↓
Phase 9  ← UI polish
  ↓
Phase 10 ← Landing page LAST
  ↓
Phase 11 ← Evaluation
  ↓
Phase 12 ← Readiness
  ↓
Phase 13 ← Demo
  ↓
Phase 14 ← Submission
```

Phase 8 Amazon Connect can branch from Phase 7 if time allows.

---

# Hard stop conditions

Codex should stop and report instead of faking completion if:

1. CockroachDB vector index cannot be created.
2. Managed MCP cannot make a real runtime memory read.
3. human resolution cannot produce a valid skill.
4. candidate cannot pass real shadow evaluation.
5. future call still invokes Tier 2 despite promoted applicable skill.
6. Bedrock cannot be called with the provided AWS environment.
7. Polly is not producing real voice.
8. AWS deployment cannot run the complete guided path.

No sponsor integration should be represented as live when it is a stub.

---

# Test matrix

Minimum automated coverage:

## Unit

- DSL validation;
- applicability predicates;
- calculations;
- escalation conditions;
- skill scoring;
- policy versioning;
- promotion thresholds.

## Database

- migrations;
- transaction retry;
- idempotency;
- tenant isolation;
- vector retrieval;
- active version uniqueness.

## Agent

- Tier 1 no LLM;
- Tier 2 tool use;
- forced human escalation;
- provider timeout;
- invalid model output;
- missing evidence.

## Learning

- human resolution → candidate;
- candidate → shadow;
- shadow → promote;
- promote → next Tier 1;
- failure → degrade;
- policy change → demote.

## E2E

- Call A;
- Call B;
- Call C;
- Call D;
- evaluation;
- System Proof.

---

# Traceability file

Codex must maintain:

`docs/TRACEABILITY.md`

Columns:

| Requirement | Phase | Module | Test | Demo step | Status |
|---|---|---|---|---|---|

P0 requirements cannot silently disappear.

---

# Final definition of done

The codebase is complete when:

- the app is on AWS;
- CockroachDB is persistent memory;
- vector indexing is live;
- Managed MCP is used in runtime;
- Bedrock is the submitted reasoning provider;
- Polly is the submitted voice;
- known cases use Tier 1 without reasoning;
- novel solvable cases use Tier 2;
- unresolved cases hand off to human;
- human/AI resolutions create candidate skills;
- shadow evaluation controls promotion;
- future similar calls use the promoted skill;
- bad skills can be degraded;
- memory ablation shows fewer reasoning calls/escalations without degrading correctness;
- UI is clean and Clay-inspired;
- landing page was built after the app;
- guided demo runs deterministically;
- README and submission package are complete.

The single non-negotiable proof is:

> **HIVE learns a new support capability during the demo, stores it in CockroachDB, and the next agent uses it without rediscovering the solution.**
