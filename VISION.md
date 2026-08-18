# HIVE — Vision
## A Self-Learning Contact Center That Compiles Resolutions Into Skills

**Status:** Hackathon product source of truth  
**Hackathon:** CockroachDB × AWS — Build with Agentic Memory  
**Working name:** HIVE  
**Tagline:** **Every escalation teaches HIVE how not to escalate next time.**  
**Product category:** Self-learning contact-center agent infrastructure  
**Primary demo form factor:** Minimal web contact-center simulator with voice, memory inspection, and a guided learning loop  
**Primary user:** Customer-support / contact-center operations teams  
**Primary end customer interaction:** Voice support call  
**Core thesis:** A solved support case should become reusable organizational capability, not disappear into a transcript.

---

## Final routing architecture — authoritative August 2026 update

The approved landing page is frozen. For product behavior, this section supersedes older statements below that describe Tier 1 as making no model call at all.

- **Tier 1 — Known territory:** CockroachDB retrieves exactly one promoted, tenant-scoped, policy-compatible skill. HIVE executes its bounded tools and assertions, then Amazon Nova Micro turns only the verified structured facts into natural conversation. Tier 1 makes no **full reasoning** call; the fast model cannot discover or change the solution.
- **Tier 2 — Unknown territory:** targeted company-context vectors, policies, related verified cases, and customer-state tools are retrieved from CockroachDB. Amazon Nova Pro performs bounded reasoning and tool use. A verified result may become a candidate skill.
- **Tier 3 — Human judgment:** the handoff contains the conversation, Tier-1 search decision, targeted Tier-2 context, tool evidence, model status, confidence, and escalation reason. A verified human outcome may become a candidate skill.
- **Learning loop:** both Tier-2 and human resolutions remain untrusted until the bounded DSL, shadow oracle, policy/evidence checks, and transactional promotion gate pass.
- **Product metric:** optimize for full-reasoning escalations avoided, not zero LLM calls. Known problems use the inexpensive conversational path; novel problems receive stronger intelligence.

Learned resolution memory and company-context memory are distinct CockroachDB vector collections. No external vector database is used.

---

# 1. The 10-second explanation

> **HIVE is a call-center agent that gets cheaper and more capable with every resolved call. If AI or a human solves a new class of problem, HIVE turns that resolution into a validated skill so the next similar call can be handled without repeating the reasoning or escalation.**

Even shorter:

> **Every escalation teaches HIVE how not to escalate next time.**

The product must always be understandable through that sentence.

---

# 2. The problem

Modern contact centers increasingly use AI for customer conversations.

The common architecture is:

```text
customer
   ↓
AI agent
   ↓
can solve? ── yes → resolve
   ↓ no
human agent
   ↓
resolve
   ↓
transcript / analytics
```

The failure is what happens **after** the resolution.

A human may spend five minutes discovering:

- which internal system to query;
- which policy applies;
- which edge case caused the problem;
- which sequence of actions is safe;
- how to explain it clearly to the customer.

The next day another customer has the same underlying problem.

The AI agent often has to reason through it again or escalate again.

The company paid to discover the resolution, but the resolution did not become **executable organizational memory**.

HIVE changes the loop:

```text
customer
   ↓
HIVE
   ↓
known validated skill?
   ├── yes → execute cheaply and deterministically
   │
   └── no
        ↓
   reasoning agent
        ↓
   solved safely?
      ├── yes → candidate skill
      └── no
            ↓
          human
            ↓
          solved
            ↓
      candidate skill
            ↓
       shadow validation
            ↓
      promote / reject
            ↓
     shared skill memory
            ↺
```

---

# 3. The product insight

The product is **not the voice agent**.

Voice agents already exist.

The product is the **learning flywheel behind the contact center**.

HIVE turns successful resolutions into reusable, versioned, evidence-backed skills.

The system should become measurably better over time without retraining the foundation model.

That improvement should be visible through:

- more calls solved by validated skills;
- fewer Tier-2 reasoning calls;
- fewer human escalations;
- lower model calls per resolved case;
- lower latency on repeated problem classes;
- higher reusable skill coverage.

Do not promise 99% automation.

Some calls should remain human permanently.

The north-star behavior is:

