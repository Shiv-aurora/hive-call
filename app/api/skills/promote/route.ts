import { z } from "zod";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";
import { forbiddenTenant, hasApiRole, isConfiguredTenant, unauthorized } from "@/lib/security/api-auth";

export const runtime = "nodejs";

const bodySchema = z.object({ tenantId: z.string().uuid(), skillId: z.string().uuid(), skillVersionId: z.string().uuid(), evaluationId: z.string().uuid(), actor: z.string().min(1).max(120), idempotencyKey: z.string().min(8).max(200) });

export async function POST(request: Request) {
  if (!hasApiRole(request, "reviewer")) return unauthorized();
  if (!process.env.DATABASE_URL) return Response.json({ error: "CockroachDB is not configured" }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid promotion request" }, { status: 400 });
  try {
    const repository = new CockroachSkillRepository();
    if (!await isConfiguredTenant(parsed.data.tenantId, repository)) return forbiddenTenant();
    return Response.json(await repository.promoteCandidate(parsed.data));
  } catch (error) {
    const message = error instanceof Error && error.message === "Promotion gate not satisfied" ? error.message : "Promotion failed";
    return Response.json({ error: message }, { status: message === "Promotion gate not satisfied" ? 409 : 503 });
  }
}
