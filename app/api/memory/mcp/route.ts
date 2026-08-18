import { z } from "zod";
import { ManagedMcpMemoryResearcher } from "@/lib/db/managed-mcp";
import { hasApiRole, unauthorized } from "@/lib/security/api-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ tool: z.string().min(1).max(120), arguments: z.record(z.string(), z.unknown()).default({}) });
const allowedTools = new Set((process.env.COCKROACH_MCP_READ_TOOLS ?? "select_query,list_tables,get_table_schema,explain_query,show_running_queries").split(",").map((value) => value.trim()).filter(Boolean));

export async function POST(request: Request) {
  if (!hasApiRole(request, "runtime")) return unauthorized();
  if (process.env.ENABLE_LAMBDA_MCP_PROXY !== "true") return Response.json({ error: "Lambda-side MCP proxy is disabled until independently verified" }, { status: 503 });
  const researcher = new ManagedMcpMemoryResearcher();
  if (!researcher.configured) return Response.json({ error: "CockroachDB Managed MCP is not configured" }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !allowedTools.has(parsed.data.tool)) return Response.json({ error: "Read-only MCP tool not allowed" }, { status: 400 });
  try {
    return Response.json({ result: await researcher.callReadOnlyTool(parsed.data.tool, parsed.data.arguments) });
  } catch {
    return Response.json({ error: "Managed MCP read failed" }, { status: 503 });
  }
}