> **Never make an expensive model or a human rediscover a resolution the organization has already learned and validated.**

---

# 4. What makes this agentic memory

HIVE must not become:

- FAQ caching;
- semantic search over transcripts;
- “RAG for customer support”;
- a knowledge-base generator;
- a chatbot that saves previous answers.

The memory unit is an **executable support skill**.

A skill captures:

```text
intent / problem class
        ↓
applicability conditions
        ↓
required customer/context fields
        ↓
tool sequence
        ↓
policy constraints
        ↓
decision rules
        ↓
response pattern
        ↓
escalation conditions
        ↓
evidence + provenance
        ↓
evaluation history
```

Example:

```yaml
name: explain_partial_promotional_refund
status: promoted

applies_when:
  - refund_status == "completed"
  - order_used_promotion == true
  - returned_item_count < purchased_item_count

required_context:
  - order_id
  - refund_id
  - promotion_id

steps:
  - tool: get_order
  - tool: get_refund
  - tool: get_promotion_allocation
  - compute: expected_refundable_amount
  - compare: actual_refund vs expected_refundable_amount
  - respond: explain promotional allocation

escalate_when:
  - refund_record_missing
  - discrepancy_exceeds_policy_tolerance
  - fraud_flag == true

evidence:
  - source cases
  - policy version
  - shadow evaluations

version: 3
```

This is not a memorized answer.

It is a learned procedure.

---

# 5. The three-tier resolution architecture

Every call flows through three resolution tiers.

## Tier 1 — Compiled Skill Memory

The problem matches a **promoted** skill with sufficient applicability confidence.

No general-purpose reasoning model is required to rediscover the procedure.

HIVE:

1. retrieves the candidate skill;
2. checks applicability;
3. fetches required fields;
4. executes the typed procedure;
5. verifies the result;
6. generates or fills the customer-facing response;
7. records the outcome.

This is the fastest and cheapest path.

Tier 1 must never run a draft or unvalidated skill.

## Tier 2 — Reasoning Agent

No promoted skill safely covers the case.

A reasoning agent receives:

- current customer problem;
- relevant policies;
- tool access;
- relevant prior cases;
- candidate memories;
- customer context.

It may:

- investigate;
- call tools;
- test hypotheses;
- generate a bounded resolution;
- explain uncertainty;
- escalate if confidence is insufficient.

For the submitted AWS path, **Amazon Bedrock is the primary Tier-2 model runtime**.

Groq may exist as:

- local-development provider;
- optional fallback;
- optional speech-to-text provider;
- performance comparison.

Do not architect the production demo so that Groq is required for the core hackathon story.

## Tier 3 — Human Resolution

The agent cannot solve safely or confidently.

HIVE transfers the call to a human.

The human receives:

- conversation transcript;
- customer context;
- what HIVE already checked;
- retrieved policies;
- failed hypotheses;
- suggested next information to inspect.

The human resolves the case.

HIVE records:

- tools the human used;
- relevant customer state;
- decision;
- explanation;
- policy references;
- final outcome.

After the call, a Skill Compiler turns the trace into a **candidate skill**.

The human resolution is training data for organizational memory, not something discarded into a transcript archive.

---

# 6. Candidate skills must NOT be trusted immediately

A customer hanging up is not proof that a resolution is correct.

A reasoning model successfully answering once is not proof that its procedure should be automated forever.

Therefore HIVE uses a memory lifecycle.

```text
raw resolved case
      ↓
candidate skill
      ↓
schema + policy validation
      ↓
shadow evaluation
      ↓
PROMOTE / REVISE / REJECT
      ↓
promoted skill
      ↓
live usage
      ↓
outcome monitoring
      ↓
confidence update
      ↓
retain / supersede / demote
```

Statuses:

- `candidate`
- `shadow`
- `promoted`
- `degraded`
- `deprecated`
- `rejected`

Only `promoted` skills may execute in Tier 1.

---

# 7. Shadow validation

This is one of HIVE's most important technical features.

When a candidate skill is created, HIVE tests it against historical or synthetic held-out cases from the same problem family.

Example:

```text
Candidate:
Explain partial refund under promotion

Shadow cases:
case 18 → expected explanation A → PASS
case 22 → expected explanation A → PASS
case 27 → escalation required     → PASS
case 31 → different policy version → PASS
case 39 → fraud flag               → PASS

5/5
0 policy violations
0 unsafe actions

→ PROMOTE
```

