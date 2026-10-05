import { describe, expect, it } from "vitest";
import { monthlyView } from "./calendar";
import { planToGpx } from "./gpx";
import { buildPlan } from "./plan";
import { searchStops } from "./search";
import { decodePlan, diffFromDefaults, encodePlan } from "./share";
import { DEFAULT_INPUT } from "./defaults";
import { baseInput, fixture } from "./fixture";

const data = fixture();

describe("share links", () => {
  it("keeps only settings that differ from the defaults", () => {
    expect(diffFromDefaults({ ...DEFAULT_INPUT, adults: 3 })).toEqual({ adults: 3 });
  });
  it("round-trips settings through a share code", async () => {
    const input = { ...DEFAULT_INPUT, start: "成都", skip: ["dali"], nightsOverride: { lasa: 6 } };
    const code = await encodePlan(input);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePlan(code)).toEqual(input);
  });
  it("rejects a damaged code", async () => {
    expect(await decodePlan("not-a-plan")).toBeNull();
  });
});

describe("GPX export", () => {
  it("writes each stop once and the route as a track", () => {
    const gpx = planToGpx(buildPlan(data, baseInput()), data);
    expect(gpx.match(/<wpt /g)?.length).toBe(4);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain("<trk>");
  });
});

describe("monthly view", () => {
  it("splits a stay that crosses a month end and keeps every day", () => {
    const p = buildPlan(data, baseInput({ startDate: "2027-04-29" }));
    const months = monthlyView(p);
    expect(months.map((m) => m.month)).toEqual(["2027-04", "2027-05"]);
    const days = months.flatMap((m) => m.runs).reduce((a, r) => a + r.days, 0);
    expect(days).toBe(p.stops.reduce((a, s) => a + (s.nights || 1), 0));
    expect(months.reduce((a, m) => a + m.km, 0)).toBe(p.totals.km);
  });
});

describe("search", () => {
  it("ranks a name match first and finds foods and tags", () => {
    const d = fixture();
    d.nodes[1].food = [["螺蛳粉", "", "15–30"]];
    d.nodes[2].base = true;
    expect(searchStops(d, "C")[0].node.id).toBe("c");
    expect(searchStops(d, "螺蛳粉")[0].node.id).toBe("b");
    expect(searchStops(d, "旅居").map((h) => h.node.id)).toContain("c");
    expect(searchStops(d, "  ")).toEqual([]);
  });
});
