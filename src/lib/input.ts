// Validate external settings before they reach the planner or the form controls.
import { formatDate, parseDate } from "./dates";
import { DEFAULT_INPUT } from "./defaults";
import type { PlanInput } from "./types";

type Validator = (value: unknown) => boolean;

const record = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object"
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text: Validator = (v) => typeof v === "string";
const nonempty: Validator = (v) => typeof v === "string" && v.trim().length > 0;
const boolean: Validator = (v) => typeof v === "boolean";
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const positive: Validator = (v) => nonnegative(v) && v > 0;
const count: Validator = (v) => nonnegative(v) && Number.isSafeInteger(v);
const nights: Validator = (v) => count(v) && positive(v);
const nullable = (check: Validator): Validator => (v) => v === null || check(v);
const arrayOf = (check: Validator): Validator => (v) => Array.isArray(v) && v.every(check);
const oneOf = (...values: (string | number)[]): Validator => (v) => values.some((value) => value === v);
const within = (min: number, max: number): Validator => (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const pair = (first: Validator, second: Validator): Validator => (v) => Array.isArray(v) && v.length === 2 && first(v[0]) && second(v[1]);
const lat = within(-90, 90), lon = within(-180, 180);
const homeMode = oneOf("drive", "fly");

const date: Validator = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = parseDate(v);
  return Number.isFinite(t) && formatDate(t) === v;
};
const home: Validator = (v) => record(v) && nights(v.days) && homeMode(v.mode);
const customLeg: Validator = (v) => record(v) && nonnegative(v.km) && nonnegative(v.h) && nonnegative(v.hw)
  && nullable(nonnegative)(v.toll) && arrayOf(pair(lon, lat))(v.geom);
const customStop: Validator = (v) => record(v) && nonempty(v.id) && nonempty(v.name) && text(v.province)
  && nonempty(v.after) && pair(lat, lon)(v.ll) && nights(v.nights) && customLeg(v.legIn) && customLeg(v.legOut);

// Exhaustive keys make new PlanInput fields require an explicit validation rule.
const validators: Record<keyof PlanInput, Validator> = {
  start: nonempty,
  startDate: date,
  routeOrder: oneOf("auto", "loop", "season"),
  direction: oneOf("cw", "ccw"),
  pace: oneOf("full", "highlights", "essentials"),
  interests: arrayOf(oneOf("food", "nature", "culture", "city", "plateau")),
  level: oneOf("all", "4A", "5A"),
  adults: nights,
  kids: count,
  dog: boolean,
  dogSize: oneOf("small", "medium", "large"),
  dogCare: oneOf("rotate", "boarding"),
  vehicle: oneOf("phev", "hev", "ice"),
  evRangeKm: nonnegative,
  kwhPer100: nonnegative,
  lPer100: nonnegative,
  fuelPrice: nullable(nonnegative),
  elecPrice: nonnegative,
  tollPerKm: nonnegative,
  lodging: oneOf("budget", "balanced", "comfort"),
  hotelPerRoom: nullable(nonnegative),
  localPrice: boolean,
  campPerNight: nullable(nonnegative),
  foodMode: oneOf("local", "manual"),
  foodTier: oneOf("budget", "normal", "nice"),
  meals: oneOf(1, 2, 3),
  foodPerMeal: nullable(nonnegative),
  dogPerDay: nonnegative,
  boardingPerDay: nonnegative,
  localKmPerStayDay: nonnegative,
  maintenancePer10k: nonnegative,
  miscPerDay: nonnegative,
  includeExcursions: boolean,
  maxDriveHours: positive,
  rhythm: oneOf("checkin", "slow", "deep", "sojourn", "custom"),
  stayFactor: positive,
  comfortStayNights: count,
  sojournEveryWeeks: count,
  sojournWeeks: count,
  minComfort: within(0, 1),
  waitForSeason: boolean,
  rentPerMonth: nullable(nonnegative),
  breaks: arrayOf((v) => home(v) && record(v) && nonempty(v.after)),
  newYearHome: nullable(home),
  flightPerPerson: nonnegative,
  parkingPerDay: nonnegative,
  budget: nullable(nonnegative),
  skip: arrayOf(nonempty),
  skipSegs: arrayOf(nonempty),
  nightsOverride: (v) => record(v) && Object.entries(v).every(([id, n]) => nonempty(id) && nights(n)),
  custom: arrayOf(customStop),
};

/** Missing fields use defaults; unknown fields are ignored; invalid known fields reject the whole plan. */
export function parsePlanInput(value: unknown): PlanInput | null {
  if (!record(value)) return null;
  const defaults = DEFAULT_INPUT as unknown as Record<string, unknown>;
  const fields: [string, unknown][] = [];
  for (const [key, check] of Object.entries(validators)) {
    const field = Object.hasOwn(value, key) ? value[key] : defaults[key];
    if (!check(field)) return null;
    fields.push([key, field]);
  }
  return Object.fromEntries(fields) as unknown as PlanInput;
}

export interface SavedPlan {
  input: PlanInput | null;
  status: "saved" | "empty" | "invalid" | "unavailable";
}

/** Reading and parsing are separate so unavailable storage is distinguishable from damaged content. */
export function loadSavedPlan(read: () => string | null): SavedPlan {
  let json: string | null;
  try { json = read(); } catch { return { input: null, status: "unavailable" }; }
  if (json === null) return { input: null, status: "empty" };
  try {
    const input = parsePlanInput(JSON.parse(json));
    return { input, status: input ? "saved" : "invalid" };
  } catch {
    return { input: null, status: "invalid" };
  }
}