A candidate should be rejected or revised when:

- answer correctness is poor;
- it applies too broadly;
- it misses escalation conditions;
- it violates policy;
- it uses unavailable tools;
- required evidence is missing.

For the hackathon demo, shadow evaluation can happen immediately after a new resolution using a small deterministic replay set.

That lets the entire learning loop be shown in minutes without pretending months have passed.

---

# 8. Skill versioning and continuous learning

A skill is not permanent truth.

Example:

```text
refund skill v1
   ↓
promotion policy changes
   ↓
v1 becomes invalid for new policy version
   ↓
new resolved cases
   ↓
candidate v2
   ↓
shadow validation
   ↓
v2 promoted
   ↓
v1 remains in audit lineage
```

Every skill should carry:

- skill ID;
- version;
- status;
- scope;
- source cases;
- policy dependencies;
- applicable tool versions;
- created timestamp;
- promoted timestamp;
- superseded-by pointer;
- success count;
- failure count;
- shadow metrics;
- confidence;
- embedding.

The system must be able to answer:

> Why does HIVE know how to solve this?

and:

> Which human or AI resolutions taught it?

---

# 9. Demotion and failure handling

If a promoted skill begins failing, HIVE must not keep executing it blindly.

Possible demotion triggers:

- policy version changed;
- tool schema changed;
- live failure rate crossed threshold;
- human agent corrected the skill;
- customer outcome contradicted expected result;
- repeated Tier-1 escalations;
- scope mismatch detected.

Behavior:

```text
promoted skill
    ↓
failure evidence
    ↓
mark degraded
    ↓
remove from Tier 1
    ↓
route matching calls to Tier 2 / human
    ↓
compile revised candidate
```

This is critical to prevent self-reinforcing bad memory.

---

# 10. Resolution success is an explicit object

Do not define success as:

> customer hung up.

A call outcome should be verified through evidence.

Possible outcome types:

- `resolved_verified`
- `resolved_customer_confirmed`
- `resolved_tool_confirmed`
- `escalated`
- `abandoned`
- `reopened`
- `policy_exception`
- `failed`

For the demo domain, use deterministic ground truth.

Example:

A refund explanation is successful only if:

- the computed amount matches expected policy behavior;
- the response cites the correct reason;
- no forbidden action occurred.

---

# 11. Demo domain

Use a fictional e-commerce support company.

Working company:

> **Northstar Commerce**

Do not use real customer data.

Core entities:

- customers;
- orders;
- shipments;
- refunds;
- returns;
- subscriptions;
- promotions;
- support policies.

Core typed tools:

- `lookup_customer`
- `lookup_order`
- `lookup_shipment`
- `lookup_refund`
- `lookup_promotion`
- `calculate_refund`
- `lookup_return_policy`
- `cancel_subscription`
- `change_shipping_address`
- `issue_refund` — consequential, approval/policy-gated
- `escalate_to_human`

P0 calls should focus on read-heavy resolution paths.

---

# 12. Guided demo calls

The demo must tell a learning story.

## Call A — Already known

Customer:

> "Where is my order? It was supposed to arrive yesterday."

HIVE finds an existing promoted `late_shipment_status` skill.

UI shows:

```text
Resolution path
✓ Tier 1 — Promoted skill

LLM reasoning calls: 0
Human escalation: no
```

HIVE looks up shipment state and answers.

This establishes Tier 1.

## Call B — Novel but solvable by the reasoning agent

Customer:

> "Why did I only get $43 back? The item I returned cost $60."

There is no promoted skill.

HIVE goes to Tier 2.

Bedrock:

1. gets order;
2. gets refund;
3. gets promotion;
4. discovers proportional promotional allocation;
5. computes the refund;
6. explains it correctly.

Outcome is verified.

HIVE creates:

> **Candidate skill discovered**

`explain_partial_promotional_refund`

Run shadow tests.

If they pass:

> **Skill promoted**

Coverage expands.

## Call C — Novel edge case that needs a human

Customer:

> "I returned part of a bundle, paid with a gift card and card, and now the refund looks wrong."

Tier 1 has no applicable skill.

