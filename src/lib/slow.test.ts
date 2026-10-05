import { describe, expect, it } from "vitest";
import { budgetOptions, fitToBudget } from "./budget";
import { buildPlan, costTotal, daysUntilWindow, nightsFor } from "./plan";
import { baseInput, fixture } from "./fixture";
import type { Dataset, MonthClimate } from "./types";

// fixture loop a(A) → b(A) → c(B) → d(B) → a; make a and b long-stay bases with a mild climate
const mild: MonthClimate = [24, 14, 60, 5];
function slowData(): Dataset {
  const d = fixture();
  d.nodes[0].base = true;
  d.nodes[1].base = true;
  d.climate = { a: Array(12).fill(mild), b: Array(12).fill(mild) };
  return d;
}

describe("rhythm", () => {
  it("stretches nights by the stay factor", () => {
    const d = fixture();
    expect(nightsFor(d.nodes[2], baseInput({ stayFactor: 2 }))).toBe(6);
    expect(nightsFor(d.nodes[3], baseInput({ stayFactor: 1.5 }))).toBe(2);
  });

  it("turns a comfortable base into a long stay once the interval since departure has passed", () => {
    const p = buildPlan(slowData(), baseInput({ sojournEveryWeeks: 0.1, sojournWeeks: 4 }));
    // the interval counts from departure, so the first stop is a normal stay
    expect(p.stops[0].sojourn).toBe(false);
    const b = p.stops[1];
    expect(b.sojourn).toBe(true);
    expect(b.nights).toBe(28);
    expect(b.sleep).toBe("R");
  });

  it("stays one to two weeks at comfortable bases, priced as hotel nights", () => {
    const p = buildPlan(slowData(), baseInput({ comfortStayNights: 10 }));
    expect(p.stops[0].comfortStay).toBe(true);
    expect(p.stops[0].nights).toBe(10);
    expect(p.stops[1].nights).toBe(10);
    expect(p.stops[0].sleep).toBe("H");
    // stop c is not a base
    expect(p.stops[2].comfortStay).toBe(false);
  });

  it("skips the extra stay when the month is uncomfortable", () => {
    const d = slowData();
    d.climate.a = Array(12).fill([2, -10, 50, 2]);
    const p = buildPlan(d, baseInput({ comfortStayNights: 10 }));
    expect(p.stops[0].comfortStay).toBe(false);
    expect(p.stops[0].nights).toBe(2);
  });

  it("does not repeat a long stay before the interval is over", () => {
    const d = slowData();
    d.nodes[2].base = true;
    d.climate.c = Array(12).fill(mild);
    d.nodes[2].alt = 100;
    const p = buildPlan(d, baseInput({ sojournEveryWeeks: 4, sojournWeeks: 3 }));
    expect(p.stops.filter((s) => s.sojourn).length).toBe(0);
  });

  it("costs long stays as monthly rent", () => {
    const p = buildPlan(slowData(), baseInput({ sojournEveryWeeks: 0.1, sojournWeeks: 4, rentPerMonth: 3000 }));
    expect(p.stops[1].lodgingCost).toBeCloseTo(28 * 100);
  });
});

