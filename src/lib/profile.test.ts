import { describe, expect, it } from "vitest";
import { buildPlan } from "./plan";
import { buildProfile, type RawSample } from "./profile";
import { baseInput, fixture } from "./fixture";
import type { Plan } from "./types";

const data = fixture();
// samples every 100 km along the stored loop a→b→c→d→a (100, 300, 200, 400 km)
const raw: RawSample[] = [
  [0, 10, 0], [100, 20, 1], [200, 30, 1], [300, 40, 1], [400, 50, 2], [500, 60, 2], [600, 70, 3], [700, 80, 3], [800, 90, 3], [900, 100, 3],
];

describe("buildProfile", () => {
  it("keeps samples on bundled legs and leaves added legs flat", async () => {
    const { applyCustomStops } = await import("./custom");
    const leg = { km: 50, h: 1, hw: 0, toll: null, geom: [] as [number, number][] };
    const d = applyCustomStops(data, [{ id: "x", name: "X", province: "浙江", ll: [30, 120], after: "a", nights: 1, legIn: leg, legOut: leg }]);
    const p = buildProfile(buildPlan(d, baseInput()), d, raw);
    // a→x and x→b (50 km each) have no samples; the replaced a→b sample is dropped; b→c starts at 100 km
    expect(p.length).toBe(raw.length - 1);
    expect(p.slice(0, 3).map((x) => [x.km, x.m])).toEqual([[100, 20], [200, 30], [300, 40]]);
  });

  it("keeps stored order clockwise from the stored start", () => {
    const p = buildProfile(buildPlan(data, baseInput()), data, raw);
    expect(p.map((x) => x.km)).toEqual(raw.map((r) => r[0]));
    expect(p.map((x) => x.m)).toEqual(raw.map((r) => r[1]));
  });
  it("leaves a gap the length of a connecting drive and breaks the line there", () => {
    // a→b, then a 500 km connecting drive, then c→d
    const plan = { legs: [{ parts: [
      { leg: 0, reversed: false }, { transfer: "b>c", reversed: false, km: 500, estimated: true }, { leg: 2, reversed: false },
    ] }] } as unknown as Plan;
    const p = buildProfile(plan, data, raw);
    expect(p.map((x) => [x.km, x.m, !!x.gapBefore])).toEqual([[0, 10, false], [600, 50, true], [700, 60, false]]);
  });

  it("starts at the entry and mirrors legs counter-clockwise", () => {
    const p = buildProfile(buildPlan(data, baseInput({ direction: "ccw" })), data, raw);
    // first travelled leg is d→a reversed (stored d→a is 400 km, samples at 0..300 into it)
    expect(p.slice(0, 4).map((x) => [x.km, x.m])).toEqual([[100, 100], [200, 90], [300, 80], [400, 70]]);
    expect(p.length).toBe(raw.length);
    expect(Math.max(...p.map((x) => x.km))).toBeLessThanOrEqual(1000);
  });
});
