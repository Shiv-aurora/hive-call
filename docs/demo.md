# Guided demo

1. Open `/demo` and reset the session.
2. Call A matches the existing late-shipment skill, executes verified tools, and uses the fast response model. Full reasoning calls: 0.
3. Call B has no safe promoted match. CockroachDB loads targeted company context, Nova Pro resolves it, the bounded compiler creates a declarative candidate, six shadow cases pass, and the skill is promoted.
4. Call C lacks sufficient bundle-allocation evidence, so the safe path is human handoff. The verified human trace compiles and promotes another skill.
5. Call D paraphrases Call C and resolves through the newly promoted Tier-1 skill with one fast response call, zero full-reasoning calls, and no human handoff.
6. Open Skills to inspect applicability, steps, policy lineage, evidence, version, and status.
7. Open Evaluation for live progressive-intelligence telemetry and the explicitly labeled no-memory counterfactual.
8. Open System Proof to show the redacted runtime, Cockroach connection/vector/MCP state, AWS configuration, and audit count.

Do not describe fixture metrics as production savings. If an external dependency is gated, show its reported state rather than implying it is live.
