// Plans built from the bundled data must add up: every day accounted for, every kept stop visited once.
import { describe, expect, it } from "vitest";
import { applyRhythm } from "../components/RhythmPicker";
import { loadDataset } from "./data";
import { addDays } from "./dates";
import { DEFAULT_INPUT } from "./defaults";
import { buildPlan, keepNode } from "./plan";
import type { Plan, PlanInput } from "./types";

const data = loadDataset();
const awayAfter = (p: Plan, i: number) => p.breaks.filter((b) => b.stopIdx === i).reduce((a, b) => a + b.days + (b.roadDays ?? 0), 0);

function problems(p: Plan, input: PlanInput): string[] {
  const bad: string[] = [];
  if (p.legs.length !== p.stops.length - 1) bad.push("legs and stops out of step");
  p.stops.forEach((s, i) => {
    const n = p.stops[i + 1], l = p.legs[i];
    if (!n) return;
    const expect = addDays(s.date, s.nights + awayAfter(p, i) + (l.resume ? 0 : l.driveDays - 1));
    if (n.date !== expect) bad.push(`${n.node.n} on ${n.date}, expected ${expect}`);
    if (s.nights <= 0) bad.push(`${s.node.n}: ${s.nights} nights`);
  });
  const visits = new Map<string, number>();
  for (const s of p.stops) if (!s.transit && !s.resumed) visits.set(s.node.id, (visits.get(s.node.id) ?? 0) + 1);
  if (p.loop) visits.set(p.entry.id, visits.get(p.entry.id)! - 1);
  for (const n of data.nodes) if (keepNode(n, input) && visits.get(n.id) !== 1) bad.push(`${n.n} visited ${visits.get(n.id) ?? 0} times`);
  for (const [k, v] of Object.entries(p.costs)) if (!(v >= 0)) bad.push(`cost ${k} = ${v}`);
  const last = p.stops[p.stops.length - 1];
  const end = addDays(last.date, (p.loop ? 0 : last.nights + awayAfter(p, p.stops.length - 1)) + (p.homeward?.days ?? 0));
  if (end !== p.endDate) bad.push(`ends ${p.endDate}, expected ${end}`);
  return bad;
}

describe("plans from the bundled data", () => {
  const cases: [string, Partial<PlanInput>][] = [
    ["slow", { routeOrder: "season", start: "上海", newYearHome: { days: 14, mode: "drive" } }],
    ["deep", { routeOrder: "season", start: "乌鲁木齐", startDate: "2027-10-15", waitForSeason: true }],
    ["sojourn", { routeOrder: "season", start: "成都", breaks: [{ after: "dali", days: 20, mode: "fly" }], newYearHome: { days: 10, mode: "fly" } }],
    ["checkin", { routeOrder: "loop", start: "哈尔滨", direction: "ccw", newYearHome: { days: 14, mode: "fly" }, startDate: "2027-10-15" }],
    ["deep", { routeOrder: "loop", start: "广州", waitForSeason: true, pace: "highlights" }],
  ];
  it.each(cases)("%s %j adds up", (rhythm, over) => {
    const input = applyRhythm({ ...DEFAULT_INPUT, hotelPerRoom: 300, ...over }, rhythm as "slow");
    expect(problems(buildPlan(data, input), input)).toEqual([]);
  });
});
