// Ways to bring a plan under a total budget. Each option changes one setting; the UI lets the user pick.
import { buildPlan, costTotal } from "./plan";
import type { Dataset, PlanInput } from "./types";

export interface BudgetOption {
  label: string;
  change: Partial<PlanInput>;
  total: number;
  saves: number;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/** stay factors offered in the settings, longest first */
const STAY_STEPS = [3, 2, 1.5, 1.25, 1];

function candidates(input: PlanInput): { label: string; change: Partial<PlanInput> }[] {
  const out: { label: string; change: Partial<PlanInput> }[] = [];
  if (input.lodging === "comfort") out.push({ label: "城市住酒店、风景地露营", change: { lodging: "balanced" } });
  if (input.lodging !== "budget") out.push({ label: "能车宿露营就不住酒店", change: { lodging: "budget" } });
  if (input.hotelPerRoom != null) out.push({ label: `酒店价位降到 ¥${round10(input.hotelPerRoom * 0.7)}/晚`, change: { hotelPerRoom: round10(input.hotelPerRoom * 0.7) } });
  if (input.rentPerMonth != null && input.sojournWeeks > 0) out.push({ label: `旅居月租降到 ¥${round10(input.rentPerMonth * 0.7)}`, change: { rentPerMonth: round10(input.rentPerMonth * 0.7) } });
  if (input.foodTier === "nice") out.push({ label: "餐饮改为普通档", change: { foodTier: "normal" } });
  if (input.foodTier === "normal") out.push({ label: "餐饮改为经济档", change: { foodTier: "budget" } });
  if (input.level === "all") out.push({ label: "门票只算 5A 景区", change: { level: "5A" } });
  if (input.dog && input.dogCare === "boarding") out.push({ label: "禁宠景区改为轮流陪狗", change: { dogCare: "rotate" } });
  const shorter = STAY_STEPS.find((f) => f < input.stayFactor);
  if (shorter != null) out.push({ label: `每站少住一些（停留 ×${shorter}）`, change: { stayFactor: shorter, rhythm: "custom" } });
  if (input.sojournWeeks > 2) out.push({ label: `旅居缩短到 ${Math.ceil(input.sojournWeeks / 2)} 周`, change: { sojournWeeks: Math.ceil(input.sojournWeeks / 2), rhythm: "custom" } });
  if (input.pace === "full") out.push({ label: "只去精华站点", change: { pace: "highlights" } });
  return out;
}

/** Single-setting changes that lower the total, biggest saving first. */
export function budgetOptions(data: Dataset, input: PlanInput): BudgetOption[] {
  const base = costTotal(buildPlan(data, input).costs);
  return candidates(input)
    .map((c) => {
      const total = costTotal(buildPlan(data, { ...input, ...c.change }).costs);
      return { ...c, total, saves: base - total };
    })
    .filter((o) => o.saves > 1)
    .sort((a, b) => b.saves - a.saves);
}

/** Applies options in order of saving until the plan fits the budget; null when no budget is set. */
export function fitToBudget(data: Dataset, input: PlanInput): { change: Partial<PlanInput>; total: number; fits: boolean; labels: string[] } | null {
  if (input.budget == null) return null;
  let current = { ...input };
  const change: Partial<PlanInput> = {};
  const labels: string[] = [];
  let total = costTotal(buildPlan(data, current).costs);
  for (let round = 0; round < 8 && total > input.budget; round++) {
    const best = budgetOptions(data, current)[0];
    if (!best) break;
    Object.assign(change, best.change);
    current = { ...current, ...best.change };
    labels.push(best.label);
    total = best.total;
  }
  return { change, total, fits: total <= input.budget, labels };
}
