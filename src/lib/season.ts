// Whether a month suits a place, given the place's best months.

export type SeasonFit = "good" | "ok" | "off";

export function seasonFit(month: number, best: number[]): SeasonFit {
  if (best.includes(month)) return "good";
  const prev = month === 1 ? 12 : month - 1;
  const next = month === 12 ? 1 : month + 1;
  if (best.includes(prev) || best.includes(next)) return "ok";
  return "off";
}

export const SEASON_LABEL: Record<SeasonFit, string> = { good: "当季", ok: "可去", off: "非当季" };
