// Groups a plan's stops into contiguous segment runs for the route and itinerary views.
import type { Dataset, Plan, PlanLeg, ScenicRoad, Stop } from "../lib/types";

export interface SegRun {
  k: string;
  items: { stop: Stop; leg: PlanLeg | null; index: number }[];
  km: number;
  nights: number;
  good: number;
  counted: number;
}

export function segmentRuns(plan: Plan): SegRun[] {
  const runs: SegRun[] = [];
  plan.stops.forEach((stop, index) => {
    if (index === plan.stops.length - 1) return; // loop end, shown in the footer
    const leg = index > 0 ? plan.legs[index - 1] : null;
    let run = runs[runs.length - 1];
    if (!run || run.k !== stop.node.seg) {
      run = { k: stop.node.seg, items: [], km: 0, nights: 0, good: 0, counted: 0 };
      runs.push(run);
    }
    run.items.push({ stop, leg, index });
    run.km += leg?.km ?? 0;
    run.nights += stop.nights;
    if (!stop.transit) {
      run.counted++;
      if (stop.season === "good") run.good++;
    }
  });
  return runs;
}

/** Scenic roads a plan leg runs on (matched by stored leg ends, either direction). */
export function roadsLookup(data: Dataset): (leg: PlanLeg) => ScenicRoad[] {
  const byLeg = new Map<number, ScenicRoad[]>();
  data.legs.forEach((l, i) => {
    const hits = data.roads.filter((r) => r.legs.includes(`${l.frm}>${l.to}`));
    if (hits.length) byLeg.set(i, hits);
  });
  return (leg) => [...new Map(leg.legIdx.flatMap((i) => byLeg.get(i) ?? []).map((r) => [r.id, r])).values()];
}
