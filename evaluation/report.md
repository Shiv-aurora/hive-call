# HIVE memory ablation

Synthetic deterministic held-out set: **40 cases**.

| Metric | Memory disabled | HIVE memory enabled |
|---|---:|---:|
| Tier-1 coverage | 0% | 42.5% |
| Tier-2 reasoning calls | 40 | 23 |
| Human escalations | 11 | 11 |
| Resolution accuracy | 100% | 100% |
| Skill-selection precision | 100% | 100% |
| Policy violations | 0 | 0 |
| Median resolution steps | 7 | 3 |

The enabled run avoided 17 reasoning calls without reducing fixture-oracle correctness. This is a synthetic product evaluation, not a production automation or cost claim.
