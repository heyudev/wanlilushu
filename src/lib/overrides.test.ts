import { describe, expect, it } from "vitest";
import { applyCustomStops } from "./custom";
import { buildPlan } from "./plan";
import { baseInput, fixture } from "./fixture";
import type { CustomStop } from "./types";

const data = fixture();
const leg = (km: number) => ({ km, h: km / 80, hw: km / 2, toll: null, geom: [[120, 30], [121, 31]] as [number, number][] });
const extra: CustomStop = { id: "x", name: "小镇", province: "浙江", ll: [30.5, 120.5], after: "a", nights: 2, legIn: leg(60), legOut: leg(70) };

describe("editing the route", () => {
  it("skips a stop but keeps driving through it", () => {
    const p = buildPlan(data, baseInput({ skip: ["b"], maxDriveHours: 12 }));
    expect(p.stops.map((s) => s.node.id)).toEqual(["a", "c", "d", "a"]);
    expect(p.legs[0].via).toEqual(["b"]);
    expect(p.totals.km).toBe(1000);
  });

  it("drives through a whole segment without stopping", () => {
    const p = buildPlan(data, baseInput({ skipSegs: ["B"], maxDriveHours: 12 }));
    expect(p.stops.some((s) => s.node.seg === "B" && !s.transit)).toBe(false);
  });

  it("uses the nights chosen for a stop", () => {
    const p = buildPlan(data, baseInput({ nightsOverride: { c: 5 }, stayFactor: 2 }));
    expect(p.stops.find((s) => s.node.id === "c")!.nights).toBe(5);
    expect(p.stops.find((s) => s.node.id === "a")!.nights).toBe(4);
  });

  it("splices an added place in after its anchor with its own legs", () => {
    const d = applyCustomStops(data, [extra]);
    expect(d.nodes.map((n) => n.id)).toEqual(["a", "x", "b", "c", "d"]);
    expect(d.legs.map((l) => `${l.frm}${l.to}`)).toEqual(["ax", "xb", "bc", "cd", "da"]);
    expect(d.legs[0].orig).toBeUndefined();
    expect(d.legs[2].orig).toBe(1);
    const p = buildPlan(d, baseInput());
    expect(p.stops.map((s) => s.node.id)).toEqual(["a", "x", "b", "c", "d", "a"]);
    // a→b (100 km) is replaced by 60 + 70 km
    expect(p.totals.km).toBe(1000 - 100 + 130);
    expect(p.stops[1].nights).toBe(2);
  });

  it("ignores an added place whose anchor no longer exists", () => {
    const d = applyCustomStops(data, [{ ...extra, after: "zz" }]);
    expect(d.nodes.length).toBe(4);
  });
});
