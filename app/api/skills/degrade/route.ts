import { z } from "zod";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { forbiddenTenant, hasApiRole, isConfiguredTenant, unauthorized } from "@/lib/security/api-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ tenantId: z.string().uuid(), skillVersionId: z.string().uuid(), reason: z.string().min(3).max(500), evidence: z.record(z.string(), z.unknown()).default({}) });

export async function POST(request: Request) {
  if (!hasApiRole(request, "reviewer")) return unauthorized();
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid degradation request" }, { status: 400 });
  try {
    const repository = new CockroachSkillRepository();
    if (!await isConfiguredTenant(parsed.data.tenantId, repository)) return forbiddenTenant();
    return Response.json(await repository.degradeSkill(parsed.data));
  } catch {
    return Response.json({ error: "Degradation failed" }, { status: 503 });
  }
}
