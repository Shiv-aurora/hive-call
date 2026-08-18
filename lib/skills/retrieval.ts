import { orders, shipments } from "@/data/fixtures/world";
import type { Skill, SupportCase } from "@/lib/domain/types";

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

export function retrievePromotedSkill(skills: Skill[], supportCase: SupportCase): Skill | undefined {
  const issue = normalize(`${supportCase.issue} ${supportCase.intent}`);
  const order = orders.find((value) => value.id === supportCase.orderId);
  const shipment = shipments.find((value) => value.orderId === supportCase.orderId);
  const matches = skills.filter((skill) => {
    if (skill.status !== "promoted") return false;
    const lexical = skill.intents.some((intent) => issue.includes(normalize(intent)) || normalize(intent).split(/\s+/).every((token) => issue.includes(token)));
    if (!lexical) return false;
    return skill.applicability.every((predicate) => {
      const value = predicate.field === "intent" ? issue : predicate.field === "hasPromotion" ? Boolean(order?.promotionId) : predicate.field === "isBundle" ? Boolean(order?.bundle) : predicate.field === "tender" ? order?.tender : shipment?.status;
      return predicate.operator === "equals" ? value === predicate.value : String(value).includes(String(predicate.value));
    });
  });
  return matches.length === 1 ? matches[0] : undefined;
}
