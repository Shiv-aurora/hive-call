# Safety boundaries

- Generated JavaScript or Python is never executed.
- Tier 1 retrieves promoted, tenant-scoped, policy-compatible versions only.
- Ambiguous matches and failed assertions move up a tier.
- High-impact writes require policy bounds, idempotency, approval, and verification; the local demo is read-heavy.
- The compiler cannot promote its own output.
- Shadow cases are separate from source and held-out evaluation cases.
- Provider failure ends in a human handoff, never an unsupported success claim.
