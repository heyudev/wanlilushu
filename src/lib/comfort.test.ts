import { describe, expect, it } from "vitest";
import { comfortScore } from "./comfort";

describe("comfortScore", () => {
  it("rates a mild dry month fully comfortable", () => {
    expect(comfortScore([25, 13, 60, 5])).toBe(1);
  });
  it("penalises cold winters with freezing nights", () => {
    expect(comfortScore([0, -12, 60, 2])).toBe(0);
    expect(comfortScore([12, -2, 50, 3])).toBeLessThan(0.2);
  });
  it("penalises hot, muggy, rainy summers", () => {
    const s = comfortScore([34, 26, 82, 16]);
    expect(s).toBe(0);
    expect(comfortScore([30, 22, 85, 12])).toBeLessThan(comfortScore([30, 22, 60, 4]));
  });
});
