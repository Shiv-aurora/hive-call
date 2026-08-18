# HIVE submission package

## Short description

HIVE is a self-learning contact-center system that converts verified AI and human resolutions into bounded, evidence-backed support skills. It evaluates each candidate against shadow cases before promotion, then executes the promoted procedure for future similar calls without paying a model or human to rediscover it.

## What it demonstrates

The guided demo begins with an existing Tier-1 skill, learns a proportional promotional-refund procedure from Amazon Bedrock, learns a harder mixed-tender procedure from a simulated human resolution, and reuses that new skill on a paraphrased future call. A held-out synthetic ablation compares the same workload with and without skill memory.

## CockroachDB role

The persistence model stores calls, outcomes, tool evidence, policy versions, learned skill versions, company context, three vector indexes, model/token telemetry, evaluations, promotion/demotion events, memory reads, and audit lineage. Tenant-scoped retrieval selects only promoted, policy-compatible procedures. Promotion is a retryable transaction. An independent Managed MCP lookup is stored as real read-only proof; the separate Lambda proxy is not claimed.

## AWS role

- Amazon Bedrock Nova Pro performs bounded Tier-2 reasoning and emits structured candidate inputs.
- Titan Text Embeddings V2 creates 1024-dimensional memory vectors.
- Amazon Polly Ruth produces the agent voice.
- Amazon S3 stores sanitized voice artifacts privately with encryption and lifecycle expiry.
- AWS Lambda and API Gateway host the functional application.
- CloudWatch provides logs, error alarming, and an operational dashboard.
- Secrets Manager holds external database and MCP credentials.

## Architecture

```text
Customer / call simulator
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

## Three-minute video storyboard

- 0:00–0:20 — State the problem and tagline. Show the learning-loop architecture.
- 0:20–0:40 — Run Call A. Highlight promoted skill selection, one fast response call, and zero full-reasoning calls.
- 0:40–1:10 — Run Call B. Show Bedrock reasoning, candidate compilation, 6/6 shadow validation, and promotion.
- 1:10–1:45 — Run Call C. Show the manual-review gate, human evidence capture, validation, and promotion.
- 1:45–2:10 — Run Call D. Highlight reuse of the newly learned skill with no reasoning or repeat escalation.
- 2:10–2:35 — Open Evaluation and compare the held-out memory-disabled and memory-enabled runs.
- 2:35–2:50 — Open System Proof. Show real CockroachDB vector/MCP activity, Bedrock, Polly, S3, and the AWS URL.
- 2:50–3:00 — Close with: “A solved call should never be learned only once.”

## Claims that are safe to use

- 40 fictional held-out cases.
- Show the live Evaluation page: Tier-1 coverage, full-reasoning calls/tokens, correctness, precision, human rate, and latency are read from CockroachDB telemetry.
- Real deployed AWS application and verified Bedrock, Titan, Polly, and encrypted S3 paths.
- Do not claim production automation rates, dollar savings, or real customer outcomes. CockroachDB and the stored Managed MCP lookup are live; keep the Lambda MCP proxy explicitly unverified.

## Items requiring owner action before submission

- Capture System Proof footage showing both Bedrock roles, all three CockroachDB vector indexes, Managed MCP evidence, and Call D with zero full-reasoning calls.
- Publish this workspace as a public repository.
- Record and publish the video using the storyboard above.
- Add the final public repository and video URLs to the submission form.