Tier 2 investigates but cannot resolve within confidence / policy boundary.

HIVE transfers to a human.

The human console receives the full context.

The human:

1. checks bundle allocation;
2. checks mixed tender;
3. explains the split refund;
4. resolves the case.

HIVE observes the resolution.

After the call:

> **Human resolution captured**

Skill Compiler creates:

`explain_partial_bundle_mixed_tender_refund`

Shadow evaluation runs.

Skill becomes promoted if safe.

## Call D — Similar future call

Another customer presents a different instance of the same underlying bundle/mixed-tender issue.

The newly promoted skill matches.

HIVE resolves it in Tier 1.

No Bedrock reasoning call.

No human escalation.

This is the hackathon's main moment:

> **A human solved this class once. The hive now knows it.**

---

# 13. The quantitative story

HIVE must visibly measure improvement.

Primary metrics:

- **Tier-1 coverage**
- Tier-2 reasoning rate
- human escalation rate
- LLM reasoning calls per resolved case
- median resolution latency
- promoted skill count
- candidate skill count
- skill shadow pass rate
- live skill success rate
- skill demotion count

Do not claim real-world savings from the demo.

Use a clearly labeled synthetic evaluation set.

Prefer:

> **LLM calls avoided**

over made-up dollar savings.

If cost estimates are shown, clearly label them as configured estimates using current model-price assumptions.

---

# 14. Why CockroachDB is essential

CockroachDB is not a transcript database.

It is HIVE's shared organizational memory.

It stores:

## Cases

- call ID;
- normalized problem;
- transcript;
- customer-state snapshot;
- resolution path;
- tools used;
- policy refs;
- outcome.

## Skills

- versions;
- status;
- applicability;
- procedure;
- escalation rules;
- dependencies;
- confidence;
- metrics.

## Memory lineage

- source cases;
- derived skill;
- superseded versions;
- human corrections;
- failed usages;
- promotion events;
- demotion events.

## Operational state

- concurrent call runs;
- tool calls;
- evaluation runs;
- human handoffs;
- audit events.

The system must survive individual agent processes restarting because the learning lives in CockroachDB.

---

# 15. Required CockroachDB tools

The hackathon requires at least two approved CockroachDB tools.

HIVE will use:

## 15.1 Distributed Vector Indexing

Use embeddings for:

- skill retrieval from customer utterance + structured context;
- related case retrieval;
- candidate skill clustering;
- similarity-based shadow-case selection.

The vector index must be combined with structured filters.

Never promote based on similarity alone.

## 15.2 CockroachDB Cloud Managed MCP Server

Use Managed MCP in a real runtime agent path.

Recommended role:

### Memory Researcher / Skill Investigator

Tier 2 and the Skill Compiler may use a read-only MCP connection to inspect:

- related cases;
- current skill versions;
- skill evidence;
- policy references;
- prior failures;
- human corrections.

Normal deterministic Tier-1 execution should use the application's typed SQL repository.

Writes should remain behind typed application services.

The UI must include a **System Proof** drawer showing one actual MCP memory lookup used in the demo.

---

# 16. Concurrency and transactional memory

A contact center has many calls learning simultaneously.

HIVE should explicitly handle:

- two calls generating similar candidates at the same time;
- one agent promoting while another is evaluating;
- skill supersession;
- duplicate outcome events;
- retryable tool actions.

Use CockroachDB transactions for:

- skill promotion;
- skill supersession;
- skill demotion;
- resolution finalization;
- memory lineage writes.

Use:

- optimistic versioning;
- idempotency keys;
- unique constraints;
- transaction retries.

This supports the "hive" concept: many agents, one coherent memory.

---

# 17. AWS role

The hackathon rule states:

> **"Entrants must build an agentic application that uses CockroachDB as its persistent memory layer, deployed on AWS."**

AWS must be meaningful, not decorative.

HIVE's intended AWS stack:

## Amazon Bedrock

Primary runtime for:

- Tier-2 reasoning agent;
- Skill Compiler;
- bounded skill-revision reasoning;
- optionally shadow-case analysis.

Use Bedrock Converse / ConverseStream with:

- tool use;
- strict structured output where supported;
- bounded call budgets;
- no unrestricted database access.

