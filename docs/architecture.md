# Architecture

HIVE routes each case conservatively through learned resolution memory, bounded reasoning, then human judgment. Verified Tier 2 and human traces are compiled into declarative candidates, replayed against a separate shadow set, and promoted only when every configured safety gate passes.

The production path uses Nova Micro to present narrow verified Tier-1 facts conversationally and Nova Pro for broader Tier-2 investigation and compilation. Titan supplies 1024-dimensional embeddings. CockroachDB stores tenant-scoped calls, learned skills, company context, vectors, usage telemetry, promotion/demotion lineage, distributed rate limits, and guided proof replays. Polly provides voice and private S3 reuses content-addressed audio.

```text
Customer → Router → Tier 1 learned skill → verified facts → fast response
               └→ Tier 2 company context + reasoning
                                  └→ Tier 3 human
                           ↓
                  Verified resolution
                           ↓
                    Skill Compiler
                           ↓
                    Shadow Evaluator
                           ↓
             CockroachDB SQL + Vector Memory ↺
```

Only promoted, high-confidence, unambiguous, policy-compatible versions enter Tier 1. Promotion is a retryable serializable transaction gated by at least five passing shadow cases and zero policy violations. Model output cannot change the executable DSL, and unsupported response facts fail closed. The independent Managed MCP lookup is preserved as evidence; the separate Lambda MCP proxy remains disabled until independently verified.
