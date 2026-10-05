import { describe, expect, it } from "vitest";
import { auditData, auditMarkdown } from "./audit";
import { fixture } from "./fixture";
import type { Attraction, PolicyItem } from "./types";

const data = fixture();
const base = data.attractions[0];
const attr = (over: Partial<Attraction>): Attraction => ({ ...base, ...over });
const pol = (over: Partial<PolicyItem>): PolicyItem => ({ key: "k", title: "T", finding: "已核实", src: [], conf: "high", checked: "2026-10-03", ...over });

describe("auditData", () => {
  it("flags entries past their review date before age", () => {
    const items = auditData(data.nodes, [attr({ checked: "2026-10-03", reviewBy: "2026-10-31", reviewNote: "免票到期" })], [], "2026-11-01");
    expect(items.map((i) => i.kind)).toEqual(["due"]);
    expect(items[0].detail).toBe("免票到期");
  });
  it("flags entries older than the allowed age", () => {
    const items = auditData(data.nodes, [attr({ checked: "2026-01-01" })], [], "2026-10-03", 90);
    expect(items.map((i) => i.kind)).toContain("stale");
  });
  it("leaves fresh, priced, high-confidence entries alone", () => {
    expect(auditData(data.nodes, [attr({ checked: "2026-10-01" })], [], "2026-10-03")).toEqual([]);
  });
  it("reports missing prices and unknown pet rules", () => {
    const kinds = auditData(data.nodes, [data.attractions[1]], [], "2026-10-03").map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["unpriced", "pets-unknown", "stale"]));
  });
  it("reports policy items still to be confirmed", () => {
    const kinds = auditData(data.nodes, [], [pol({ finding: "某规定待确认" }), pol({})], "2026-10-03").map((i) => i.kind);
    expect(kinds).toEqual(["unverified-policy"]);
  });
  it("renders a markdown summary", () => {
    const md = auditMarkdown(auditData(data.nodes, data.attractions, [], "2026-10-03"), "2026-10-03");
    expect(md).toContain("# 数据待更新清单（2026-10-03）");
    expect(md).toContain("| 票价未查到 | 1 |");
  });
});

describe("peak season dates", () => {
  it("lists attractions with different peak and off prices but no peak dates", () => {
    const items = auditData(data.nodes, [attr({ peakWindows: null, checked: "2026-10-03" })], [], "2026-10-05");
    expect(items.map((i) => i.kind)).toEqual(["season-dates"]);
  });
});
