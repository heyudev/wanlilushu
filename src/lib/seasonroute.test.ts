import { describe, expect, it } from "vitest";
import { addDays, newYearLeaveDays, SPRING_FESTIVAL } from "./dates";
import { baseInput, fixture } from "./fixture";
import { routeMode, seasonOrder } from "./order";
import { buildPlan } from "./plan";
import type { Dataset, Leg, PlanInput, RouteNode } from "./types";

// Four segments, each good in one season, stored in an order that suits none of them:
// S (summer, open June–August) → W (winter) → P (spring) → F (autumn), two stops of 45 nights each.
const BEST: Record<string, number[]> = { S: [6, 7, 8], W: [12, 1, 2], P: [3, 4, 5], F: [9, 10, 11] };
const LL: Record<string, [number, number]> = { S: [36, 100], W: [24, 102], P: [30, 120], F: [40, 116] };

function seasons(): Dataset {
  const d = fixture();
  d.segs = Object.keys(BEST).map((k) => ({ k, name: k, range: "", season: "" }));
  d.nodes = Object.keys(BEST).flatMap((k): RouteNode[] => [0, 1].map((i) => ({
    id: `${k}${i}`, n: `${k}${i}`, p: "浙江", seg: k, ll: [LL[k][0], LL[k][1] + i * 0.5] as [number, number], nights: 45, best: BEST[k],
    star: 3, sleep: "H", wiki: [], food: [], tip: "", dog: "", ex: [], tags: ["nature"], alt: 100,
  })));
  d.legs = d.nodes.map((n, i): Leg => {
    const to = d.nodes[(i + 1) % d.nodes.length];
    return { frm: n.id, to: to.id, km: n.seg === to.seg ? 60 : 900, h: n.seg === to.seg ? 1 : 12, hw: 0, ferry: 0, geom: [] };
  });
  d.exs = [];
  d.attractions = [];
  d.prices = {};
  d.starts = [{ name: "家", ll: LL.P, entry: "P0", km: 0, h: 0, hw: 0 }];
  return d;
}
const input = (over: Partial<PlanInput> = {}) => baseInput({ start: "家", startDate: "2027-03-01", routeOrder: "season", ...over });
const gates = { S: [6, 8] as [number, number] };

describe("route order", () => {
  it("follows the seasons for slow rhythms and keeps the loop for 打卡, unless chosen by hand", () => {
    expect(routeMode(baseInput({ routeOrder: "auto", rhythm: "checkin" }))).toBe("loop");
    expect(routeMode(baseInput({ routeOrder: "auto", rhythm: "slow" }))).toBe("season");
    expect(routeMode(baseInput({ routeOrder: "auto", rhythm: "custom", stayFactor: 1 }))).toBe("loop");
    expect(routeMode(baseInput({ routeOrder: "loop", rhythm: "deep" }))).toBe("loop");
  });

  it("puts every segment in its season", () => {
    const p = buildPlan(seasons(), input(), gates);
    expect(p.order.map((u) => u.seg)).toEqual(["P", "S", "F", "W"]);
    expect(p.seasonScore.off).toBe(0);
    expect(p.seasonScore.ok).toBe(0);
    // the loop order from the same start is mostly out of season
    expect(buildPlan(seasons(), input({ routeOrder: "loop" }), gates).seasonScore.off).toBeGreaterThan(2);
  });

  it("gives the same order every time", () => {
    const d = seasons();
    const a = seasonOrder(d, input(), gates, LL.P);
    expect(seasonOrder(seasons(), input(), gates, LL.P)).toEqual(a);
  });

  it("ends at the last stop and drives home from there", () => {
    const p = buildPlan(seasons(), input(), gates);
    expect(p.loop).toBe(false);
    const last = p.stops[p.stops.length - 1];
    expect(last.nights).toBe(45);
    expect(last.node.seg).toBe("W");
    expect(p.homeward?.estimated).toBe(true);
    expect(p.endDate).toBe(addDays(last.date, last.nights + p.homeward!.days));
  });

  it("drives long connecting legs over several days, with nights on the road", () => {
    const p = buildPlan(seasons(), input({ maxDriveHours: 7 }), gates);
    const t = p.legs.find((l) => l.parts.some((x) => "transfer" in x))!;
    expect(t.driveDays).toBe(Math.ceil(t.h / 7));
    const next = p.stops.find((s) => s.node.id === t.to)!;
    expect(next.date).toBe(addDays(t.date, t.driveDays - 1));
    // a drive that is already split over several days is not flagged as too long
    expect(p.warnings.some((w) => w.kind === "long-drive" && w.nodes?.includes(t.to))).toBe(false);
  });

  it("uses stored road data for a connecting drive and estimates the rest", () => {
    const d = seasons();
    d.transfers = { "P1>S0": { km: 1234, h: 15, hw: 1000 } };
    const p = buildPlan(d, input(), gates);
    const parts = p.legs.flatMap((l) => l.parts).filter((x) => "transfer" in x);
    const stored = parts.find((x) => "transfer" in x && x.transfer === "P1>S0");
    expect(stored && "transfer" in stored && [stored.km, stored.estimated]).toEqual([1234, false]);
    expect(parts.some((x) => "transfer" in x && x.estimated)).toBe(true);
  });
});

describe("going home for the Spring Festival", () => {
  it("takes the dates from the observatory table, three days before New Year's Eve", () => {
    expect(SPRING_FESTIVAL[2027]).toBe("2027-02-06");
    expect(SPRING_FESTIVAL[2030]).toBe("2030-02-03");
    expect(newYearLeaveDays("2027-01-01")[0]).toBe(32); // 2027-02-02
  });

  it("splits a stay around the trip home and resumes it afterwards", () => {
    const over = { startDate: "2027-12-20", nightsOverride: { a: 60 } };
    const home = buildPlan(fixture(), baseInput({ ...over, newYearHome: { days: 14, mode: "fly" } }));
    const stay = buildPlan(fixture(), baseInput(over));
    const [before, after] = home.stops;
    expect(home.breaks[0]).toMatchObject({ newYear: true, stopIdx: 0, date: "2028-01-22", days: 14, mode: "fly" });
    expect([before.node.id, before.nights]).toEqual(["a", 33]);
    expect([after.node.id, after.nights, after.resumed, after.date]).toEqual(["a", 27, true, "2028-02-05"]);
    expect(home.legs[0].resume).toBe(true);
    // sights are seen once, the stay is still priced as one long stay, and the trip is two weeks longer
    expect(after.ticketCost).toBe(0);
    expect(before.sleep).toBe("R");
    expect(home.days).toBe(stay.days + 14);
    expect(home.costs.tickets).toBe(stay.costs.tickets);
  });

  it("needs no extra trip when the traveller is already home for another break", () => {
    const p = buildPlan(fixture(), baseInput({
      startDate: "2028-01-10", newYearHome: { days: 14, mode: "fly" }, breaks: [{ after: "a", days: 20, mode: "fly" }],
    }));
    expect(p.breaks.filter((b) => b.newYear)).toHaveLength(0);
  });
});
