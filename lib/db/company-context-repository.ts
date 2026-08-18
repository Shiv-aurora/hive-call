import { getPool } from "@/lib/db/pool";
import { vectorLiteral } from "@/lib/db/skill-repository";

export type CompanyContextMatch = {
  id: string;
  externalId: string;
  kind: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export class CockroachCompanyContextRepository {
  async vectorSearch(tenantId: string, embedding: number[], limit = 5): Promise<CompanyContextMatch[]> {
    const result = await getPool().query<{
      id: string; external_id: string; kind: string; title: string; content: string; metadata: Record<string, unknown>; score: string | number;
    }>(
      `SELECT id,external_id,kind,title,content,metadata,1 - (embedding <=> $1::VECTOR) AS score
       FROM company_context
       WHERE tenant_id=$2 AND active
       ORDER BY embedding <=> $1::VECTOR
       LIMIT $3`,
      [vectorLiteral(embedding), tenantId, limit],
    );
    return result.rows.map((row) => ({ id: row.id, externalId: row.external_id, kind: row.kind, title: row.title, content: row.content, metadata: row.metadata, score: Number(row.score) }));
  }

  async relatedVerifiedCases(tenantId: string, normalizedProblem: string, limit = 3) {
    const terms = normalizedProblem.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 4).slice(0, 5);
    if (!terms.length) return [];
    const result = await getPool().query<{ external_id: string; summary: string; tier: string }>(
      `SELECT c.external_id,r.summary,r.tier
       FROM resolutions r JOIN calls c ON c.id=r.call_id
       WHERE r.tenant_id=$1 AND c.normalized_problem ILIKE ANY($2::STRING[])
       ORDER BY r.finalized_at DESC LIMIT $3`,
      [tenantId, terms.map((term) => `%${term}%`), limit],
    );
    return result.rows.map((row) => ({ caseId: row.external_id, summary: row.summary, tier: row.tier }));
  }
}
