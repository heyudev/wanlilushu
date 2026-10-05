import { describe, expect, it } from "vitest";
import { seasonFit } from "./season";

describe("seasonFit", () => {
  it("rates best months good, neighbours ok, the rest off", () => {
    expect(seasonFit(7, [6, 7, 8])).toBe("good");
    expect(seasonFit(9, [6, 7, 8])).toBe("ok");
    expect(seasonFit(11, [6, 7, 8])).toBe("off");
  });
  it("wraps around the year end", () => {
    expect(seasonFit(12, [1, 2])).toBe("ok");
    expect(seasonFit(1, [12])).toBe("ok");
  });
});