## Amazon Polly

Customer-facing voice for the HIVE agent.

Use a **generative** US English voice when available.

Initial preference:

- `Ruth` generative

Before final demo, audition:

- Ruth
- Danielle
- Matthew

Keep whichever sounds most natural for a calm customer-support agent.

Fallback:

- neural Joanna or Matthew if generative voice is unavailable in the chosen region.

## AWS Lambda

Recommended backend execution for:

- agent endpoints;
- skill compiler jobs;
- shadow evaluation jobs;
- Polly synthesis endpoint;
- webhook/event handlers.

## Amazon S3

Store:

- generated call audio;
- immutable evaluation artifacts;
- sanitized demo transcripts;
- optional model-output artifacts.

CockroachDB remains the source of truth for memory.

## CloudWatch

Use for:

- Lambda logs;
- agent latency;
- errors;
- provider failures;
- promotion/demotion job health.

---

# 18. Optional AWS services

## Amazon Connect — P1, not required for the primary demo

A real telephone number would be impressive, but it adds setup risk.

The P0 product should work through the web call simulator.

If AWS setup is smooth, add Amazon Connect after the core system works.

Do not delay the submission waiting for Connect.

---

# 19. Groq role

Groq is optional.

Use it where it provides clear speed or development value.

## Local development fallback

Implement a provider interface with at least:

- `bedrock`
- `groq`
- deterministic mock

Bedrock is the submitted default.

Groq lets Codex develop the agent loop before AWS credentials are available.

## Optional microphone speech-to-text

For a live-mic mode, Groq Whisper Large v3 Turbo is a reasonable low-latency STT path.

This is P1.

The guided hackathon demo must not depend on live microphone transcription.

---

# 20. Voice strategy

Voice should make the demo feel like a contact center without creating unnecessary risk.

P0:

- scripted/simulated customer call;
- agent replies synthesized by Polly;
- transcript appears live;
- optional pre-generated customer audio;
- deterministic call controls.

P1:

- microphone customer input;
- Groq Whisper STT;
- actual live voice exchange.

P2:

- Amazon Connect real phone call.

The memory loop matters more than telephony realism.

---

# 21. Agent architecture

The user experiences one HIVE system.

Internally:

```text
                HIVE ORCHESTRATOR
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
   Skill Router   Reasoning Agent   Human Handoff
        │              │              │
        ↓              ↓              ↓
   Tier-1 Skill    Bedrock tools    Human console
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                 Resolution Event
                       ↓
                 Skill Compiler
                       ↓
                 Candidate Skill
                       ↓
                 Shadow Evaluator
                       ↓
                Promote / Reject
                       ↓
                 CockroachDB Memory
```

Optional specialist nodes:

- Policy Agent
- Memory Researcher
- Tool Planner
- Skill Compiler
- Shadow Evaluator

Do not expose a fake "agents chatting with agents" UI.

Show outcomes, traces, and memory state instead.

---

# 22. Tool safety

Every tool must have a typed contract.

Example:

```ts
type ToolDefinition = {
  name: string;
  risk: "read" | "reversible_write" | "high_impact_write";
  inputSchema: ZodSchema;
  execute: (...);
  verify: (...);
};
```

P0 should mostly use read tools.

High-impact actions such as issuing money should require:

- policy check;
- deterministic bounds;
- explicit approval where needed;
- idempotency key;
- post-action verification.

The demo may simulate such writes rather than touching real systems.

---

# 23. Skill DSL

Do not generate arbitrary executable code from customer calls.

Skills should use a bounded declarative DSL.

Execution is deterministic.

The LLM may propose this DSL.

The validator decides whether it is valid.

---

# 24. Memory schema

P0 tables:

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
tool_calls
resolutions
resolution_outcomes

skills
skill_versions
skill_embeddings
skill_source_cases
skill_policy_dependencies

skill_evaluations
shadow_cases
promotion_events
demotion_events

agent_runs
agent_memory_reads
human_handoffs
audit_events
```

Important indexes:

- call/time;
- skill status;
- tenant + status;
- policy version;
- vector index on skill/case embeddings;
- source case relation;
- idempotency keys.

---

# 25. Skill retrieval

Tier 1 retrieval should be conservative.

Pipeline:

```text
customer utterance
      ↓
