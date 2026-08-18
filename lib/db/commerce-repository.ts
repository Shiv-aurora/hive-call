import type { Order, PolicyVersion, Promotion, Refund, Shipment } from "@/lib/domain/types";
import { getPool } from "@/lib/db/pool";

export class CockroachCommerceRepository {
  constructor(private readonly tenantId: string) {}

  private async snapshot<T>(sql: string, values: unknown[]): Promise<T | undefined> {
    const result = await getPool().query<{ snapshot: T }>(sql, values);
    return result.rows[0]?.snapshot;
  }

  lookupOrder(externalOrderId: string) {
    return this.snapshot<Order>("SELECT snapshot FROM orders WHERE tenant_id=$1 AND external_id=$2", [this.tenantId, externalOrderId]);
  }

  lookupShipment(externalOrderId: string) {
    return this.snapshot<Shipment>("SELECT sh.snapshot FROM shipments sh JOIN orders o ON o.id=sh.order_id WHERE sh.tenant_id=$1 AND o.tenant_id=$1 AND o.external_id=$2", [this.tenantId, externalOrderId]);
  }

  lookupRefund(externalOrderId: string) {
    return this.snapshot<Refund>("SELECT r.snapshot FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.tenant_id=$1 AND o.tenant_id=$1 AND o.external_id=$2", [this.tenantId, externalOrderId]);
  }

  async lookupPromotion(externalPromotionId?: string) {
    if (!externalPromotionId) return undefined;
    const result = await getPool().query<{ definition: Promotion }>("SELECT definition FROM promotions WHERE tenant_id=$1 AND external_id=$2", [this.tenantId, externalPromotionId]);
    return result.rows[0]?.definition;
  }

  async lookupPolicy(externalPolicyId: string) {
    const result = await getPool().query<{ definition: PolicyVersion }>(
      `SELECT pv.definition FROM policy_versions pv JOIN policies p ON p.id=pv.policy_id
       WHERE p.tenant_id=$1 AND pv.external_id=$2 AND pv.active`,
      [this.tenantId, externalPolicyId],
    );
    return result.rows[0]?.definition;
  }
}
