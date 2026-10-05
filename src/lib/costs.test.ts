import { describe, expect, it } from "vitest";
import { attractionPrice, energyFor, lodgingCost, needsDogCare, passesLevel, sleepModeFor, ticketCost } from "./costs";
import { baseInput, fixture } from "./fixture";

const data = fixture();

describe("energyFor", () => {
  it("burns only fuel for a non-plug-in hybrid", () => {
    const e = energyFor(200, "A", 8, baseInput({ vehicle: "hev", lPer100: 5 }));
    expect(e.fuelL).toBeCloseTo(10);
    expect(e.fuelCost).toBeCloseTo(80);
    expect(e.kwh).toBe(0);
  });
  it("uses the electric range scaled by charging availability for a plug-in hybrid", () => {
    // segment A availability 0.9: 100 km range → 90 km electric, 110 km on fuel
    const e = energyFor(200, "A", 8, baseInput({ vehicle: "phev", evRangeKm: 100, kwhPer100: 20, lPer100: 6, elecPrice: 1 }));
    expect(e.kwh).toBeCloseTo(18);
    expect(e.elecCost).toBeCloseTo(18);
    expect(e.fuelL).toBeCloseTo(6.6);
  });
  it("never drives more electric km than the day's distance", () => {
    const e = energyFor(30, "A", 8, baseInput({ vehicle: "phev", evRangeKm: 100, kwhPer100: 20 }));
    expect(e.kwh).toBeCloseTo(30 * 0.9 * 0.2);
  });
});

describe("lodging", () => {
  it("puts high-altitude nights in a hotel whatever the strategy", () => {
    const c = data.nodes[2];
    expect(sleepModeFor(c, "budget", false)).toBe("H");
  });
  it("follows the strategy elsewhere", () => {
    const b = data.nodes[1]; // sleep "C H"
    expect(sleepModeFor(b, "comfort", false)).toBe("H");
    expect(sleepModeFor(b, "balanced", false)).toBe("C");
    expect(sleepModeFor(b, "budget", false)).toBe("C");
    expect(sleepModeFor(b, "budget", true)).toBe("V");
  });
  it("prices rooms by adults, two per room", () => {
    expect(lodgingCost("H", 2, baseInput({ adults: 3, hotelPerRoom: 300 }))).toBe(1200);
    expect(lodgingCost("C", 2, baseInput({ campPerNight: 80 }))).toBe(160);
    expect(lodgingCost("V", 5, baseInput())).toBe(0);
  });
});

describe("tickets", () => {
  const a1 = data.attractions[0];
  it("adds mandatory extras and skips optional ones", () => {
    expect(attractionPrice(a1, 7)).toBe(120);
    expect(attractionPrice(a1, 1)).toBe(80);
  });
  it("returns null when the price is unknown", () => {
    expect(attractionPrice(data.attractions[1], 7)).toBeNull();
  });
  it("charges kids half", () => {
    expect(ticketCost(100, baseInput({ adults: 2, kids: 2 }))).toBe(300);
  });
  it("filters by A-level, unknown levels only pass 'all'", () => {
    expect(passesLevel(a1, "5A")).toBe(true);
    expect(passesLevel(data.attractions[1], "4A")).toBe(false);
    expect(passesLevel(data.attractions[1], "all")).toBe(true);
  });
  it("needs dog care where pets are banned", () => {
    expect(needsDogCare([a1])).toBe(true);
    expect(needsDogCare([data.attractions[1]])).toBe(false);
  });
});
