// Pure cost rules. Every estimate here is driven by PlanInput so the UI can expose the assumption.
import { CHARGE_AVAIL, FUEL_ZONE } from "./defaults";
import type { Attraction, Dataset, EnergyCost, FoodTier, LevelFilter, LodgingStrategy, PlanInput, PriceStat, RouteNode, SleepMode } from "./types";

export const HIGH_ALTITUDE_M = 3500;

export function fuelPriceFor(node: RouteNode, data: Dataset, input: PlanInput): number {
  if (input.fuelPrice != null) return input.fuelPrice;
  const zone = FUEL_ZONE[node.id];
  if (zone && data.fuelByProvince[zone] != null) return data.fuelByProvince[zone];
  const prov = node.p.split("/")[0];
  return data.fuelByProvince[prov] ?? data.fuelDefault;
}

/**
 * Energy for one day's driving of `km`, starting from a battery charged overnight.
 * A plug-in hybrid drives min(km, range) × availability electrically; the rest (and any HEV/ICE driving) burns fuel.
 */
export function energyFor(km: number, seg: string, fuelPrice: number, input: PlanInput): EnergyCost {
  return energyForDay([{ km, seg, fuelPrice }], input);
}

/**
 * Energy for one day's driving made of several legs (stops passed without staying): the battery is
 * charged once overnight, so the electric range is used up across the legs rather than refilled for each.
 */
export function energyForDay(parts: { km: number; seg: string; fuelPrice: number }[], input: PlanInput): EnergyCost {
  let range = input.vehicle === "phev" ? input.evRangeKm : 0;
  let out = ZERO_ENERGY;
  for (const p of parts) {
    const avail = range > 0 ? CHARGE_AVAIL[p.seg] ?? 0.5 : 0;
    const onBattery = Math.min(p.km, range);
    range -= onBattery;
    const eKm = onBattery * avail;
    const fuelL = ((p.km - eKm) * input.lPer100) / 100;
    const kwh = (eKm * input.kwhPer100) / 100;
    out = addEnergy(out, { fuelL, kwh, fuelCost: fuelL * p.fuelPrice, elecCost: kwh * input.elecPrice });
  }
  return out;
}

export function addEnergy(a: EnergyCost, b: EnergyCost): EnergyCost {
  return { fuelL: a.fuelL + b.fuelL, kwh: a.kwh + b.kwh, fuelCost: a.fuelCost + b.fuelCost, elecCost: a.elecCost + b.elecCost };
}

export const ZERO_ENERGY: EnergyCost = { fuelL: 0, kwh: 0, fuelCost: 0, elecCost: 0 };

/** below this monthly average low (°C) nights are too cold to camp or sleep in the car */
export const OUTDOOR_MIN_C = 0;
/** people who can sleep in the car (a flat rear bed for two) */
export const CAR_BEDS = 2;

/**
 * Where to sleep at a stop. High-altitude nights always go to a hotel (cold, oxygen); so do freezing months
 * (`minTemp`: the month's average low) for camping and car sleeping, and car sleeping for more than two people.
 */
export function sleepModeFor(node: RouteNode, strategy: LodgingStrategy, transit: boolean,
  { minTemp = null, people = 2 }: { minTemp?: number | null; people?: number } = {}): SleepMode {
  if ((node.alt ?? 0) >= HIGH_ALTITUDE_M) return "H";
  if (minTemp != null && minTemp < OUTDOOR_MIN_C) return "H";
  const opts = node.sleep.split(/\s+/) as SleepMode[];
  if (strategy === "comfort") return "H";
  if (strategy === "budget") {
    if ((transit || opts.includes("V")) && people <= CAR_BEDS) return "V";
    if (opts.includes("C")) return "C";
    return "H";
  }
  // balanced: camp where the place is made for it, hotel otherwise
  return !transit && opts[0] === "C" ? "C" : "H";
}

export function roomsFor(input: PlanInput): number {
  return Math.max(1, Math.ceil(input.adults / 2));
}

const TIER_KEY: Record<FoodTier, "p25" | "p50" | "p75"> = { budget: "p25", normal: "p50", nice: "p75" };
const MIN_SAMPLE = 10;