normalized intent/context
      ↓
embedding
      ↓
vector candidate search
      ↓
structured filters
      ↓
applicability checks
      ↓
confidence threshold
      ↓
one promoted skill OR no Tier-1 match
```

If ambiguous:

> go to Tier 2.

False negatives cost an LLM call.

False positives can give customers wrong answers.

Bias Tier 1 toward precision.

---

# 26. Skill compilation

Input:

- final verified resolution;
- full tool trace;
- relevant policy;
- human or agent explanation;
- source cases.

Output:

```text
candidate skill
applicability rules
required fields
tool sequence
response pattern
escalation conditions
policy dependencies
semantic embedding text
```

The compiler must not:

- invent tools;
- weaken policy;
- drop escalation requirements;
- write executable arbitrary code;
- promote itself.

---

# 27. Human handoff experience

When Tier 3 begins, the human console should feel genuinely useful.

Show:

### Customer

Name / fictional profile / order

### Problem

Short current issue summary

### HIVE already checked

- order
- refund
- promotion
- policy

### Why HIVE escalated

Concise reason.

### Suggested next check

Optional, clearly labeled.

### Transcript

Full conversation.

Human can:

- use the same typed tools;
- send a response;
- mark resolution;
- add a brief rationale.

When complete:

> **Resolution captured for learning**

Do not ask the human to manually write a runbook.

---

# 28. UI philosophy

Use the existing Clay product as visual inspiration.

Do not copy it exactly.

Desired characteristics:

- light;
- calm;
- spacious;
- subtle cool-blue / soft neutral palette;
- white cards/surfaces;
- restrained borders;
- rounded corners around 8–12px;
- readable sans-serif typography;
- minimal iconography;
- no dark cyberpunk call-center dashboard;
- no neon;
- no glassmorphism;
- no 20 KPI cards;
- no agent-chat visual gimmicks.

Use hierarchy and whitespace before borders.

The app should feel like a mature customer-support product, not an AI hackathon dashboard.

---

# 29. Main app UI

Build the actual product first.

Route:

> `/demo`

The central interaction is a call.

Recommended desktop layout:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ HIVE        Northstar Commerce        Coverage 42%       Skills 18   │
├───────────────────────────────────────────┬───────────────────────────┤
│                                           │ Resolution path           │
│              LIVE CALL                    │                           │
│                                           │ Tier 1   no match         │
│ Customer                                  │ Tier 2   investigating    │
│ “Why did I only get $43 back?”            │ Human    not needed       │
│                                           │                           │
│ HIVE                                      ├───────────────────────────┤
│ “Let me check the refund...”              │ Memory                    │
│                                           │                           │
│ [conversation transcript]                 │ Related cases             │
│                                           │ Candidate skill           │
│                                           │ Evidence                  │
│                                           │                           │
├───────────────────────────────────────────┴───────────────────────────┤
│ [Play/Pause] [Next call] [Human takeover]                00:48       │
└───────────────────────────────────────────────────────────────────────┘
```

Do not overload the main view.

---

# 30. Call-complete learning state

After a novel resolved call, the UI transitions to:

> ### HIVE learned something new
>
> **Candidate skill**  
> Partial promotional refund explanation
>
> Shadow evaluation:  
> `5 / 5 passed`
>
> Policy violations:  
> `0`
>
> **PROMOTED**

Then show a real coverage delta only if produced by the evaluation harness.

This should be one of the strongest visual moments.

---

# 31. Skill library

Secondary route or drawer:

> `/demo/skills`

Each skill shows:

- name;
- status;
- version;
- source cases;
- success rate;
- shadow pass rate;
- policy dependency;
- last used;
- LLM calls avoided;
- current confidence.

Skill detail shows lineage.

This is where judges can see CockroachDB memory as a system.

---

# 32. Evaluation route

Route:

> `/demo/evaluation`

Show:

- before/after Tier-1 coverage;
- reasoning calls;
- human escalations;
- latency;
- skill accuracy;
- unsafe action count;
- memory ablation.

The evaluation suite should be reproducible.

No fake animation-only metrics.

---

# 33. System Proof drawer

Closed by default.

For technical judges.

Show:

