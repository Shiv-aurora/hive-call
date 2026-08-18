import { z } from "zod";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { forbiddenTenant, hasApiRole, isConfiguredTenant, unauthorized } from "@/lib/security/api-auth";

export const runtime = "nodejs";

const querySchema = z.object({ tenantId: z.string().uuid() });

export async function GET(request: Request) {
  if (!hasApiRole(request, "runtime")) return unauthorized();
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "A valid tenantId is required" }, { status: 400 });
  try {
    const repository = new CockroachSkillRepository();
    if (!await isConfiguredTenant(parsed.data.tenantId, repository)) return forbiddenTenant();
    return Response.json({ skills: await repository.listPromoted(parsed.data.tenantId) });
  } catch {
    return Response.json({ error: "Skill memory is unavailable" }, { status: 503 });
  }
}
