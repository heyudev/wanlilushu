import { describe, expect, it } from "vitest";
import { addDays, newYearLeaveDays, SPRING_FESTIVAL } from "./dates";
import { baseInput, fixture } from "./fixture";
import { routeMode, seasonOrder } from "./order";
import { buildPlan, TRANSFER_SEG, transferKm } from "./plan";
import { segmentRuns } from "../components/segments";
import { estimateDrive } from "./order";
import { drivingDays } from "./stay";
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
    expect(t.driveDays).toBe(drivingDays(t.h, 7));
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

describe("connecting drives", () => {
  it("are not counted in the segments they join", () => {
    const p = buildPlan(seasons(), input(), gates);
    const transfer = p.legs.reduce((a, l) => a + transferKm(l), 0);
    expect(transfer).toBeGreaterThan(0);
    const inSegments = segmentRuns(p).reduce((a, r) => a + r.km, 0);
    expect(inSegments + transfer).toBeCloseTo(p.legs.reduce((a, l) => a + l.km, 0));
    expect(p.costBySeg[TRANSFER_SEG].km).toBeCloseTo(transfer);
  });
});

// a home far from the fixture's stops, so driving home takes several days
function farHome() {
  const d = fixture();
  d.starts.push({ name: "远城", ll: [45, 90], entry: "a", km: 0, h: 0, hw: 0 });
  const daysEach = drivingDays(estimateDrive(d, d.nodes[0].ll, [45, 90]).h, 7);
  return { d, daysEach };
}

describe("trips home", () => {
  it("adds the days and hotel nights of a long drive home, both ways", () => {
    const { d, daysEach } = farHome();
    expect(daysEach).toBeGreaterThan(1);
    const over = { start: "远城", maxDriveHours: 7 };
    const fly = buildPlan(d, baseInput({ ...over, breaks: [{ after: "a", days: 10, mode: "fly" }] }));
    const drive = buildPlan(d, baseInput({ ...over, breaks: [{ after: "a", days: 10, mode: "drive" }] }));
    expect(drive.breaks[0].roadDays).toBe(2 * (daysEach - 1));
    expect(drive.days - fly.days).toBe(2 * (daysEach - 1));
    expect(drive.stops[1].date).toBe(addDays(fly.stops[1].date, 2 * (daysEach - 1)));
    expect(drive.totals.tripDays).toBe(fly.totals.tripDays);
  });

  it("boards the dog while the family flies home", () => {
    const p = buildPlan(fixture(), baseInput({ dog: true, dogPerDay: 0, boardingPerDay: 100, breaks: [{ after: "a", days: 10, mode: "fly" }] }));
    expect(p.breaks[0].dogBoarding).toBe(10);
    expect(p.costs.dog).toBe(1000);
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

  it("leaves earlier when driving home takes several days, to be home before New Year's Eve", () => {
    const { d, daysEach } = farHome();
    const over = { start: "远城", maxDriveHours: 7, startDate: "2027-12-20", nightsOverride: { a: 60 } };
    const fly = buildPlan(d, baseInput({ ...over, newYearHome: { days: 14, mode: "fly" } }));
    const drive = buildPlan(d, baseInput({ ...over, newYearHome: { days: 14, mode: "drive" } }));
    expect(fly.breaks[0].date).toBe("2028-01-22");
    expect(drive.breaks[0].date).toBe(addDays("2028-01-22", -(daysEach - 1)));
    // arriving home three days before New Year's Eve (2028-01-25)
    expect(addDays(drive.breaks[0].date, daysEach - 1)).toBe("2028-01-22");
  });

  it("needs no extra trip when the traveller is already home for another break", () => {
    const p = buildPlan(fixture(), baseInput({
      startDate: "2028-01-10", newYearHome: { days: 14, mode: "fly" }, breaks: [{ after: "a", days: 20, mode: "fly" }],
    }));
    expect(p.breaks.filter((b) => b.newYear)).toHaveLength(0);
  });
});