- CockroachDB Cloud connection;
- distributed vector query;
- Managed MCP trace;
- selected skill/case IDs;
- Bedrock model;
- Polly engine/voice;
- Lambda invocation IDs where available;
- agent/tool trace;
- skill promotion transaction;
- AWS region;
- build version.

Do not clutter the normal UI with this information.

---

# 34. Landing page — BUILD LAST

The landing page must be built only after the demo app is stable.

Route:

> `/`

Design language should be inspired by Clay:

- light;
- airy;
- confident;
- minimal text;
- product visuals instead of stock photos.

Hero:

> # **Every escalation teaches HIVE how not to escalate next time.**

Supporting line:

> HIVE turns successful AI and human support resolutions into validated skills, so repeated problems move from expensive reasoning to fast autonomous execution.

CTA:

> **View demo**

Secondary:

> See how HIVE learns

Hero visual:

Use the real app.

Show a miniature learning transition:

```text
Human resolved
      ↓
Skill learned
      ↓
5/5 shadow tests
      ↓
Promoted
      ↓
Next call → Tier 1
```

Below the hero, only a few short sections:

1. **Resolve**
2. **Learn**
3. **Promote**
4. **Compound**

Then:

- quantitative evaluation;
- architecture;
- final CTA.

Avoid long marketing copy.

---

# 35. Voice design

Voice should feel professional and calm.

Use Amazon Polly.

Primary candidate:

> **Ruth — Generative US English**

Before final demo, audition:

- Ruth;
- Danielle;
- Matthew.

Choose based on:

- warmth;
- clarity;
- responsiveness;
- lack of exaggerated synthetic cadence;
- suitability for support interactions.

Responses should be concise.

Do not synthesize long paragraphs.

---

# 36. Guided demo mode

Route:

> `/demo?mode=guided`

Guided sequence:

1. Call A — Tier 1.
2. Call B — Tier 2 → candidate skill → promotion.
3. Call C — Tier 3 human → candidate skill → promotion.
4. Call D — new similar call → learned skill resolves Tier 1.
5. Evaluation comparison.
6. System Proof.

A judge should understand the core idea without narration.

---

# 37. Demo data

All customers and transactions are fictional.

Use deterministic fixtures.

Recommended:

- 20 customers;
- 40 orders;
- shipments;
- 15 refunds;
- promotions;
- 5 policies;
- 30–50 evaluation calls.

Seed:

- 5–8 promoted skills;
- 2 draft candidates;
- 1 degraded skill;
- 1 superseded version.

This makes the system feel mature while still allowing the demo to visibly learn new skills.

---

# 38. Evaluation design

Create three test sets.

## Discovery

Used to build/tune initial skills.

## Shadow validation

Used when candidate skills are proposed.

## Final held-out evaluation

Never used to create or tune skills.

Report:

- skill-selection precision;
- Tier-1 resolution accuracy;
- Tier-2 resolution accuracy;
- human escalation;
- policy violations;
- LLM calls;
- average resolution steps;
- before/after coverage.

Important:

The same exact case used to create a skill must not be counted as proof that the skill works.

---

# 39. Memory ablation

Run the same final evaluation twice.

## No skill memory

Tier 1 disabled.

All cases go to Tier 2 or human.

## HIVE memory enabled

Promoted skills available.

Compare:

- same outcome quality;
- fewer reasoning calls;
- fewer human handoffs;
- lower median steps/latency.

This directly proves why memory matters.

---

# 40. Production-readiness boundaries

P0 must include:

- tenant scoping;
- role-based memory access;
- immutable audit records;
- skill versioning;
- idempotent actions;
- skill promotion transactions;
- skill demotion;
- tool schemas;
- policy versions;
- structured logging;
- error states;
- provider fallbacks;
- deterministic evaluation;
- no arbitrary generated code execution.

---

# 41. Agent roles and permissions

Suggested roles:

## Runtime Agent

Can:

- read promoted skills;
- read relevant cases;
- call allowed tools;
- create call events.

Cannot:

- promote skills;
- change policies.

## Skill Compiler

Can:

- read resolved cases;
- create candidate skills.

Cannot:

- promote itself.

## Shadow Evaluator

Can:

- execute candidate skills against test fixtures;
- write evaluation results.

Cannot:

- alter production cases.

