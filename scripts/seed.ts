import { companyContext, customers, orders, policies, promotions, refunds, shadowCases, shipments, TENANT_ID } from "../data/fixtures/world";
import { seedSkills } from "../lib/skills/catalog";
import { getPool } from "../lib/db/pool";
import { withRetryableTransaction } from "../lib/db/transactions";
import { BedrockEmbeddingProvider } from "../lib/providers/embeddings";

const vectorLiteral = (embedding: number[]) => `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;

function retrievalText(skill: (typeof seedSkills)[number]) {
  return [skill.name, skill.description, ...skill.intents].join(" | ");
}

async function main() {
const pool = getPool();
const embedder = new BedrockEmbeddingProvider();
const skillEmbeddings = new Map<string, number[]>();
for (const skill of seedSkills) skillEmbeddings.set(skill.id, await embedder.embed(retrievalText(skill)));
const contextEmbeddings = new Map<string, number[]>();
for (const context of companyContext) contextEmbeddings.set(context.id, await embedder.embed(`${context.title}\n${context.content}`));
await withRetryableTransaction(pool, async (client) => {
  const tenantResult = await client.query<{ id: string }>("INSERT INTO tenants (slug, name) VALUES ($1, 'Northstar Commerce') ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id", [TENANT_ID]);
  const tenantId = tenantResult.rows[0]!.id;
  const customerIds = new Map<string, string>();
  for (const customer of customers) {
    const result = await client.query<{ id: string }>("INSERT INTO customers (tenant_id, external_id, name, email) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, external_id) DO UPDATE SET name=excluded.name,email=excluded.email RETURNING id", [tenantId, customer.id, customer.name, customer.email]);
    customerIds.set(customer.id, result.rows[0]!.id);
  }
  const promotionIds = new Map<string, string>();
  for (const promotion of promotions) {
    const result = await client.query<{ id: string }>("INSERT INTO promotions (tenant_id, external_id, definition) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, external_id) DO UPDATE SET definition=excluded.definition RETURNING id", [tenantId, promotion.id, JSON.stringify(promotion)]);
    promotionIds.set(promotion.id, result.rows[0]!.id);
  }
  const orderIds = new Map<string, string>();
  for (const order of orders) {
    const result = await client.query<{ id: string }>("INSERT INTO orders (tenant_id, customer_id, promotion_id, external_id, snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, external_id) DO UPDATE SET snapshot=excluded.snapshot RETURNING id", [tenantId, customerIds.get(order.customerId), order.promotionId ? promotionIds.get(order.promotionId) : null, order.id, JSON.stringify(order)]);
    orderIds.set(order.id, result.rows[0]!.id);
  }
  for (const shipment of shipments) await client.query("INSERT INTO shipments (tenant_id, order_id, snapshot) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, order_id) DO UPDATE SET snapshot=excluded.snapshot", [tenantId, orderIds.get(shipment.orderId), JSON.stringify(shipment)]);
  for (const refund of refunds) await client.query("INSERT INTO refunds (tenant_id, order_id, snapshot) VALUES ($1,$2,$3) ON CONFLICT (tenant_id, order_id) DO UPDATE SET snapshot=excluded.snapshot", [tenantId, orderIds.get(refund.orderId), JSON.stringify(refund)]);
  for (const policy of policies) {
    const policyResult = await client.query<{ id: string }>("INSERT INTO policies (tenant_id, skill_family, name) VALUES ($1,$2,$2) ON CONFLICT (tenant_id, skill_family) DO UPDATE SET name=excluded.name RETURNING id", [tenantId, policy.family]);
    await client.query("INSERT INTO policy_versions (policy_id, version, external_id, definition, active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (policy_id, version) DO UPDATE SET external_id=excluded.external_id,definition=excluded.definition,active=excluded.active", [policyResult.rows[0]!.id, policy.version, policy.id, JSON.stringify(policy), policy.active]);
  }
  for (const context of companyContext) {
    await client.query(
      `INSERT INTO company_context (tenant_id,external_id,kind,title,content,metadata,policy_version_id,embedding)
       VALUES ($1,$2,$3,$4,$5,$6,(SELECT pv.id FROM policy_versions pv JOIN policies p ON p.id=pv.policy_id WHERE p.tenant_id=$1 AND pv.external_id=$7),$8::VECTOR)
       ON CONFLICT (tenant_id,external_id) DO UPDATE SET kind=excluded.kind,title=excluded.title,content=excluded.content,metadata=excluded.metadata,policy_version_id=excluded.policy_version_id,embedding=excluded.embedding,active=true,updated_at=now()`,
      [tenantId, context.id, context.kind, context.title, context.content, JSON.stringify({ fictional: true }), context.policyId, vectorLiteral(contextEmbeddings.get(context.id)!)],
    );
  }
  for (const skill of seedSkills) {
    const skillResult = await client.query<{ id: string }>("INSERT INTO skills (tenant_id, skill_family) VALUES ($1,$2) ON CONFLICT (tenant_id, skill_family) DO UPDATE SET skill_family=excluded.skill_family RETURNING id", [tenantId, skill.family]);
    const definition = { ...skill, tenantId };
    const versionResult = await client.query<{ id: string }>("INSERT INTO skill_versions (skill_id, version, status, definition, confidence, promoted_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (skill_id, version) DO UPDATE SET status=excluded.status,definition=excluded.definition,confidence=excluded.confidence RETURNING id", [skillResult.rows[0]!.id, skill.version, skill.status, JSON.stringify(definition), skill.confidence, skill.promotedAt ?? null]);
    await client.query("INSERT INTO skill_embeddings (skill_version_id, tenant_id, embedding, retrieval_text) VALUES ($1,$2,$3::VECTOR,$4) ON CONFLICT (skill_version_id) DO UPDATE SET embedding=excluded.embedding,retrieval_text=excluded.retrieval_text", [versionResult.rows[0]!.id, tenantId, vectorLiteral(skillEmbeddings.get(skill.id)!), retrievalText(skill)]);
    if (skill.status === "promoted") await client.query("UPDATE skills SET active_version_id=$1 WHERE id=$2", [versionResult.rows[0]!.id, skillResult.rows[0]!.id]);
  }
  for (const shadowCase of shadowCases) {
    const refund = refunds.find((value) => value.orderId === shadowCase.orderId);
    const oracle = {
      expectedFamily: shadowCase.shadowFamily,
      mustContain: shadowCase.requiredFacts,
      expectedRefundAmount: shadowCase.shadowFamily === "partial_promo_refund" ? refund?.amount ?? null : null,
      expectedTenderBreakdown: shadowCase.shadowFamily === "bundle_mixed_tender_refund" ? refund?.tenderBreakdown ?? null : null,
      requiredTools: shadowCase.shadowFamily === "partial_promo_refund" ? ["lookup_order", "lookup_refund", "lookup_promotion", "lookup_policy"] : ["lookup_order", "lookup_refund", "lookup_policy"],
    };
    await client.query("INSERT INTO shadow_cases (tenant_id, external_id, skill_family, input, oracle, split) VALUES ($1,$2,$3,$4,$5,'shadow') ON CONFLICT (tenant_id, external_id) DO UPDATE SET skill_family=excluded.skill_family,input=excluded.input,oracle=excluded.oracle", [tenantId, shadowCase.id, shadowCase.shadowFamily, JSON.stringify(shadowCase), JSON.stringify(oracle)]);
  }
});
process.stdout.write(`seeded ${customers.length} customers, ${orders.length} orders, ${seedSkills.length} executable skill, ${companyContext.length} company-context records, and ${shadowCases.length} shadow cases\n`);
await pool.end();
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
