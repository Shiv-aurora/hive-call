# HIVE

> **Every escalation teaches HIVE how not to escalate next time.**

HIVE is a self-learning contact-center system that compiles verified AI and human resolutions into bounded, validated support skills. The next similar call executes that procedure through Tier 1 and uses a fast conversational model without repeating full reasoning.

## The problem

Support organizations repeatedly pay models and people to rediscover resolutions they have already found. Transcripts preserve conversation history, but they do not preserve an executable, policy-bound procedure. HIVE turns a verified resolution into versioned organizational capability without retraining the foundation model.

## The proof

The guided demo runs four calls:

1. A known late shipment resolves through an existing promoted skill, verified tools, and the fast response model with zero full-reasoning calls.
2. A novel promotion refund reaches Tier 2, resolves, passes six shadow cases, and becomes promoted.
3. A bundle/mixed-tender edge case reaches a human, whose verified trace becomes another promoted skill.
4. A differently worded future case uses that newly learned skill in Tier 1 with one fast response call, zero full-reasoning calls, and no human handoff.

The integration suite replays that loop ten times from clean fixtures.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000/demo`. Verification:

```bash
npm run check
```

The default local provider is deterministic. To exercise AWS locally, set `REASONING_PROVIDER=bedrock`, `AWS_REGION`, `TIER1_MODEL_ID`, and `TIER2_MODEL_ID` as shown in `.env.example`.

## Live demo

The AWS deployment is available at [HIVE on AWS](https://h0yzyuck8i.execute-api.us-east-1.amazonaws.com/demo). Follow Calls A–D in order, then open Skills, Evaluation, and System Proof. The exact presenter sequence is in `docs/demo.md`.

## Architecture

```text
Customer / call simulator
          ↓
      HIVE router
   ┌──────┼────────┐
 Tier 1  Tier 2   Human
   └──────┼────────┘
      Verified resolution
          ↓
      Skill compiler
          ↓
     Shadow evaluator
          ↓
 CockroachDB relational + vector memory
          ↺
```

Skills are declarative data: applicability predicates, typed tools, bounded computations, assertions, response templates, escalation rules, policy dependencies, and evidence lineage. Generated arbitrary code is never executed, and only promoted skills can enter Tier 1.

Production services:

- Amazon Bedrock Nova Micro for narrow Tier-1 conversational presentation.
- Amazon Bedrock Nova Pro for bounded Tier-2 reasoning and skill compilation.
- Titan Text Embeddings V2 for 1024-dimensional retrieval vectors.
- Amazon Polly Ruth generative speech and private encrypted S3 artifacts.
- AWS Lambda behind API Gateway, with CloudWatch logs, alarm, and dashboard.
- CockroachDB relational memory and three distributed vector indexes for calls, learned skills, and company context, plus preserved Managed MCP lookup evidence.

## Production path

The deterministic learning loop remains available for repeatable evaluation. The production path adds Amazon Bedrock Converse reasoning and skill compilation, Titan 1024-dimensional embeddings, Polly voice, encrypted S3 artifact storage, CockroachDB transactions/vector search, a read-only Managed MCP adapter, health/readiness proof, and an AWS CDK deployment using Lambda Web Adapter and API Gateway.

The app is deployed on AWS at `https://h0yzyuck8i.execute-api.us-east-1.amazonaws.com`. Live verification covers Nova Micro presentation, Nova Pro reasoning/tool use and compilation, Titan embeddings, Polly generative speech, private S3 audio reuse, Lambda, API Gateway, CloudWatch, CockroachDB SQL/vector memory, transactional promotion, and persisted Managed MCP evidence.

## Evaluation

`/demo/evaluation` derives correctness, skill-selection precision, routing rates, model calls/tokens, policy violations, median latency, promotions, and demotions from live CockroachDB telemetry. Its no-memory comparison is explicitly labeled as a counterfactual derived from observed verified Tier-1 routes; it does not invent dollar savings.

## Deployment

```bash
npm run package:lambda
npm run cdk:synth
npm run cdk:deploy -- --require-approval never
```

The stack creates Lambda, API Gateway, Secrets Manager, an encrypted private S3 bucket, least-scope application IAM, logs, an alarm, and a dashboard. Populate the generated runtime secret with `DATABASE_URL`, `COCKROACH_MCP_URL`, and `COCKROACH_MCP_TOKEN`, then redeploy. Details are in `docs/aws-handoff.md`.

## Limitations

- Northstar Commerce customers and transactions are fictional fixtures.
- Evaluation results measure the synthetic held-out set, not production customers or dollar savings.
- The separate Lambda-side Managed MCP proxy remains disabled until its transport/auth path is independently verified; System Proof reports only the real Managed MCP lookup already performed and stored.
- Real telephony, microphone speech recognition, and Amazon Connect are intentionally P1 rather than part of the primary demo.

## Repository map

- `app/` — landing page, guided app, skill library, evaluation, health routes
- `lib/` — routing, tools, bounded DSL, AWS providers, Cockroach repositories, compilation, evaluation
- `data/fixtures/` — fictional Northstar Commerce data
- `db/migrations/` — CockroachDB schema and vector index
- `infra/` — CDK stack for Lambda, API Gateway, S3, Secrets Manager, IAM, alarms, and dashboard
- `tests/` — domain, production-adapter, and ten-run end-to-end learning-loop gates
- `docs/TRACEABILITY.md` — P0 requirement coverage and sponsor handoff status
- `docs/submission.md` — submission copy, service explanation, and three-minute video storyboard

MIT licensed. All customers and transactions are fictional.
