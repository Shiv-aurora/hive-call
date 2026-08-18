# Memory model

The reusable unit is a bounded procedure—not a transcript or cached answer. A skill version includes applicability predicates, typed tools, deterministic computations, assertions, response templates, escalation conditions, policy dependencies, source cases, evaluation history, and confidence. Only `promoted` versions execute at Tier 1.

Promotion requires at least five independent shadow cases, 100% correctness in the current small fixture suite, all required safety assertions, and zero prohibited actions. A policy or schema change can degrade a version and remove it from Tier 1 while preserving its audit lineage.
