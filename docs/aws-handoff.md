# AWS and CockroachDB handoff

The AWS production implementation is deployed at `https://h0yzyuck8i.execute-api.us-east-1.amazonaws.com`. Live checks in `us-east-1` verified Nova Micro fast responses, Nova Pro reasoning/compilation, Titan Text Embeddings V2, Polly Ruth generative output, private S3 audio reuse, CockroachDB SQL and all three distributed vector indexes. CDK deploys the ARM64 Lambda, API Gateway throttling, private encrypted S3, Secrets Manager, CloudWatch logs/metrics/alarm/dashboard, and strict readiness probes.

## Secure runtime configuration

Provide these values without committing them:

```text
DATABASE_URL=postgresql://...?...sslmode=verify-full
COCKROACH_MCP_URL=https://...
COCKROACH_MCP_TOKEN=...
HIVE_RUNTIME_TOKEN=...
HIVE_REVIEWER_TOKEN=...
```

The existing production secret is populated. For a fresh environment, set those fields and run:

```bash
npm run db:migrate
npm run db:seed
npm run check
npm run cdk:deploy -- --require-approval never -c tier1ModelId=amazon.nova-micro-v1:0 -c tier2ModelId=amazon.nova-pro-v1:0
```

The stack creates separate runtime-reader and reviewer tokens automatically. The Lambda-side MCP proxy is intentionally disabled; System Proof shows only independently verified Managed MCP evidence persisted in CockroachDB. Expensive public routes use a 10-minute CockroachDB-backed window: 12 demo calls overall, 3 replays per guided case, and 12 voice requests per client fingerprint. API Gateway adds a 25 request/second rate with burst 50. Readiness deliberately returns 503 while any required SQL/vector/model/voice/storage proof is absent.
