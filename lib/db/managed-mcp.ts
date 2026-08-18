import { z } from "zod";

const mcpResponseSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]), result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string() }).optional() });

export class ManagedMcpMemoryResearcher {
  constructor(private readonly endpoint = process.env.COCKROACH_MCP_URL, private readonly token = process.env.COCKROACH_MCP_TOKEN, private readonly clusterId = process.env.COCKROACH_MCP_CLUSTER_ID) {}

  get configured() { return Boolean(this.endpoint && this.token && this.clusterId); }

  async callReadOnlyTool(toolName: string, args: Record<string, unknown>) {
    if (!this.endpoint || !this.token || !this.clusterId) throw new Error("CockroachDB Managed MCP is not configured");
    const response = await fetch(this.endpoint, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "mcp-cluster-id": this.clusterId, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: toolName, arguments: args } }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Managed MCP request failed (${response.status})`);
    const parsed = mcpResponseSchema.parse(await response.json());
    if (parsed.error) throw new Error(`Managed MCP error ${parsed.error.code}: ${parsed.error.message}`);
    return parsed.result;
  }
}
