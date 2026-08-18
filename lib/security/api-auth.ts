import { timingSafeEqual } from "node:crypto";
import { CockroachSkillRepository } from "@/lib/db/skill-repository";

export type ApiRole = "runtime" | "reviewer";

export function hasApiRole(request: Request, role: ApiRole) {
  const expected = role === "reviewer" ? process.env.HIVE_REVIEWER_TOKEN : process.env.HIVE_RUNTIME_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "www-authenticate": "Bearer" } });
}

export async function isConfiguredTenant(tenantId: string, repository = new CockroachSkillRepository()) {
  return tenantId === await repository.tenantIdForSlug(process.env.HIVE_TENANT_SLUG ?? "northstar");
}

export function forbiddenTenant() {
  return Response.json({ error: "Tenant scope is not authorized for this deployment" }, { status: 403 });
}
