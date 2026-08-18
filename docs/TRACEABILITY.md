# P0 traceability

Status is evidence-based. “Credential gate” means the implementation exists but the required live sponsor-service proof does not.

| Requirement | Phase | Module | Test / evidence | Demo step | Status |
|---|---:|---|---|---|---|
| Text-based call simulation | 1, 9 | fixtures, `DemoShell` | browser verified | Calls A–D | Complete |
| Polly agent voice | 6 | Polly provider, voice API | deployed Ruth generative MP3, 15,020 bytes | Play voice | Live verified |
| Fictional commerce backend | 1 | fixtures, typed tools | unit + learning loop | Calls A–D | Complete |
| Three-tier routing | 3–5 | orchestrator | 10-reset integration gate | Calls A–D | Complete |
| Promoted skill retrieval | 3 | retrieval | promoted-only and ambiguity tests | Calls A/D | Complete |
| Tier-1 executor + fast renderer | 3, 6 | executor, Nova Micro renderer | narrow-context and unsupported-fact tests; live usage | Calls A/D | Live verified |
| Bedrock Tier-2 agent | 4, 6 | Bedrock provider, demo API | deployed Nova Pro tool flow | Call B | Live verified |
| Human handoff simulator | 5 | orchestrator and trace UI | forced escalation integration test | Call C | Complete |
| Skill Compiler | 5, 6 | catalog + Bedrock compiler | deployed bounded candidate output | Calls B/C | Live verified |
| Candidate skill DSL | 0, 3 | domain schema and catalog | schema validation | Skills | Complete |
| Shadow evaluator | 5 | evaluator | threshold unit + 10-reset loop | Calls B/C | Complete |
| Promotion and rejection | 5 | evaluator, repository | live retryable/idempotent transaction test | Calls B/C | Live verified |
| CockroachDB persistence | 2 | migrations, repositories, APIs | live schema and fresh-process guided loop | System Proof | Live verified |
| CockroachDB vector indexes | 2 | skill/call/company-context vectors | live DVI and retrieval tests | System Proof | Live verified |
| Managed MCP lookup evidence | 6 | stored read-only MCP proof | independent live lookup retained in SQL | System Proof | Live verified; Lambda proxy not claimed |
| Skill lineage | 2, 5 | source cases, learning source, policy dependencies, audit | live AI/human promotion lineage | Skills/System Proof | Live verified |
| Skill demotion path | 8, 12 | orchestrator, repository API | failure and policy-change tests | Evaluation | Complete |
| Before/after evaluation | 11 | live telemetry evaluation | persisted correctness/routing/tokens/latency + labeled counterfactual | Evaluation | Live verified |
| Guided demo | 13 | demo UI and guide | browser + 10-reset gate | Calls A–D | Complete |
| AWS deployment | 7 | CDK/Lambda package | deployed health, landing, Bedrock, Polly | Full demo | Live verified |
| System Proof | 9, 12 | proof API/drawer | redaction test + live sponsor/runtime evidence | Drawer | Live verified |
| Landing page built last | 10 | `app/page.tsx` | deployed browser check | Landing | Complete |
| Public repository | 14 | repository hosting | no public URL available | Submission | Owner action required |
| Open-source license | 14 | `LICENSE` | file inspection | Submission | Complete |
| README | 14 | `README.md` | required sections audit | Submission | Complete |
| Public video under 3 minutes | 14 | submission guide | storyboard only; no public URL | Submission | Owner action required |

## Additional production evidence

| Requirement | Phase | Module | Evidence | Status |
|---|---:|---|---|---|
| Bedrock embeddings | 6 | embedding provider/vector API | live Titan 1024-dimensional invocation | Live verified |
| Encrypted S3 artifacts | 6 | artifact adapter/CDK | deployed MP3 object reports AES256 | Live verified |
| AWS observability | 7 | CDK | deployed log group, error alarm, dashboard | Live verified |
| Retryable Cockroach transactions | 2 | transaction helper | simulated `40001` retry test | Complete |
| Provider evidence contract | 4, 12 | provider schema | missing-evidence and contradiction tests | Complete |
| Role-based memory APIs | 12 | API auth + generated access secrets | runtime/reviewer separation test | Complete |
| Policy-change failure demo | 12 | degradation state machine/UI | domain test and Evaluation route | Complete |
