import { describe, expect, it } from "vitest";
import { bestStartDates, buildPlan, costTotal, keepNode, nightsFor, orderLoop } from "./plan";
import { baseInput, fixture } from "./fixture";
import { loadDataset } from "./data";

const data = fixture();

describe("orderLoop", () => {
  it("rotates clockwise from the entry", () => {
    const { nodes, legs } = orderLoop(data, 2, "cw");
    expect(nodes.map((n) => n.id)).toEqual(["c", "d", "a", "b"]);
    expect(legs.map((l) => `${l.frm}${l.to}`)).toEqual(["cd", "da", "ab", "bc"]);
  });
  it("reverses legs counter-clockwise", () => {
    const { nodes, legs } = orderLoop(data, 0, "ccw");
    expect(nodes.map((n) => n.id)).toEqual(["a", "d", "c", "b"]);
    expect(legs.map((l) => `${l.frm}${l.to}`)).toEqual(["ad", "dc", "cb", "ba"]);
    expect(legs[0].km).toBe(400);
  });
});

describe("buildPlan", () => {
  it("visits every stop on the full pace and closes the loop", () => {
    const p = buildPlan(data, baseInput());
    expect(p.stops.map((s) => s.node.id)).toEqual(["a", "b", "c", "d", "a"]);
    expect(p.totals.km).toBe(1000);
    // nights 2+1+3+1 = 7 → arrive back on day 7, trip is 8 calendar days
    expect(p.days).toBe(8);
    expect(p.endDate).toBe("2027-04-08");
    expect(p.stops.map((s) => s.date)).toEqual(["2027-04-01", "2027-04-03", "2027-04-04", "2027-04-07", "2027-04-08"]);
  });

  it("skips low-star stops on a faster pace but keeps the distance", () => {
    const p = buildPlan(data, baseInput({ pace: "essentials", interests: [], maxDriveHours: 12 }));
    expect(p.stops.map((s) => s.node.id)).toEqual(["a", "c", "a"]);
    expect(p.legs[0].via).toEqual(["b"]);
    expect(p.legs[0].km).toBe(400);
    expect(p.totals.km).toBe(1000);
  });

  it("inserts a transit night when a merged drive gets too long", () => {
    const p = buildPlan(data, baseInput({ pace: "essentials", interests: [], maxDriveHours: 7 }));
    // c → d (3h) + d → a (5h) = 8h > 7h, so d becomes a one-night transit stop
    const d = p.stops.find((s) => s.node.id === "d");
    expect(d?.transit).toBe(true);
    expect(d?.nights).toBe(1);
  });

  it("trims nights on faster paces, never below one", () => {
    const c = data.nodes[2]; // star 3, 3 nights
    const d = data.nodes[3]; // star 2, 1 night
    expect(nightsFor(c, baseInput({ pace: "full" }))).toBe(3);
    expect(nightsFor(c, baseInput({ pace: "highlights" }))).toBe(3);
    expect(nightsFor(c, baseInput({ pace: "essentials" }))).toBe(2);
    expect(nightsFor(d, baseInput({ pace: "highlights" }))).toBe(1);
  });

  it("lets interests rescue a stop one star below the cut", () => {
    const b = data.nodes[1];
    expect(keepNode(b, baseInput({ pace: "highlights", interests: [] }))).toBe(false);
    expect(keepNode(b, baseInput({ pace: "highlights", interests: ["food"] }))).toBe(true);
  });

  it("adds the approach from a departure city off the loop, both ways", () => {
    const p = buildPlan(data, baseInput({ start: "远方", maxDriveHours: 7 }));
    expect(p.entry.id).toBe("c");
    expect(p.approach).toEqual({ km: 500, h: 10, hw: 400, days: 2 });
    expect(p.totals.km).toBe(1000 + 1000);
    expect(p.stops[0].date).toBe("2027-04-02");
  });

  it("costs fuel, tolls, food and lodging from the inputs", () => {
    const p = buildPlan(data, baseInput());
    expect(p.costs.fuel).toBeCloseTo((1000 * 5) / 100 * 8);
    expect(p.costs.toll).toBeCloseTo(500 * 0.5);
    // three meals: 2 × quick p50 + meal p50 → a, b = 40 + 60 = 100; c = 30 + 40 = 70;
    // d has too little data and borrows c's prices; the one day not tied to a stop's nights is priced at the entry (a)
    expect(p.costs.food).toBe(2 * (2 * 100 + 1 * 100 + 3 * 70 + 1 * 70 + 1 * 100));
    expect(p.stops[3].priceFrom).toBe("c");
    // a: 2 nights, b: 1 (balanced → camp 80), c: 3, d: 1, end: 0 → hotel nights 6 × 300
    expect(p.costs.lodging).toBe(6 * 300 + 80);
    // a1 peak 100 + 20 shuttle for 2 adults in April
    expect(p.costs.tickets).toBe(240);
    expect(costTotal(p.costs)).toBeGreaterThan(0);
  });

  it("prices fewer meals a day", () => {
    const two = buildPlan(data, baseInput({ meals: 2 }));
    const one = buildPlan(data, baseInput({ meals: 1 }));
    expect(two.stops[0].foodPerPerson).toBe(60 + 20);
    expect(one.stops[0].foodPerPerson).toBe(60);
  });

  it("uses your own per-meal amount in manual mode", () => {
    const flat = buildPlan(data, baseInput({ foodMode: "manual", foodPerMeal: 40, meals: 2, localPrice: false }));
    expect(flat.costs.food).toBe(8 * 2 * 80);
    const scaled = buildPlan(data, baseInput({ foodMode: "manual", foodPerMeal: 40, meals: 2, localPrice: true }));
    // a is pricier than average (index 1.2), c cheaper (0.8)
    expect(scaled.stops[0].foodPerPerson).toBeCloseTo(96);
    expect(scaled.stops[2].foodPerPerson).toBeCloseTo(64);
    const empty = buildPlan(data, baseInput({ foodMode: "manual", foodPerMeal: null }));
    expect(empty.costs.food).toBe(0);
    expect(empty.uncosted).toContain("food");
  });

  it("leaves lodging out and says so when no hotel price is filled in", () => {
    const p = buildPlan(data, baseInput({ hotelPerRoom: null, lodging: "comfort" }));
    expect(p.costs.lodging).toBe(0);
    expect(p.uncosted).toContain("hotel");
  });

  it("scales the hotel price by the local price level", () => {
    const p = buildPlan(data, baseInput({ lodging: "comfort", localPrice: true, hotelPerRoom: 300 }));
    // a: 60 / 50 = 1.2 → 360 a night; c: 40 / 50 = 0.8 → 240
    expect(p.stops[0].lodgingCost).toBe(2 * 360);
    expect(p.stops[2].lodgingCost).toBe(3 * 240);
  });

  it("only charges dog boarding when asked to", () => {
    const rotate = buildPlan(data, baseInput({ dog: true, dogCare: "rotate", dogPerDay: 10 }));
    const board = buildPlan(data, baseInput({ dog: true, dogCare: "boarding", dogPerDay: 10, boardingPerDay: 100 }));
    expect(rotate.costs.dog).toBe(80);
    expect(board.costs.dog).toBe(80 + 100); // stop a has a pet ban, 1 stay day
  });

  it("reports stops outside their best season", () => {
    const p = buildPlan(data, baseInput({ startDate: "2027-12-01" }));
    expect(p.warnings.some((w) => w.kind === "season")).toBe(true);
    expect(p.seasonScore.off).toBeGreaterThan(0);
  });
});

