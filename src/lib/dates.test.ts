import { describe, expect, it } from "vitest";
import { addDays, daysBetween, holidayName, monthOf, shortDate } from "./dates";

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2027-04-01", "2027-10-01")).toBe(183);
  });
  it("reads month and formats short dates", () => {
    expect(monthOf("2027-09-15")).toBe(9);
    expect(shortDate("2027-04-01")).toBe("4/1 周四");
  });
  it("flags the usual free-toll holiday windows", () => {
    expect(holidayName("2027-10-03")).toBe("国庆");
    expect(holidayName("2027-05-05")).toBe("劳动节");
    expect(holidayName("2027-05-06")).toBeNull();
  });
});