function tierValue(s: PriceStat | undefined, tier: FoodTier): number | null {
  if (!s || s.n < MIN_SAMPLE) return null;
  return s[TIER_KEY[tier]] ?? null;
}

/**
 * Per person per day at a stop's local prices: one sit-down meal plus (meals − 1) quick meals.
 * When quick-meal data is thin, quick meals use the sit-down 25th percentile.
 */
export function mealsPerDay(data: Dataset, id: string, tier: FoodTier, meals: 1 | 2 | 3 = 2): number | null {
  const p = data.prices[id];
  if (!p) return null;
  const meal = tierValue(p.meal, tier);
  if (meal == null) return null;
  const quick = tierValue(p.quick, tier) ?? tierValue(p.meal, "budget") ?? meal;
  return meal + (meals - 1) * quick;
}

/** Food per person per day at a stop under the chosen mode; null when it cannot be priced. */
export function foodPerDayAt(data: Dataset, id: string, input: PlanInput): number | null {
  if (input.foodMode === "manual") {
    if (input.foodPerMeal == null) return null;
    return input.foodPerMeal * input.meals * (input.localPrice ? priceIndex(data, id) ?? 1 : 1);
  }
  return mealsPerDay(data, id, input.foodTier, input.meals);
}

/** Local price level: the stop's median sit-down meal over the national median of stops, clamped to 0.5–2. */
export function priceIndex(data: Dataset, id: string): number | null {
  const p = data.prices[id];
  const m = p ? tierValue(p.meal, "normal") : null;
  if (m == null || !data.priceMedian) return null;
  return Math.min(2, Math.max(0.5, m / data.priceMedian));
}

/** Lodging for a stay; null when the needed price has not been filled in. */
export function lodgingCost(mode: SleepMode, nights: number, input: PlanInput, index = 1): number | null {
  if (nights <= 0 || mode === "V") return 0;
  const hotelNight = input.hotelPerRoom == null ? null
    : Math.round((input.hotelPerRoom * (input.localPrice ? index : 1)) / 10) * 10 * roomsFor(input);
  if (mode === "R") {
    if (input.rentPerMonth != null) return (nights * input.rentPerMonth) / 30;
    return hotelNight == null ? null : nights * hotelNight;
  }
  if (mode === "H") return hotelNight == null ? null : nights * hotelNight;
  return input.campPerNight == null ? null : nights * input.campPerNight;
}

const LEVEL_RANK: Record<string, number> = { "5A": 5, "4A": 4, "3A": 3, "2A": 2, A: 1 };

export function passesLevel(a: Attraction, filter: LevelFilter): boolean {
  if (filter === "all") return true;
  const rank = a.level ? LEVEL_RANK[a.level] ?? 0 : 0;
  return rank >= LEVEL_RANK[filter];
}

/** Peak price applies April–October; outside it the off-season price (when known) is used. */
export function isPeakMonth(month: number): boolean {
  return month >= 4 && month <= 10;
}

export function isOptional(item: string): boolean {
  return item.includes("可选");
}

/** Per-person price of an attraction in a given month, or null when the price is unknown. */
export function attractionPrice(a: Attraction, month: number): number | null {
  const base = isPeakMonth(month) ? a.peak : a.off ?? a.peak;
  if (base == null) return null;
  const extras = a.extras.filter((e) => !isOptional(e.item) && e.price != null).reduce((s, e) => s + (e.price ?? 0), 0);
  return base + extras;
}

/** Kids are costed at half the adult ticket — real child policies vary by age and height. */
export function ticketCost(perPerson: number, input: PlanInput): number {
  return perPerson * input.adults + perPerson * 0.5 * input.kids;
}

/** An attraction needs someone to look after the dog when it bans pets, or charges entry with no known pet policy. */
export function needsCare(a: Attraction): boolean {
  return a.pets.includes("禁止") || (!a.pets.includes("允许") && (a.peak ?? 0) > 0);
}

export function needsDogCare(attractions: Attraction[]): boolean {
  return attractions.some(needsCare);
}

/** Days the dog is boarded at a stop: one per attraction that needs care, never more than the days spent there. */
export function boardingDays(attractions: Attraction[], nights: number): number {
  const n = attractions.filter(needsCare).length;
  return n === 0 ? 0 : Math.min(n, Math.max(1, nights - 1));
}
