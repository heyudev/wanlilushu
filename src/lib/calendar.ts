// Month-by-month view of a plan: where you are each day, how far you drive and what you spend.
import { addDays, daysBetween } from "./dates";
import type { Plan } from "./types";

export interface MonthBlock {
  /** "2027-04" */
  month: string;
  /** consecutive days at one stop within the month */
  runs: { stopIdx: number; from: string; to: string; days: number }[];
  km: number;
  /** lodging, food and tickets spread over each stop's nights, plus driving costs on travel days */
  cost: number;
}

export function monthlyView(plan: Plan): MonthBlock[] {
  const months = new Map<string, MonthBlock>();
  const block = (date: string) => {
    const m = date.slice(0, 7);
    if (!months.has(m)) months.set(m, { month: m, runs: [], km: 0, cost: 0 });
    return months.get(m)!;
  };
  plan.stops.forEach((s, i) => {
    const nights = Math.max(1, s.nights);
    const perNight = (s.lodgingCost + s.ticketCost + (s.foodPerPerson ?? 0) * (plan.input.adults + plan.input.kids * 0.6) * s.nights) / nights;
    for (let d = 0; d < (s.nights || 1); d++) {
      const date = addDays(s.date, d);
      const b = block(date);
      const last = b.runs[b.runs.length - 1];
      if (last && last.stopIdx === i && daysBetween(last.to, date) === 1) { last.to = date; last.days++; }
      else b.runs.push({ stopIdx: i, from: date, to: date, days: 1 });
      if (s.nights) b.cost += perNight;
    }
  });
  for (const l of plan.legs) {
    const b = block(l.date);
    b.km += l.km;
    b.cost += l.energy.fuelCost + l.energy.elecCost + l.toll;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
