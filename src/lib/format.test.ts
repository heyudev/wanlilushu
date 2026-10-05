import { describe, expect, it } from "vitest";
import { duration } from "./format";

describe("duration", () => {
  it("uses days, months or years depending on length", () => {
    expect(duration(45)).toBe("45 天");
    expect(duration(184)).toBe("6 个月");
    expect(duration(365)).toBe("1 年");
    expect(duration(460)).toBe("1 年 3 个月");
  });
});