## Human Reviewer / System

Can:

- approve high-impact actions;
- promote or demote when policy requires;
- inspect lineage.

Managed MCP should be read-only for AI investigation wherever possible.

---

# 42. Failure modes

HIVE must explicitly handle:

### No matching skill

Route Tier 2.

### Multiple close matches

Route Tier 2.

### Skill applicability check fails

Route Tier 2.

### Bedrock unavailable

Use configured fallback or human escalation.

Never pretend the resolution succeeded.

### CockroachDB unavailable

Do not run Tier 1 from stale in-process memory as if it were authoritative.

Gracefully degrade / handoff.

### Polly unavailable

Text continues; voice falls back or disables.

### Candidate fails shadow tests

Reject or revise.

### Promoted skill fails live

Degrade / demote.

---

# 43. Security

Use fictional data only for the hackathon.

Still build realistic controls:

- no secrets in frontend;
- secrets via AWS Secrets Manager or deployment environment;
- SQL parameterization;
- tenant-scoped queries;
- MCP read-only credentials;
- no arbitrary code from model;
- tool allowlist;
- structured output validation;
- sensitive log redaction;
- input size limits;
- rate limits;
- audit trail.

---

# 44. Hackathon compliance

The project must satisfy the current rule:

> **"Entrants must build an agentic application that uses CockroachDB as its persistent memory layer, deployed on AWS."**

It also states:

> **"Your Project MUST use at least 2 of the following CockroachDB Tools"**

HIVE targets:

1. CockroachDB Distributed Vector Indexing
2. CockroachDB Cloud Managed MCP Server

AWS targets:

- Amazon Bedrock
- Amazon Polly
- AWS Lambda
- Amazon S3
- CloudWatch

Optional:

- Amazon Connect

The submission video must visibly show the CockroachDB memory layer at work.

Therefore the guided demo must show:

> resolution → candidate skill → CockroachDB memory → promotion → next call uses skill.

---

# 45. P0 — Must ship

- text-based call simulation;
- Polly agent voice;
- fictional commerce backend;
- three-tier routing;
- promoted skill retrieval;
- deterministic Tier-1 executor;
- Bedrock Tier-2 agent;
- human handoff simulator;
- Skill Compiler;
- candidate skill DSL;
- shadow evaluator;
- promotion/rejection;
- CockroachDB persistence;
- CockroachDB vector index;
- Managed MCP runtime lookup;
- skill lineage;
- skill demotion path;
- before/after evaluation;
- guided demo;
- AWS deployment;
- System Proof;
- landing page built last;
- public repo;
- license;
- README;
- <3-minute video.

---

# 46. P1 — Strong if time remains

- live microphone input;
- Groq Whisper STT;
- real-time voice loop;
- richer human agent console;
- multiple policy versions;
- additional domains/intents;
- skill clustering;
- auto-degradation from live failure threshold;
- Amazon Connect phone-call integration.

---

# 47. P2 — Do not spend hackathon critical time

- real enterprise CRM integration;
- real payment/refund provider;
- real customer PII;
- multilingual support;
- workforce scheduling;
- sentiment analytics;
- call recording compliance;
- full QA management;
- real production telephony;
- custom model training;
- massive multi-tenant admin.

---

# 48. Definition of done

The project is ready only when a judge can watch this sequence:

1. A known call is resolved through a promoted skill with zero reasoning-model calls.
2. A novel call reaches Tier 2 and is resolved.
3. That resolution becomes a candidate skill.
4. The candidate passes shadow tests and is promoted.
5. A harder novel call reaches a human.
6. The human resolution becomes another validated skill.
7. A future similar call is solved through Tier 1 without repeating the human escalation.
8. The evaluation shows fewer reasoning calls / escalations with memory enabled.
9. The System Proof shows real CockroachDB vector/MCP activity.
10. The agent speaks using real Amazon Polly.
11. The functional submitted app runs on AWS.

If the demo looks like:

> chatbot + transcript history

the project failed.

If it looks like:

> **the contact center just permanently learned a new capability from one resolved call**

the product succeeded.

---

# 49. Final north star

> # **Every escalation teaches HIVE how not to escalate next time.**

HIVE is not an AI call center.

HIVE is the learning system that makes the entire call center compound.
