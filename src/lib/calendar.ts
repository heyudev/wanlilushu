// Month-by-month view of a plan: where you are each day, how far you drive and what you spend.
import { lodgingCost } from "./costs";
import { addDays, daysBetween } from "./dates";
import type { Plan } from "./types";

export interface MonthBlock {
  /** "2027-04" */
  month: string;
  /** consecutive days at one stop within the month; stopIdx −1 with a label for days on the road or at home */
  runs: { stopIdx: number; from: string; to: string; days: number; label?: string }[];
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
  // days that belong to no stop: nights on the road during long drives, and trips home
  const roadNight = lodgingCost("H", 1, plan.input) ?? 0;
  const span = (from: string, days: number, label: string, perDay = 0) => {
    for (let d = 0; d < days; d++) {
      const date = addDays(from, d);
      const b = block(date);
      const last = b.runs[b.runs.length - 1];
      if (last && last.label === label && daysBetween(last.to, date) === 1) { last.to = date; last.days++; }
      else b.runs.push({ stopIdx: -1, from: date, to: date, days: 1, label });
      b.cost += perDay;
    }
  };
  for (const l of plan.legs) {
    const b = block(l.date);
    b.km += l.km;
    b.cost += l.energy.fuelCost + l.energy.elecCost + l.toll;
    if (l.driveDays > 1) span(l.date, l.driveDays - 1, l.parts.some((p) => "transfer" in p) ? "转场路上" : "路上", roadNight);
  }
  for (const br of plan.breaks) span(br.date, br.days + (br.roadDays ?? 0), br.newYear ? "回家过年" : "回家");
  for (const b of months.values()) b.runs.sort((x, y) => x.from.localeCompare(y.from));
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
