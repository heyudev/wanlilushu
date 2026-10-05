// Which stops a plan keeps and how many nights each gets, before long stays and season waits are added.
import type { PlanInput, RouteNode } from "./types";

export const PLATEAU_M = 3000;

export function nodeInterests(node: RouteNode): string[] {
  return (node.alt ?? 0) >= PLATEAU_M ? [...node.tags, "plateau"] : node.tags;
}

/** Whether a stop survives the chosen pace. Interests rescue a stop one star below the cut. */
export function keepNode(node: RouteNode, input: PlanInput): boolean {
  if (input.skip.includes(node.id) || input.skipSegs.includes(node.seg)) return false;
  if (node.custom) return true;
  if (input.pace === "full") return true;
  const match = nodeInterests(node).some((t) => input.interests.includes(t as never));
  const cut = input.pace === "highlights" ? 2 : 3;
  return node.star >= cut || (match && node.star >= cut - 1);
}

/** Nights at a kept stop: the pace trims long stays, the rhythm's stay factor stretches them; never below one. */
export function nightsFor(node: RouteNode, input: PlanInput): number {
  const chosen = input.nightsOverride[node.id];
  if (chosen != null) return Math.max(1, chosen);
  const base = input.pace === "full" ? node.nights
    : input.pace === "highlights" ? (node.star === 3 ? node.nights : Math.max(1, node.nights - 1))
    : Math.max(1, Math.ceil(node.nights / 2));
  return Math.max(1, Math.round(base * (input.stayFactor || 1)));
}


/**
 * Days needed for a drive of `h` hours when the traveller drives at most `max` hours a day. A drive up to
 * 10% over the limit still fits in one day (it is flagged as a long day instead of costing a night on the road).
 */
export function drivingDays(h: number, max: number): number {
  return Math.max(1, Math.ceil(h / max - 0.1));
}
