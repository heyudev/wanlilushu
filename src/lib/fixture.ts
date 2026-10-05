// Small synthetic loop used by unit tests: A → B → C → D → A, two segments.
import { DEFAULT_INPUT } from "./defaults";
import type { Dataset, Leg, PlanInput, RouteNode } from "./types";

const node = (id: string, seg: string, star: 1 | 2 | 3, nights: number, extra: Partial<RouteNode> = {}): RouteNode => ({
  id, n: id.toUpperCase(), p: "浙江", seg, ll: [30, 120], nights, best: [4, 5], star,
  sleep: "H", wiki: [], food: [], tip: "", dog: "", ex: [], tags: ["nature"], alt: 100, ...extra,
});

const leg = (frm: string, to: string, km: number, h: number, hw = km / 2): Leg => ({ frm, to, km, h, hw, ferry: 0, geom: [] });

export function fixture(): Dataset {
  return {
    segs: [
      { k: "A", name: "甲", range: "", season: "" },
      { k: "B", name: "乙", range: "", season: "" },
    ],
    nodes: [
      node("a", "A", 3, 2),
      node("b", "A", 1, 1, { sleep: "C H", tags: ["food"] }),
      node("c", "B", 3, 3, { alt: 4200 }),
      node("d", "B", 2, 1),
    ],
    legs: [leg("a", "b", 100, 1.5), leg("b", "c", 300, 4), leg("c", "d", 200, 3), leg("d", "a", 400, 5)],
    exs: [{ node: "a", name: "ax", ll: [30, 120], km: 50, h: 1, hw: 0 }],
    attractions: [
      { node: "a", name: "a1", level: "5A", peak: 100, off: 60, season: null, extras: [{ item: "观光车", price: 20 }, { item: "索道(可选)", price: 80 }], reserve: null, pets: "禁止", petsNote: null, src: [], conf: "high", note: null },
      { node: "c", name: "c1", level: null, peak: null, off: null, season: null, extras: [], reserve: null, pets: "未查到", petsNote: null, src: [], conf: "low", note: null },
    ],
    starts: [
      { name: "A城", ll: [30, 120], entry: "a", km: 0, h: 0, hw: 0 },
      { name: "远方", ll: [31, 121], entry: "c", km: 500, h: 10, hw: 400 },
    ],
    fuelByProvince: { 浙江: 8 },
    fuelDefault: 9,
    climate: {},
    pet: {},
    // local prices: a and b are pricier than c and d; median sit-down meal across stops is 50
    prices: {
      a: { meal: { n: 50, p25: 40, p50: 60, p75: 80 }, quick: { n: 50, p25: 15, p50: 20, p75: 25 }, checked: "2026-10-04" },
      b: { meal: { n: 50, p25: 40, p50: 60, p75: 80 }, quick: { n: 50, p25: 15, p50: 20, p75: 25 }, checked: "2026-10-04" },
      c: { meal: { n: 50, p25: 30, p50: 40, p75: 50 }, quick: { n: 50, p25: 10, p50: 15, p75: 20 }, checked: "2026-10-04" },
      d: { meal: { n: 4 }, quick: { n: 3 }, checked: "2026-10-04" },
    },
    priceMedian: 50,
    roads: [],
    transfers: {},
  };
}

export const baseInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  ...DEFAULT_INPUT, start: "A城", startDate: "2027-04-01", routeOrder: "loop", newYearHome: null, dog: false, includeExcursions: false,
  vehicle: "hev", lPer100: 5, tollPerKm: 0.5, hotelPerRoom: 300, localPrice: false, campPerNight: 80, rentPerMonth: 3000, adults: 2, kids: 0,
  foodMode: "local", foodTier: "normal", meals: 3, foodPerMeal: null, miscPerDay: 0, maintenancePer10k: 0, localKmPerStayDay: 0,
  rhythm: "checkin", stayFactor: 1, comfortStayNights: 0, sojournEveryWeeks: 0, sojournWeeks: 0, waitForSeason: false, breaks: [], ...over,
});
