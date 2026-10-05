import type { Interest, PlanInput, Rhythm } from "./types";

/**
 * Share of a full electric range a plug-in hybrid can realistically use per day in each segment,
 * reflecting how easy overnight charging is. These are planning estimates, not measured data.
 */
export const CHARGE_AVAIL: Record<string, number> = {
  A: 0.9, B: 0.9, C: 0.8, D: 0.7, E: 0.2, F: 0.2, G: 0.05, H: 0.3, I: 0.4,
  J: 0.4, K: 0.6, L: 0.5, M: 0.8, N: 0.9, O: 0.9, P: 0.5, Q: 0.9,
};

/** Stops inside border-control areas that need the electronic border-area pass (边境管理区通行证). */
export const PERMIT_NODES = ["dingri", "saga", "taqin", "zhada", "shiquanhe", "ritu", "taxian"];

/** Stops affected by the suspension of passes for 日喀则 (国家移民管理局 2026 年第 5 号公告). */
export const SUSPENDED_NODES = ["dingri", "saga"];

/** Seasonal mountain roads: [from, to, first month, last month, name] (either direction). */
export const SEASONAL_ROADS: [string, string, number, number, string][] = [
  ["kuche", "bayinbuluke", 6, 9, "独库公路"],
  ["ritu", "dahongliutan", 5, 10, "新藏线 G219"],
  ["dahongliutan", "yecheng", 5, 10, "新藏线 G219"],
  ["yecheng", "taxian", 5, 10, "塔莎古道"],
];

/** Fuel price zones that differ from the province default (researched 2026-09 prices). */
export const FUEL_ZONE: Record<string, string> = {
  taqin: "西藏_阿里价区", zhada: "西藏_阿里价区", shiquanhe: "西藏_阿里价区", ritu: "西藏_阿里价区",
  mangkang: "西藏_昌都价区", basu: "西藏_昌都价区",
};

/**
 * Months when each seasonal region is reasonable to enter with a car and a dog (planning estimates:
 * high passes, closed roads, deep winter). Used by "wait for the season".
 */
export const GATE_WINDOWS: Record<string, [number, number]> = {
  E: [4, 10], F: [4, 10], G: [5, 9], H: [4, 10], I: [6, 9], J: [5, 10], L: [6, 9], M: [5, 10], P: [5, 10],
};

export const RHYTHMS: Record<Exclude<Rhythm, "custom">, { label: string; hint: string; stayFactor: number;
  comfortStayNights: number; sojournEveryWeeks: number; sojournWeeks: number; waitForSeason: boolean }> = {
  checkin: { label: "打卡", hint: "每站住一两晚，看主要风景", stayFactor: 1, comfortStayNights: 0, sojournEveryWeeks: 0, sojournWeeks: 0, waitForSeason: false },
  slow: { label: "慢游", hint: "每个地方多住一半，舒服的地方住一周", stayFactor: 1.5, comfortStayNights: 7, sojournEveryWeeks: 0, sojournWeeks: 0, waitForSeason: true },
  deep: { label: "深度慢游", hint: "每个地方住两倍，舒服的地方住两周", stayFactor: 2, comfortStayNights: 14, sojournEveryWeeks: 0, sojournWeeks: 0, waitForSeason: true },
  sojourn: { label: "慢游 + 旅居", hint: "舒服的地方住两周，每隔约三个月旅居一个半月", stayFactor: 2, comfortStayNights: 14, sojournEveryWeeks: 12, sojournWeeks: 6, waitForSeason: true },
};

export const DOG_SIZE_LABEL: Record<"small" | "medium" | "large", { label: string; hint: string }> = {
  small: { label: "小型犬", hint: "约 10kg 以下，如泰迪、比熊、博美" },
  medium: { label: "中型犬", hint: "约 10–25kg，如柯基、柴犬、边牧" },
  large: { label: "大型犬", hint: "约 25kg 以上，如金毛、拉布拉多、阿拉斯加" },
};

export const FOOD_TIER_LABEL: Record<"budget" | "normal" | "nice", { label: string; hint: string }> = {
  budget: { label: "经济", hint: "当地餐厅人均的低四分位" },
  normal: { label: "普通", hint: "当地餐厅人均的中位数" },
  nice: { label: "讲究", hint: "当地餐厅人均的高四分位" },
};

export const INTEREST_LABEL: Record<Interest, string> = {
  food: "美食", nature: "自然风光", culture: "人文古迹", city: "城市", plateau: "高原秘境",
};

export const DEFAULT_INPUT: PlanInput = {
  start: "上海",
  startDate: "2027-04-01",
  direction: "cw",
  pace: "full",
  interests: ["food", "nature", "culture"],
  level: "all",
  adults: 2,
  kids: 0,
  dog: true,
  dogSize: "medium",
  dogCare: "rotate",
  vehicle: "phev",
  evRangeKm: 100,
  kwhPer100: 18,
  lPer100: 6,
  fuelPrice: null,
  elecPrice: 1.2,
  tollPerKm: 0.5,
  lodging: "balanced",
  hotelPerRoom: null,
  localPrice: true,
  campPerNight: null,
  foodMode: "local",
  foodTier: "normal",
  meals: 2,
  foodPerMeal: null,
  dogPerDay: 15,
  boardingPerDay: 100,
  localKmPerStayDay: 30,
  maintenancePer10k: 800,
  miscPerDay: 20,
  includeExcursions: true,
  maxDriveHours: 7,
  rhythm: "slow",
  stayFactor: RHYTHMS.slow.stayFactor,
  comfortStayNights: RHYTHMS.slow.comfortStayNights,
  sojournEveryWeeks: RHYTHMS.slow.sojournEveryWeeks,
  sojournWeeks: RHYTHMS.slow.sojournWeeks,
  minComfort: 0.7,
  waitForSeason: true,
  rentPerMonth: null,
  breaks: [],
  flightPerPerson: 1500,
  parkingPerDay: 30,
  budget: null,
  skip: [],
  skipSegs: [],
  nightsOverride: {},
  custom: [],
};
