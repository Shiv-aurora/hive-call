import type { Skill } from "@/lib/domain/types";

export type SkillMatch = { skillVersionId: string; score: number; skill: Skill };

export function selectPrecisionBiasedSkill(
  matches: SkillMatch[],
  isApplicable: (skill: Skill) => boolean,
  options: { minScore?: number; minConfidence?: number; ambiguityMargin?: number } = {},
) {
  const minScore = options.minScore ?? 0.35;
  const minConfidence = options.minConfidence ?? 0.9;
  const ambiguityMargin = options.ambiguityMargin ?? 0.06;
  const eligible = matches.filter((match) => match.score >= minScore && match.skill.confidence >= minConfidence && match.skill.status === "promoted" && isApplicable(match.skill));
  const first = eligible[0];
  if (!first) return { selected: undefined, reason: "no_safe_match" as const, eligible };
  const competing = eligible.find((match, index) => index > 0 && match.skill.family !== first.skill.family && first.score - match.score < ambiguityMargin);
  if (competing) return { selected: undefined, reason: "ambiguous_match" as const, eligible };
  return { selected: first, reason: "selected" as const, eligible };
}