describe("bestStartDates", () => {
  it("prefers dates when stops are in season", () => {
    const best = bestStartDates(data, baseInput(), "2027-01-01", 365, 2);
    expect(best[0].date >= "2027-03-01" && best[0].date <= "2027-05-31").toBe(true);
  });
});

describe("real dataset", () => {
  const real = loadDataset();
  it("has one leg per node forming a closed loop", () => {
    expect(real.legs.length).toBe(real.nodes.length);
    real.legs.forEach((l, i) => {
      expect(l.frm).toBe(real.nodes[i].id);
      expect(l.to).toBe(real.nodes[(i + 1) % real.nodes.length].id);
    });
  });
  it("keeps the loop distance whatever the entry point and direction", () => {
    const sum = real.legs.reduce((s, l) => s + l.km, 0);
    for (const start of ["上海", "成都", "乌鲁木齐"]) {
      for (const direction of ["cw", "ccw"] as const) {
        const p = buildPlan(real, { ...baseInput(), start, direction, includeExcursions: false });
        const loopKm = p.legs.reduce((s, l) => s + l.km, 0);
        expect(loopKm).toBeCloseTo(sum, 0);
      }
    }
  });
  it("resolves every departure city to a stop on the loop", () => {
    const ids = new Set(real.nodes.map((n) => n.id));
    for (const s of real.starts) expect(ids.has(s.entry)).toBe(true);
  });
});
