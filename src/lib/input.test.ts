import { describe, expect, it } from "vitest";
import { applyCustomStops } from "./custom";
import { DEFAULT_INPUT } from "./defaults";
import { baseInput, fixture } from "./fixture";
import { loadSavedPlan, parsePlanInput } from "./input";
import { buildPlan } from "./plan";
import { decodePlan, encodePlan } from "./share";
import type { CustomStop } from "./types";

const custom: CustomStop = {
  id: "custom-place", name: "Added place", province: "", after: "a", ll: [30, 120], nights: 2,
  legIn: { km: 30, h: 0.5, hw: 10, toll: null, geom: [[120, 30], [121, 31]] },
  legOut: { km: 70, h: 1, hw: 20, toll: 10, geom: [] },
};

describe("external plan settings", () => {
  it("fills missing fields in an old plan and ignores unknown fields", () => {
    expect(parsePlanInput({ start: "成都", futureOption: true })).toEqual({ ...DEFAULT_INPUT, start: "成都" });
    expect(parsePlanInput({})).toEqual(DEFAULT_INPUT);
  });

  it("preserves zero prices, unfilled prices, empty selections and fractional driving parameters", () => {
    const input = { ...DEFAULT_INPUT, hotelPerRoom: 0, fuelPrice: null, interests: [], maxDriveHours: 3.5, stayFactor: 1.25, dog: false };
    expect(parsePlanInput(input)).toEqual(input);
  });

  it.each([null, [], ["route"], "route", 42, true, new Date()])("rejects a non-object plan: %j", (value) => {
    expect(parsePlanInput(value)).toBeNull();
  });

  it.each([
    { custom: null }, { skip: "dali" }, { skipSegs: [null] }, { interests: ["unknown"] },
    { routeOrder: "unknown" }, { vehicle: "unknown" }, { dogSize: "unknown" }, { dog: "false" },
    { adults: 0 }, { adults: 1.5 }, { kids: -1 }, { kids: 0.5 }, { meals: 4 },
    { maxDriveHours: 0 }, { maxDriveHours: NaN }, { stayFactor: Infinity },
    { hotelPerRoom: -1 }, { foodPerMeal: "50" }, { budget: -1 }, { minComfort: 1.1 },
    { nightsOverride: null }, { nightsOverride: [] }, { nightsOverride: { a: 0 } }, { nightsOverride: { a: 1.5 } },
    { breaks: [null] }, { breaks: [{ after: "a", days: 5, mode: "train" }] },
    { breaks: [{ days: 5, mode: "fly" }] }, { newYearHome: { days: -1, mode: "drive" } },
    { startDate: "invalid" }, { startDate: "2027-13-01" }, { startDate: "2027-02-29" },
    { startDate: "2027-04-31" }, { startDate: "2027-4-1" }, { start: "" },
  ])("rejects invalid supplied fields instead of replacing user choices: %j", (value) => {
    expect(parsePlanInput(value)).toBeNull();
  });

  it("accepts a leap day but rejects an impossible date", () => {
    expect(parsePlanInput({ startDate: "2028-02-29" })?.startDate).toBe("2028-02-29");
    expect(parsePlanInput({ startDate: "2028-02-30" })).toBeNull();
  });

  it.each([
    { ...custom, ll: [120, 30] },
    { ...custom, ll: [30] },
    { ...custom, nights: 0 },
    { ...custom, after: null },
    { ...custom, legIn: null },
    { ...custom, legOut: { ...custom.legOut, h: -1 } },
    { ...custom, legIn: { ...custom.legIn, geom: [[30, 120]] } },
    { ...custom, legIn: { ...custom.legIn, geom: null } },
  ])("rejects a malformed nested custom stop: %j", (stop) => {
    expect(parsePlanInput({ custom: [stop] })).toBeNull();
  });

  it("round-trips a valid edited plan and can still generate its route", async () => {
    const input = baseInput({ custom: [custom], nightsOverride: { c: 6 }, breaks: [{ after: "b", days: 5, mode: "fly" }],
      newYearHome: { days: 14, mode: "drive" } });
    const shared = await decodePlan(await encodePlan(input));
    expect(shared).toEqual(input);
    const plan = buildPlan(applyCustomStops(fixture(), shared!.custom), shared!);
    expect(plan.stops.find((s) => s.node.id === custom.id)?.nights).toBe(2);
    expect(plan.stops.find((s) => s.node.id === "c")?.nights).toBe(6);
    expect(plan.breaks[0]).toMatchObject({ after: "b", days: 5, mode: "fly" });
    expect(plan.endDate).toMatch(/^2027-\d{2}-\d{2}$/);
  });
});

describe("loading saved plans", () => {
  it("uses the same defaults and validation for local storage", () => {
    expect(loadSavedPlan(() => JSON.stringify({ start: "成都" }))).toEqual({
      input: { ...DEFAULT_INPUT, start: "成都" }, status: "saved",
    });
    expect(loadSavedPlan(() => JSON.stringify({ custom: null }))).toEqual({ input: null, status: "invalid" });
  });

  it.each(["{broken", "null", "[]", '"route"'])("reports damaged saved content: %s", (json) => {
    expect(loadSavedPlan(() => json)).toEqual({ input: null, status: "invalid" });
  });

  it("distinguishes an absent plan from inaccessible storage", () => {
    expect(loadSavedPlan(() => null)).toEqual({ input: null, status: "empty" });
    expect(loadSavedPlan(() => { throw new Error("storage denied"); })).toEqual({ input: null, status: "unavailable" });
  });
});
