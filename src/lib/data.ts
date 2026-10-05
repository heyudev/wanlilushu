// Loads the bundled JSON into a typed Dataset.
import route from "../data/route.json";
import attractionsFile from "../data/attractions.json";
import policyFile from "../data/policy.json";
import starts from "../data/starts.json";
import climateFile from "../data/climate.json";
import petFile from "../data/pet_friendly.json";
import roadsFile from "../data/roads.json";
import pricesFile from "../data/prices.json";
import transfersFile from "../data/transfers.json";
import { withOrigins } from "./legs";
import type { Attraction, Campsite, Dataset, Leg, LocalPrices, MonthClimate, PetFriendly, PolicyItem, RouteNode, ScenicRoad, Segment, StartCity, Excursion, Transfer } from "./types";

export const policy = policyFile.items as PolicyItem[];
export const campsites = attractionsFile.campsites as Campsite[];

function fuelPrices(): { byProvince: Record<string, number>; avg: number } {
  const item = policy.find((p) => p.key === "fuel_price_92");
  const data = (item?.data ?? {}) as { "92_yuan_per_l"?: Record<string, number>; national_avg_92_yuan_per_l?: number };
  const byProvince: Record<string, number> = {};
  for (const [k, v] of Object.entries(data["92_yuan_per_l"] ?? {})) {
    byProvince[k] = v;
    const prov = k.split("_")[0];
    if (!(prov in byProvince)) byProvince[prov] = v; // first listed zone stands for the province
  }
  return { byProvince, avg: data.national_avg_92_yuan_per_l ?? 8.66 };
}

export function medianMeal(prices: Record<string, LocalPrices>): number | null {
  const v = Object.values(prices).filter((p) => p.meal.n >= 10 && p.meal.p50 != null).map((p) => p.meal.p50!).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function loadDataset(): Dataset {
  const fp = fuelPrices();
  return {
    segs: route.segs as Segment[],
    nodes: route.nodes as unknown as RouteNode[],
    legs: withOrigins(route.legs as unknown as Leg[]),
    exs: route.exs as unknown as Excursion[],
    attractions: attractionsFile.attractions as Attraction[],
    starts: starts as unknown as StartCity[],
    fuelByProvince: fp.byProvince,
    fuelDefault: fp.avg,
    climate: climateFile as unknown as Record<string, MonthClimate[]>,
    pet: petFile as unknown as Record<string, PetFriendly>,
    roads: roadsFile as unknown as ScenicRoad[],
    prices: pricesFile as unknown as Record<string, LocalPrices>,
    priceMedian: medianMeal(pricesFile as unknown as Record<string, LocalPrices>),
    transfers: transfersFile as Record<string, Transfer>,
  };
}
