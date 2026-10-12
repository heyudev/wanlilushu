import { describe, expect, it, vi } from "vitest";
import { gcjToWgs, wgsToGcj } from "./coords";
import { defaultShortTrip, type TripPlace } from "./shortTrip";
import { abortable, queryShortTrip, queryTripDrive, searchTripPlaces, tripErrorMessage } from "./shortTripAmap";

const a: TripPlace = { name: "起点", address: "", ll: [120, 30] };
const b: TripPlace = { name: "终点", address: "", ll: [121, 31] };
const result = { routes: [{ distance: 10000, time: 1800, tolls: 0, steps: [{ path: [{ lng: 120, lat: 30 }, { lng: 121, lat: 31 }] }] }] };
function sdk(callback: (...args: any[]) => void) {
  return { LngLat: class { constructor(public lng: number, public lat: number) {} }, DrivingPolicy: { LEAST_TIME: 0, LEAST_FEE: 1, LEAST_DISTANCE: 2 },
    Driving: class { constructor(public options: any) {} search(from: any, to: any, cb: any) { callback(from, to, cb, this.options); } } };
}
describe("short-trip AMap integration boundaries", () => {
  it("shows SDK failures even when the loader rejects without an Error object", () => {
    expect(tripErrorMessage("")).toContain("加载或查询失败");
    expect(tripErrorMessage(new Error("具体错误"))).toBe("具体错误");
  });
  it("converts coordinates at the SDK boundary and chooses the requested driving policy", async () => {
    const AMap = sdk((from, to, cb, options) => {
      expect([from.lng, from.lat]).toEqual(wgsToGcj(...a.ll)); expect([to.lng, to.lat]).toEqual(wgsToGcj(...b.ll));
      expect(options.policy).toBe(1); cb("complete", result);
    });
    const l = await queryTripDrive(AMap, a, b, "leastFee", new AbortController().signal);
    expect(l.km).toBe(10); expect(l.h).toBe(0.5); expect(l.toll).toBe(0);
    expect(l.geom[0]).toEqual(gcjToWgs(120, 30));
  });
  it("queries ordered outgoing legs and the distinct return direction sequentially", async () => {
    const calls: number[] = [];
    const AMap = sdk((from, _to, cb) => { calls.push(from.lng); cb("complete", result); });
    const progress = vi.fn();
    const legs = await queryShortTrip(AMap, { ...defaultShortTrip("2026-10-12"), origin: a, destination: b }, new AbortController().signal, progress);
    expect(calls).toEqual([wgsToGcj(...a.ll)[0], wgsToGcj(...b.ll)[0]]); expect(legs).toHaveLength(2); expect(progress).toHaveBeenLastCalledWith(2, 2);
  });
  it("stops on a failed leg without returning a partial or estimated route", async () => {
    let calls = 0;
    const AMap = sdk((_from, _to, cb) => { calls++; cb("error", "NO_ROUTE"); });
    await expect(queryShortTrip(AMap, { ...defaultShortTrip("2026-10-12"), origin: a, destination: b }, new AbortController().signal, vi.fn())).rejects.toThrow("没有查到");
    expect(calls).toBe(1);
  });
  it("rejects malformed distances and paths instead of using straight-line geometry", async () => {
    for (const r of [{ ...result.routes[0], time: NaN }, { ...result.routes[0], steps: [] }, { ...result.routes[0], tolls: -1 }]) {
      await expect(queryTripDrive(sdk((_a, _b, cb) => cb("complete", { routes: [r] })), a, b, "fastest", new AbortController().signal)).rejects.toThrow("数据不完整");
    }
  });
  it("bounds waiting and ignores late callbacks after cancellation or timeout", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController(); let late!: (v: number) => void;
      const pending = abortable<number>((resolve) => { late = resolve; }, controller.signal);
      const rejected = expect(pending).rejects.toThrow("取消或超时");
      setTimeout(() => controller.abort(), 15000); await vi.advanceTimersByTimeAsync(15000); await rejected;
      late(42); await expect(pending).rejects.toThrow("取消或超时");
      const start = vi.fn(); await expect(abortable(start, controller.signal)).rejects.toThrow("取消或超时"); expect(start).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("keeps search candidates transient and filters missing coordinates", async () => {
    const AMap = { PlaceSearch: class { search(_q: string, cb: any) { cb("complete", { poiList: { pois: [{ name: "地点", location: { lng: 120, lat: 30 }, address: "街道" }, { name: "无坐标" }] } }); } } };
    const places = await searchTripPlaces(AMap, "地点", new AbortController().signal);
    expect(places).toHaveLength(1); expect(places[0].ll).toEqual(gcjToWgs(120, 30));
  });
  it("shows a safe service error code without copying URLs or credentials into the UI", async () => {
    for (const code of ["INVALID_USER_DOMAIN", "https://example.test/?key=private"]) {
      const AMap = { PlaceSearch: class { search(_q: string, cb: any) { cb("error", code); } } };
      try {
        await searchTripPlaces(AMap, "地点", new AbortController().signal);
        throw new Error("Expected service failure");
      } catch (e) {
        expect((e as Error).message).toContain("查询失败");
        if (code === "INVALID_USER_DOMAIN") expect((e as Error).message).toContain(code);
        else expect((e as Error).message).not.toContain("private");
      }
    }
  });
});
