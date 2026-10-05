import { describe, expect, it } from "vitest";
import { budgetOptions } from "./budget";
import { boardingDays, energyFor, energyForDay } from "./costs";
import { baseInput, fixture } from "./fixture";
import { buildPlan } from "./plan";
import type { Dataset, MonthClimate } from "./types";

const mild: MonthClimate = [24, 14, 60, 5];
function bases(...ids: string[]): Dataset {
  const d = fixture();
  for (const n of d.nodes) n.base = ids.includes(n.id);
  d.climate = Object.fromEntries(ids.map((id) => [id, Array(12).fill(mild)]));
  return d;
}

describe("energy for a day's driving", () => {
  const input = baseInput({ vehicle: "phev", evRangeKm: 100, kwhPer100: 18, lPer100: 6, elecPrice: 1 });

  it("uses the overnight charge once across the legs of one day", () => {
    const day = energyForDay([{ km: 80, seg: "Z", fuelPrice: 8 }, { km: 80, seg: "Z", fuelPrice: 8 }], input);
    const once = energyFor(160, "Z", 8, input);
    expect(day.kwh).toBeCloseTo(once.kwh);
    expect(day.fuelL).toBeCloseTo(once.fuelL);
    // charging per leg would have counted the battery twice
    expect(day.kwh).toBeLessThan(energyFor(80, "Z", 8, input).kwh * 2);
  });

  it("drives through a skipped stop on one charge", () => {
    const p = buildPlan(fixture(), { ...input, skip: ["b"] });
    const leg = p.legs.find((l) => l.from === "a")!;
    expect(leg.via).toEqual(["b"]);
    expect(leg.energy.kwh).toBeCloseTo(energyFor(400, "A", 8, input).kwh);
  });
});

describe("dog boarding", () => {
  it("boards the dog on attraction days only, not for the whole stay", () => {
    const d = fixture();
    const banned = d.attractions.filter((a) => a.node === "a");
    expect(boardingDays(banned, 14)).toBe(1);
    expect(boardingDays(banned, 1)).toBe(1);
    expect(boardingDays([], 14)).toBe(0);
    const p = buildPlan(d, baseInput({ dog: true, dogCare: "boarding", dogPerDay: 0, boardingPerDay: 100, nightsOverride: { a: 14 } }));
    expect(p.costs.dog).toBe(100);
  });
});

describe("waiting for the season", () => {
  const gates = { B: [7, 8] as [number, number] };

  it("waits at a long-stay base, never at an ordinary stop just before the region", () => {
    const p = buildPlan(bases("a"), baseInput({ waitForSeason: true }), gates);
    const [a, b, c] = p.stops;
    expect(b.waitDays).toBe(0);
    expect(a.waitDays).toBeGreaterThan(0);
    expect(c.date).toBe("2027-07-01");
  });

  it("waits long enough for every seasonal region before the next base", () => {
    const d = bases("a", "b");
    d.nodes[3].seg = "C";
    const p = buildPlan(d, baseInput({ waitForSeason: true }), { B: [7, 8], C: [8, 8] });
    const c = p.stops.find((s) => s.node.id === "c")!;
    const dd = p.stops.find((s) => s.node.id === "d")!;
    // the earliest start that has both regions in season: C from 1 August, three nights at c before it
    expect(dd.date).toBe("2027-08-01");
    expect(c.date).toBe("2027-07-29");
  });

  it("counts a trip home taken while waiting as part of the wait", () => {
    const d = bases("a", "b");
    const stay = buildPlan(d, baseInput({ waitForSeason: true }), gates);
    const home = buildPlan(d, baseInput({ waitForSeason: true, breaks: [{ after: "b", days: 30, mode: "drive" }] }), gates);
    const bStay = stay.stops.find((s) => s.node.id === "b")!;
    const bHome = home.stops.find((s) => s.node.id === "b")!;
    expect(bHome.waitDays).toBe(bStay.waitDays - 30);
    expect(home.stops.find((s) => s.node.id === "c")!.date).toBe("2027-07-01");
    expect(home.days).toBe(stay.days);
  });
});

describe("long stays", () => {
  it("counts the interval between long stays as travel time after the last one ends", () => {
    const d = bases("a", "b", "c");
    d.nodes[2].alt = 100;
    const p = buildPlan(d, baseInput({ sojournEveryWeeks: 0.2, sojournWeeks: 4 }));
    expect(p.stops[1].sojourn).toBe(true);
    // c comes straight after b's four weeks: no second long stay yet
    expect(p.stops[2].sojourn).toBe(false);
  });

  it("treats a month spent waiting for the season as a long stay", () => {
    const d = bases("a", "b", "c");
    d.nodes[2].alt = 100;
    const p = buildPlan(d, baseInput({ waitForSeason: true, sojournEveryWeeks: 1, sojournWeeks: 4 }), { B: [7, 8] });
    expect(p.stops[1].waitDays).toBeGreaterThanOrEqual(28);
    expect(p.stops[2].sojourn).toBe(false);
  });
});

describe("warnings", () => {
  it("counts nights at altitude, not places", () => {
    const p = buildPlan(fixture(), baseInput({ nightsOverride: { c: 3 } }));
    expect(p.warnings.find((w) => w.kind === "altitude")!.text).toContain("3 晚住在海拔 4000m 以上（1 个地方）");
  });

  // rename the fixture's b → c leg to the Duku highway (open June–September)
  function duku(): Dataset {
    const d = fixture();
    const rename = (id: string) => (id === "b" ? "kuche" : id === "c" ? "bayinbuluke" : id);
    for (const n of d.nodes) n.id = rename(n.id);
    for (const l of d.legs) { l.frm = rename(l.frm); l.to = rename(l.to); }
    for (const a of d.attractions) a.node = rename(a.node);
    d.prices = Object.fromEntries(Object.entries(d.prices).map(([k, v]) => [rename(k), v]));
    return d;
  }

  it("judges a seasonal road by the day it is driven", () => {
    // arrive at Kuche in late September, leave in October
    const p = buildPlan(duku(), baseInput({ startDate: "2027-09-27", nightsOverride: { kuche: 5 } }));
    expect(p.stops[1].date.slice(0, 7)).toBe("2027-09");
    expect(p.warnings.some((w) => w.kind === "road-season" && w.text.includes("独库公路") && w.text.includes("10 月"))).toBe(true);
  });

  it("warns about a closed seasonal road also when its stops are only passed through", () => {
    const p = buildPlan(duku(), baseInput({ startDate: "2027-01-10", skip: ["kuche", "bayinbuluke"] }));
    expect(p.stops.some((s) => s.node.id === "kuche")).toBe(false);
    expect(p.warnings.some((w) => w.kind === "road-season" && w.text.includes("独库公路"))).toBe(true);
  });
});

describe("budget options", () => {
  it("shortens stays one step at a time", () => {
    const opt = budgetOptions(fixture(), baseInput({ stayFactor: 1.25 })).find((o) => o.change.stayFactor != null);
    expect(opt?.change.stayFactor).toBe(1);
    expect(opt?.label).toContain("×1）");
  });
});
