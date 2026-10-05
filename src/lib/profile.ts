// Re-lays the stored elevation samples (recorded along the clockwise loop) in the order a plan travels.
import { withOrigins } from "./legs";
import type { Dataset, Plan } from "./types";

/** [km along the stored loop, metres, stored leg index] */
export type RawSample = [number, number | null, number];

export interface ProfilePoint {
  km: number;
  m: number;
  /** index into plan.legs */
  leg: number;
  /** first point after a connecting drive, which has no samples: the chart breaks the line here */
  gapBefore?: boolean;
}

export function buildProfile(plan: Plan, data: Dataset, raw: RawSample[]): ProfilePoint[] {
  // samples are recorded along the bundled loop; legs the traveller added (no `orig`) have none
  const legs = data.legs.some((l) => l.orig != null) ? data.legs : withOrigins(data.legs);
  const origOf = (i: number) => legs[i].orig ?? -1;
  const legStart = new Map<number, number>(legs.filter((l) => l.orig != null).map((l) => [l.orig!, l.origStart ?? 0]));
  const byLeg = new Map<number, RawSample[]>();
  for (const s of raw) byLeg.set(s[2], [...(byLeg.get(s[2]) ?? []), s]);

  const out: ProfilePoint[] = [];
  let offset = 0;
  let gap = false;
  plan.legs.forEach((pl, i) => {
    for (const part of pl.parts) {
      // connecting drives between segments have no elevation samples: a gap of their length
      if (!("leg" in part)) { offset += part.km; gap = true; continue; }
      const li = part.leg;
      const len = data.legs[li].km;
      const o = origOf(li);
      let pts = (o >= 0 ? byLeg.get(o) ?? [] : [])
        .filter((s) => s[1] != null)
        .map((s) => ({ pos: s[0] - (legStart.get(o) ?? 0), m: s[1] as number }));
      if (part.reversed) pts = pts.map((p) => ({ pos: len - p.pos, m: p.m })).reverse();
      for (const p of pts) {
        out.push({ km: offset + p.pos, m: p.m, leg: i, ...(gap ? { gapBefore: true } : {}) });
        gap = false;
      }
      offset += len;
    }
  });
  return out;
}
