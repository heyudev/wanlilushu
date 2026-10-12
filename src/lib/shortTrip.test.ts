import { describe, expect, it } from "vitest";
import { buildShortTrip, defaultShortTrip, loadShortTrip, parseShortTrip, shortTripGpx, shortTripMarkdown, tripPairs, type TripDrive, type TripPlace } from "./shortTrip";

const a: TripPlace = { name: "出发点", address: "", ll: [120, 30] };
const b: TripPlace = { name: "目的地", address: "", ll: [121, 31] };
const c: TripPlace = { name: "途经点", address: "", ll: [120.5, 30.5] };
const input = () => ({ ...defaultShortTrip("2026-12-31"), origin: a, destination: b });
const leg = (from: TripPlace, to: TripPlace, h: number, km = h * 60, toll: number | null = 0): TripDrive => ({ from, to, h, km, toll, geom: [from.ll, to.ll] });

describe("short-trip scheduling requirements", () => {
  it("supports same-day return within the total daily driving limit", () => {
    const p = buildShortTrip({ ...input(), days: 1 }, [leg(a, b, 2), leg(b, a, 2)]);
    expect(p.days).toHaveLength(1);
    expect(p.days[0].drives.map((d) => d.to)).toEqual([b.name, a.name]);
    expect(p.days[0].overnight).toBeNull();
    expect(p.warnings.join(" ")).toContain("当天即开始返程");
  });
  it("rejects an infeasible trip instead of silently expanding dates", () => {
    expect(() => buildShortTrip({ ...input(), days: 2 }, [leg(a, b, 6), leg(b, a, 6)])).toThrow("至少需要 3 天");
  });
  it("spends spare days at the destination and ends return travel on the last day", () => {
    const p = buildShortTrip(input(), [leg(a, b, 2), leg(b, a, 3)]);
    expect(p.days.map((d) => d.date)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(p.days.map((d) => d.destinationStay)).toEqual([false, true, false]);
    expect(p.days.map((d) => d.overnight)).toEqual([b.name, b.name, null]);
    expect(p.days[2].drives[0].h).toBe(3);
  });
  it("splits long legs without inventing an overnight town and preserves distance", () => {
    const p = buildShortTrip({ ...input(), days: 3 }, [leg(a, b, 6), leg(b, a, 6)]);
    expect(p.days.map((d) => d.drives.reduce((s, d) => s + d.h, 0))).toEqual([4, 4, 4]);
    expect(p.days[0].overnight).toContain("住宿地点待选");
    expect(p.days[1].drives[0].to).toBe(b.name);
    expect(p.days[1].drives[1].from).toBe(b.name);
    expect(p.days.flatMap((d) => d.drives).reduce((s, d) => s + d.km, 0)).toBeCloseTo(p.km);
  });
  it("keeps waypoint order and uses a direct return in its actual direction", () => {
    const p = { ...input(), waypoints: [c] };
    expect(tripPairs(p)).toEqual([[a, c], [c, b], [b, a]]);
    const built = buildShortTrip(p, [leg(a, c, 1), leg(c, b, 2), leg(b, a, 4)]);
    expect(built.days[0].drives.map((d) => d.to)).toEqual([c.name, b.name]);
    expect(built.days[2].drives[0].h).toBe(4);
  });
  it("handles one-way stays without adding return distance or an extra hotel night", () => {
    const p = buildShortTrip({ ...input(), roundTrip: false, hotelPerNight: 200, foodPerDay: 100, energyPerKm: 1 }, [leg(a, b, 2)]);
    expect(p.km).toBe(120);
    expect(p.days.map((d) => d.destinationStay)).toEqual([false, true, true]);
    expect(p.subtotal).toBe(820);
  });
  it("keeps unknown fees unknown and does not count missing costs as zero-priced items", () => {
    const p = buildShortTrip({ ...input(), budget: 0, dog: true, kids: 1 }, [leg(a, b, 2, 120, null), leg(b, a, 2, 120, 20)]);
    expect(p.toll).toBeNull(); expect(p.subtotal).toBe(20);
    expect(p.missingCosts).toContain("部分过路费"); expect(p.missingCosts).toContain("住宿");
    expect(p.warnings.join(" ")).toContain("超过预算"); expect(p.warnings.join(" ")).toContain("宠物准入");
  });
  it("validates route identity, malformed numbers and incomplete geometry", () => {
    expect(() => buildShortTrip(input(), [leg(a, b, 1), leg(a, b, 1)])).toThrow("顺序不符");
    for (const bad of [NaN, Infinity, -1, 0]) expect(() => buildShortTrip(input(), [leg(a, b, bad), leg(b, a, 1)])).toThrow("路线不完整");
    expect(() => buildShortTrip(input(), [{ ...leg(a, b, 2), geom: [] }, leg(b, a, 1)])).toThrow("路线不完整");
    expect(() => buildShortTrip(input(), [leg(a, b, 1e9), leg(b, a, 1)])).toThrow("至少需要");
    expect(() => buildShortTrip({ ...input(), energyPerKm: Number.MAX_VALUE }, [leg(a, b, 2), leg(b, a, 2)])).toThrow("超出可计算范围");
  });
  it("rejects unresolved endpoints, identical adjacent places and too many waypoints", () => {
    expect(() => tripPairs(defaultShortTrip("2026-10-12"))).toThrow("选择出发点");
    expect(() => tripPairs({ ...input(), waypoints: [a] })).toThrow("相邻地点相同");
    expect(parseShortTrip({ ...input(), waypoints: Array(6).fill(c) })).toBeNull();
  });
  it("satisfies daily limits, trip duration, arrival and conserved totals across configurations", () => {
    for (const roundTrip of [false, true]) for (const maxDriveHours of [1, 4, 12]) for (const out of [0.2, 1, 4, 9]) for (const back of [0.2, 2, 7]) {
      const legs = [leg(a, b, out), ...(roundTrip ? [leg(b, a, back)] : [])];
      const min = Math.ceil((out + (roundTrip ? back : 0)) / maxDriveHours);
      for (const days of [min, min + 1, min + 3]) {
        const p = buildShortTrip({ ...input(), roundTrip, maxDriveHours, days }, legs);
        expect(p.days).toHaveLength(days);
        expect(p.days.every((d) => d.drives.reduce((s, l) => s + l.h, 0) <= maxDriveHours + 1e-8)).toBe(true);
        expect(p.days.flatMap((d) => d.drives).reduce((s, d) => s + d.h, 0)).toBeCloseTo(p.h);
        expect(p.days.flatMap((d) => d.drives).at(-1)?.to).toBe(roundTrip ? a.name : b.name);
        if (roundTrip) expect(p.days.at(-1)!.drives.at(-1)?.to).toBe(a.name);
      }
    }
  });
});

describe("short-trip storage and exports", () => {
  it("validates saved conditions, dates and nested coordinates", () => {
    expect(parseShortTrip(input())).toEqual(input());
    for (const bad of [{ days: 0 }, { days: 31 }, { days: 2.5 }, { maxDriveHours: 0 }, { startDate: "2027-02-30" }, { adults: 0 }, { energyPerKm: -1 }, { origin: { ...a, ll: [NaN, 30] } }, { policy: "unknown" }]) {
      expect(parseShortTrip({ ...input(), ...bad })).toBeNull();
    }
    expect(loadShortTrip(() => "{bad").error).toContain("损坏");
    expect(loadShortTrip(() => { throw new Error("denied"); }).error).toContain("无法读取");
    expect(loadShortTrip(() => null)).toEqual({ input: null, error: null });
    expect(parseShortTrip({ ...input(), foreign: 1 })).not.toHaveProperty("foreign");
  });
  it("includes constraints, each day, omitted costs, and uninterpreted notes in Markdown", () => {
    const p = buildShortTrip({ ...input(), notes: "想去看山" }, [leg(a, b, 2), leg(b, a, 2)]);
    const md = shortTripMarkdown(p);
    expect(md).toContain("2027-01-02"); expect(md).toContain("想去看山"); expect(md).toContain("未自动解释"); expect(md).toContain("未计");
  });
  it("exports escaped GPX with road geometry in WGS84", () => {
    const p = buildShortTrip({ ...input(), origin: { ...a, name: '<&"' } }, [leg(a, b, 2), leg(b, a, 2)]);
    const gpx = shortTripGpx(p);
    expect(gpx).toContain("&lt;&amp;&quot;"); expect(gpx).toContain('lat="30" lon="120"'); expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
  });
});