describe("waiting for the season", () => {
  it("counts days to the next window", () => {
    expect(daysUntilWindow("2027-05-10", [4, 10])).toBe(0);
    expect(daysUntilWindow("2027-11-15", [4, 10])).toBe(daysUntilWindow("2027-11-15", [4, 4]));
    expect(daysUntilWindow("2027-02-01", [4, 10])).toBe(59);
  });

  it("waits at the last base before a gated region until it opens", () => {
    const d = slowData();
    d.segs[1].k = "B";
    // segment B (stops c, d) only open in July–August for this test
    const input = baseInput({ waitForSeason: true, maxWaitDays: 120, startDate: "2027-04-01" });
    const gates = { B: [7, 8] as [number, number] };
    const p = buildPlan({ ...d }, input, gates);
    const b = p.stops.find((s) => s.node.id === "b")!;
    const c = p.stops.find((s) => s.node.id === "c")!;
    expect(b.waitDays).toBeGreaterThan(0);
    expect(c.date >= "2027-07-01").toBe(true);
    expect(p.warnings.some((w) => w.text.includes("多住"))).toBe(true);
  });

  it("does not wait longer than allowed, and warns once per region instead", () => {
    const d = slowData();
    const gates = { B: [7, 8] as [number, number] };
    const p = buildPlan(d, baseInput({ waitForSeason: true, maxWaitDays: 30, startDate: "2027-04-01" }), gates);
    expect(p.totals.waitDays).toBe(0);
    expect(p.stops.every((s) => s.waitDays === 0)).toBe(true);
    const skipped = p.warnings.filter((w) => w.text.includes("没有等"));
    expect(skipped).toHaveLength(1);
    expect(skipped[0].text).toContain("最多等 30 天");
  });

  it("waits when the window opens within the allowed days", () => {
    const d = slowData();
    // allowed exactly up to the days needed, skipped one day short of it
    const gates = { B: [7, 8] as [number, number] };
    const allowed = buildPlan(d, baseInput({ waitForSeason: true, maxWaitDays: 120, startDate: "2027-04-20" }), gates);
    const need = allowed.totals.waitDays;
    expect(need).toBeGreaterThan(0);
    expect(buildPlan(d, baseInput({ waitForSeason: true, maxWaitDays: need, startDate: "2027-04-20" }), gates).totals.waitDays).toBe(need);
    expect(buildPlan(d, baseInput({ waitForSeason: true, maxWaitDays: need - 1, startDate: "2027-04-20" }), gates).totals.waitDays).toBe(0);
  });
});

describe("trips home", () => {
  it("pauses the calendar without daily trip costs", () => {
    const d = fixture();
    const stay = buildPlan(d, baseInput());
    const home = buildPlan(d, baseInput({ breaks: [{ after: "b", days: 30, mode: "fly" }], flightPerPerson: 1000, parkingPerDay: 20 }));
    expect(home.days).toBe(stay.days + 30);
    expect(home.totals.breakDays).toBe(30);
    expect(home.costs.food).toBe(stay.costs.food);
    expect(home.costs.home).toBe(1000 * 2 * 2 + 20 * 30);
    expect(home.breaks[0].after).toBe("b");
  });
});

describe("budget", () => {
  it("lists cheaper settings, biggest saving first", () => {
    const d = fixture();
    const opts = budgetOptions(d, baseInput({ lodging: "comfort" }));
    expect(opts.length).toBeGreaterThan(0);
    for (let i = 1; i < opts.length; i++) expect(opts[i - 1].saves).toBeGreaterThanOrEqual(opts[i].saves);
  });

  it("combines options until the plan fits", () => {
    const d = fixture();
    const input = baseInput({ lodging: "comfort" });
    const full = costTotal(buildPlan(d, input).costs);
    const fit = fitToBudget(d, { ...input, budget: full * 0.8 })!;
    expect(fit.total).toBeLessThan(full);
    expect(fit.labels.length).toBeGreaterThan(0);
    expect(fitToBudget(d, input)).toBeNull();
  });
});

describe("dog size", () => {
  it("warns about Beijing only for dogs that may exceed 35 cm, and about hotels for large dogs", () => {
    const d = fixture();
    d.nodes[1].id = "beijing";
    d.legs[0].to = "beijing"; d.legs[1].frm = "beijing";
    const kinds = (size: "small" | "medium" | "large") =>
      buildPlan(d, baseInput({ dog: true, dogSize: size })).warnings.filter((w) => w.kind === "dog").map((w) => w.text.slice(0, 6));
    expect(kinds("small").some((t) => t.startsWith("北京"))).toBe(false);
    expect(kinds("medium").some((t) => t.startsWith("北京"))).toBe(true);
    expect(kinds("large").some((t) => t.startsWith("大型犬"))).toBe(true);
  });
});
