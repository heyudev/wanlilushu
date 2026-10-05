import { describe, expect, it } from "vitest";
import { packingFor } from "./packing";
import { buildPlan } from "./plan";
import { planToMarkdown } from "./markdown";
import { baseInput, fixture } from "./fixture";

const data = fixture();

describe("packingFor", () => {
  it("adds dog, camping, plateau and charging groups only when relevant", () => {
    const titles = (over = {}) => packingFor(buildPlan(data, baseInput(over))).map((g) => g.title);
    const lean = titles({ dog: false, lodging: "comfort", vehicle: "hev" });
    expect(lean).not.toContain("狗狗");
    expect(lean).not.toContain("露营与车宿");
    expect(lean).not.toContain("插电混动补能");
    expect(lean).toContain("高原"); // fixture stop c sits at 4200 m
    const full = titles({ dog: true, lodging: "budget", vehicle: "phev" });
    expect(full).toEqual(expect.arrayContaining(["狗狗", "露营与车宿", "插电混动补能"]));
  });
});

describe("planToMarkdown", () => {
  it("summarises the plan with dates, stops and costs", () => {
    const md = planToMarkdown(buildPlan(data, baseInput()), data);
    expect(md).toContain("从A城出发");
    expect(md).toContain("共 8 天");
    expect(md).toContain("**4/1 周四 A**");
    expect(md).toContain("| 合计 |");
  });
});

describe("packing follows the plan", () => {
  it("lists camping gear only with nights outdoors, and winter clothes only with freezing nights", async () => {
    const { fixture, baseInput } = await import("./fixture");
    const { buildPlan } = await import("./plan");
    const hotel = buildPlan(fixture(), baseInput({ lodging: "comfort" }));
    const camp = buildPlan(fixture(), baseInput({ lodging: "budget" }));
    const tags = (p: typeof hotel, cold = false) => packingFor(p, () => (cold ? -5 : 10)).map((g) => g.tag);
    expect(tags(hotel)).not.toContain("camp");
    expect(tags(camp)).toContain("camp");
    expect(tags(hotel)).not.toContain("winter");
    expect(tags(hotel, true)).toContain("winter");
  });
});
