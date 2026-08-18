import { describe, expect, it } from "vitest";
import { getDatabaseConfig } from "@/lib/db/config";
import { ManagedMcpMemoryResearcher } from "@/lib/db/managed-mcp";
import { withRetryableTransaction } from "@/lib/db/transactions";
import { createReasoningProvider } from "@/lib/providers";
import { parseJsonObject, providerResolutionSchema } from "@/lib/providers/contracts";
import { hasApiRole } from "@/lib/security/api-auth";

describe("production adapter boundaries", () => {
  it("does not instantiate a database config without credentials", () => expect(getDatabaseConfig({})).toBeUndefined());
  it("parses fenced structured model output", () => expect(parseJsonObject("```json\n{\"ok\":true}\n```" )).toEqual({ ok: true }));
  it("selects only explicit reasoning providers", () => { expect(createReasoningProvider("mock").name).toBe("mock"); expect(() => createReasoningProvider("unknown")).toThrow(/Unsupported/); });
  it("keeps Managed MCP disabled until both URL and token exist", () => expect(new ManagedMcpMemoryResearcher(undefined, undefined).configured).toBe(false));
  it("rejects a model resolution with no evidence", () => expect(() => providerResolutionSchema.parse({ status: "resolved", resolutionSummary: "done", customerResponse: "done", evidenceRefs: [], toolsUsed: [], confidence: .9, escalate: false, candidateLearningValue: "low" })).toThrow());
  it("rejects contradictory model escalation state", () => expect(() => providerResolutionSchema.parse({ status: "resolved", resolutionSummary: "done", customerResponse: "done", evidenceRefs: ["order_1"], toolsUsed: [], confidence: .9, escalate: true, escalationReason: "unclear", candidateLearningValue: "low" })).toThrow());
  it("enforces separate runtime and reviewer API roles", () => {
    const previousRuntime = process.env.HIVE_RUNTIME_TOKEN;
    const previousReviewer = process.env.HIVE_REVIEWER_TOKEN;
    process.env.HIVE_RUNTIME_TOKEN = "runtime-secret";
    process.env.HIVE_REVIEWER_TOKEN = "reviewer-secret";
    try {
      expect(hasApiRole(new Request("https://hive.test", { headers: { authorization: "Bearer runtime-secret" } }), "runtime")).toBe(true);
      expect(hasApiRole(new Request("https://hive.test", { headers: { authorization: "Bearer runtime-secret" } }), "reviewer")).toBe(false);
      expect(hasApiRole(new Request("https://hive.test", { headers: { authorization: "Bearer reviewer-secret" } }), "reviewer")).toBe(true);
    } finally {
      if (previousRuntime === undefined) delete process.env.HIVE_RUNTIME_TOKEN; else process.env.HIVE_RUNTIME_TOKEN = previousRuntime;
      if (previousReviewer === undefined) delete process.env.HIVE_REVIEWER_TOKEN; else process.env.HIVE_REVIEWER_TOKEN = previousReviewer;
    }
  });

  it("retries Cockroach serialization failures and commits once", async () => {
    const queries: string[] = [];
    let connections = 0;
    const pool = { connect: async () => {
      connections += 1;
      return { query: async (sql: string) => { queries.push(sql); }, release: () => undefined };
    } };
    let attempts = 0;
    const result = await withRetryableTransaction(pool as never, async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("restart transaction"), { code: "40001" });
      return "committed";
    }, { maxAttempts: 3, baseDelayMs: 0 });
    expect(result).toBe("committed");
    expect(connections).toBe(2);
    expect(queries).toEqual(["BEGIN", "ROLLBACK", "BEGIN", "COMMIT"]);
  });
});
