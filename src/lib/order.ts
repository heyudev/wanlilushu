// The order a plan drives the stops in. "loop" keeps the bundled national loop, rotated to the traveller's
// entry and driven either way. "season" reorders whole segments (each forward or reversed, the stops inside
// kept in order) so that every region is visited in its season, joined by connecting drives (transfers).
import { comfortScore } from "./comfort";
import { addDays, monthOf, newYearLeaveDays } from "./dates";
import { SEASONAL_ROADS } from "./defaults";
import { haversine } from "./geo";
import { drivingDays, keepNode, nightsFor } from "./stay";
import type { Dataset, Leg, PlanInput, PlanPart, RouteNode } from "./types";

/** Loop order starting at `entryIdx`; legs[i] goes from nodes[i] to nodes[i+1] (wrapping back to the entry). */
export function orderLoop(data: Dataset, entryIdx: number, direction: PlanInput["direction"]) {
  const N = data.nodes.length;
  const nodes: RouteNode[] = [];
  const legs: Leg[] = [];
  /** index of each ordered leg in data.legs */
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    if (direction === "cw") {
      nodes.push(data.nodes[(entryIdx + i) % N]);
      idx.push((entryIdx + i) % N);
      legs.push(data.legs[idx[i]]);
    } else {
      nodes.push(data.nodes[(entryIdx - i + N) % N]);
      idx.push((entryIdx - i - 1 + N) % N);
      const l = data.legs[idx[i]];
      legs.push({ ...l, frm: l.to, to: l.frm });
    }
  }
  return { nodes, legs, idx };
}

export interface Unit {
  seg: string;
  rev: boolean;
}

export interface Route {
  nodes: RouteNode[];
  /** legs[i] joins nodes[i] to nodes[i + 1]; a closed route has one more leg, back to nodes[0] */
  legs: Leg[];
  /** where each leg comes from: a stored loop leg, or a connecting drive */
  refs: PlanPart[];
  closed: boolean;
  order: Unit[];
}

/** The order actually used: "auto" follows the seasons unless the rhythm is the quick 打卡. */
export function routeMode(input: PlanInput): "loop" | "season" {
  if (input.routeOrder !== "auto") return input.routeOrder;
  const quick = input.rhythm === "checkin"
    || (input.rhythm === "custom" && input.stayFactor <= 1 && input.comfortStayNights === 0 && input.sojournEveryWeeks === 0);
  return quick ? "loop" : "season";
}

// ---------- distances

const statsCache = new WeakMap<Dataset, { kmh: number; hwShare: number }>();
/** average speed and expressway share over the bundled legs (ferry crossings left out) */
function roadStats(data: Dataset) {
  let s = statsCache.get(data);
  if (!s) {
    const land = data.legs.filter((l) => l.ferry === 0 && l.h > 0);
    const km = land.reduce((a, l) => a + l.km, 0);
    s = { kmh: km / land.reduce((a, l) => a + l.h, 0), hwShare: land.reduce((a, l) => a + l.hw, 0) / km };
    statsCache.set(data, s);
  }
  return s;
}

/** A drive with no road data: straight line × 1.25, at the loop's average speed and expressway share. */
export function estimateDrive(data: Dataset, a: [number, number], b: [number, number]) {
  const { kmh, hwShare } = roadStats(data);
  const km = haversine(a, b) * 1.25;
  return { km, h: km / kmh, hw: km * hwShare };
}

/** The drive from stop a to stop b: the stored loop leg when they are neighbours, otherwise a transfer. */
export function driveBetween(data: Dataset, a: RouteNode, b: RouteNode): { leg: Leg; ref: PlanPart } {
  const N = data.nodes.length;
  const i = data.nodes.indexOf(a), j = data.nodes.indexOf(b);
  if ((i + 1) % N === j) return { leg: data.legs[i], ref: { leg: i, reversed: false } };
  if ((j + 1) % N === i) {
    const l = data.legs[j];
    return { leg: { ...l, frm: l.to, to: l.frm }, ref: { leg: j, reversed: true } };
  }
  const fwd = data.transfers[`${a.id}>${b.id}`];
  const back = fwd ? undefined : data.transfers[`${b.id}>${a.id}`];
  const t = fwd ?? back;
  const key = fwd ? `${a.id}>${b.id}` : `${b.id}>${a.id}`;
  const d = t ?? estimateDrive(data, a.ll, b.ll);
  return {
    leg: { frm: a.id, to: b.id, km: d.km, h: d.h, hw: d.hw, ferry: 0, geom: [] },
    ref: { transfer: key, reversed: !fwd && !!back, km: d.km, estimated: !t },
  };
}

// ---------- routes

function segmentNodes(data: Dataset): Map<string, RouteNode[]> {
  const out = new Map<string, RouteNode[]>();
  for (const n of data.nodes) out.set(n.seg, [...(out.get(n.seg) ?? []), n]);
  return out;
}

export function loopRoute(data: Dataset, input: PlanInput, entryIdx: number): Route {
  const { nodes, legs, idx } = orderLoop(data, entryIdx, input.direction);
  const order: Unit[] = [];
  for (const n of nodes) if (order[order.length - 1]?.seg !== n.seg) order.push({ seg: n.seg, rev: input.direction === "ccw" });
  return { nodes, legs, refs: idx.map((leg) => ({ leg, reversed: input.direction === "ccw" })), closed: true, order };
}

/** Segments in the given order, joined by connecting drives; stops outside the first and last kept ones are dropped. */
export function routeFromOrder(data: Dataset, input: PlanInput, order: Unit[]): Route {
  const bySeg = segmentNodes(data);
  let nodes = order.flatMap((u) => (u.rev ? [...bySeg.get(u.seg)!].reverse() : bySeg.get(u.seg)!));
  const first = nodes.findIndex((n) => keepNode(n, input));
  let last = nodes.length - 1;
  while (last > first && !keepNode(nodes[last], input)) last--;
  nodes = first < 0 ? [] : nodes.slice(first, last + 1);
  const legs: Leg[] = [];
  const refs: PlanPart[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const d = driveBetween(data, nodes[i], nodes[i + 1]);
    legs.push(d.leg);
    refs.push(d.ref);
  }
  return { nodes, legs, refs, closed: false, order };
}

// ---------- choosing the season order

interface SimStop { nights: number; best: number; base: boolean; overridden: boolean; climate: (number | null)[]; breakDays: number }
interface SimUnit { seg: string; stops: SimStop[]; km: number; first: RouteNode; last: RouteNode }

/** score, in nights: each of a stop's ordinary nights (before any longer stay) in its best months counts 1, next
 *  to them 0.5, so a longer stay earns nothing extra; entering or leaving a seasonal region outside its open
 *  months costs 30; every 1/perKm km of driving costs 1 */
export const W = { ok: 0.5, gate: 30, perKm: 1 / 150 };
const ITERATIONS = 15_000;

const orderCache = new WeakMap<Dataset, Map<string, Unit[]>>();

/** The season order for this input (deterministic, cached per dataset and the inputs that matter). */
export function seasonOrder(data: Dataset, input: PlanInput, gates: Record<string, [number, number]>, home: [number, number]): Unit[] {
  const key = JSON.stringify([input.startDate, home, input.pace, input.interests, input.stayFactor, input.comfortStayNights,
    input.sojournEveryWeeks, input.sojournWeeks, input.minComfort, input.skip, input.skipSegs, input.nightsOverride, input.breaks,
    input.newYearHome, input.maxDriveHours, gates]);
  let cache = orderCache.get(data);
  if (!cache) orderCache.set(data, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const found = searchOrder(data, input, gates, home);
  if (cache.size > 64) cache.clear();
  cache.set(key, found);
  return found;
}

function searchOrder(data: Dataset, input: PlanInput, gates: Record<string, [number, number]>, home: [number, number]): Unit[] {
  const bySeg = segmentNodes(data);
  const units: SimUnit[] = [];
  for (const s of data.segs) {
    const ns = bySeg.get(s.k) ?? [];
    if (input.skipSegs.includes(s.k) || !ns.some((n) => keepNode(n, input))) continue;
    const kept = ns.filter((n) => keepNode(n, input));
    const km = ns.slice(0, -1).reduce((a, n) => a + data.legs[data.nodes.indexOf(n)].km, 0);
    units.push({
      seg: s.k, km, first: ns[0], last: ns[ns.length - 1],
      stops: kept.map((n) => ({
        nights: nightsFor(n, input), best: n.best.reduce((m, x) => m | (1 << x), 0), base: n.base === true,
        overridden: input.nightsOverride[n.id] != null,
        climate: Array.from({ length: 12 }, (_, m) => { const c = data.climate[n.id]?.[m]; return c ? comfortScore(c) : null; }),
        breakDays: input.breaks.find((b) => b.after === n.id)?.days ?? 0,
      })),
    });
  }
  if (!units.length) return [];
  const U = units.length;
  // drives between unit ends: end e = 2u (first stop) or 2u + 1 (last stop)
  const endNode = (e: number) => (e % 2 ? units[e >> 1].last : units[e >> 1].first);
  // each drive's km and hours, and the open months of seasonal roads it runs over
  const drive: { km: number; h: number; open: [number, number][] }[][] = Array.from({ length: 2 * U }, (_, a) =>
    Array.from({ length: 2 * U }, (_, b) => {
      if (a >> 1 === b >> 1) return { km: 0, h: 0, open: [] };
      const { leg, ref } = driveBetween(data, endNode(a), endNode(b));
      const near = "transfer" in ref ? data.transfers[ref.transfer]?.near ?? [] : [];
      const open = SEASONAL_ROADS.filter(([x, y]) => near.includes(x) && near.includes(y)).map(([, , m1, m2]) => [m1, m2] as [number, number]);
      return { km: leg.km, h: leg.h, open };
    }));
  const fromHome = Array.from({ length: 2 * U }, (_, e) => estimateDrive(data, home, endNode(e).ll));

  // month of each day of the trip, so the search never formats dates
  const MAX = 4000;
  const monthAt = new Uint8Array(MAX);
  for (let d = 0; d < MAX; d++) monthAt[d] = monthOf(addDays(input.startDate, d));
  const month = (d: number) => monthAt[Math.min(MAX - 1, d)];
  const ny = input.newYearHome ? newYearLeaveDays(input.startDate) : [];
  const nyDays = input.newYearHome?.days ?? 0;
  const dayRoad = (h: number) => drivingDays(h, input.maxDriveHours) - 1;

  const score = (order: Unit[]): number => {
    let day = 0, km = 0, good = 0, gateBad = 0, longEnd = 0, nyNext = 0;
    let at = -1;
    for (const { seg, rev } of order) {
      const u = units.findIndex((x) => x.seg === seg);
      const startEnd = 2 * u + (rev ? 1 : 0), endEnd = 2 * u + (rev ? 0 : 1);
      const d = at < 0 ? { ...fromHome[startEnd], open: [] as [number, number][] } : drive[at][startEnd];
      km += d.km;
      for (const [m1, m2] of d.open) if (month(day) < m1 || month(day) > m2) gateBad++;
      day += dayRoad(d.h);
      const g = gates[seg];
      if (g && (month(day) < g[0] || month(day) > g[1])) gateBad++;
      const stops = units[u].stops;
      for (let k = 0; k < stops.length; k++) {
        const s = stops[rev ? stops.length - 1 - k : k];
        const m = month(day);
        let nights = s.nights;
        const c = s.climate[m - 1];
        if (s.base && !s.overridden && c != null && c >= input.minComfort) {
          if (input.sojournEveryWeeks > 0 && input.sojournWeeks > 0 && day - longEnd >= input.sojournEveryWeeks * 7) nights = Math.max(nights, input.sojournWeeks * 7);
          else if (input.comfortStayNights > nights) nights = input.comfortStayNights;
        }
        if (s.best & (1 << m)) good += s.nights;
        else if (s.best & (1 << (m === 1 ? 12 : m - 1)) || s.best & (1 << (m === 12 ? 1 : m + 1))) good += W.ok * s.nights;
        if (nights >= 28) longEnd = day + nights;
        while (nyNext < ny.length && ny[nyNext] < day) nyNext++;
        if (nyNext < ny.length && ny[nyNext] < day + nights) { day += nyDays; nyNext++; }
        day += nights + s.breakDays;
      }
      if (g && (month(day - 1) < g[0] || month(day - 1) > g[1])) gateBad++;
      km += units[u].km;
      at = endEnd;
    }
    km += fromHome[at].km;
    return good - W.gate * gateBad - W.perKm * km;
  };

  // start from the loop order, then anneal: swap, move, flip one segment, or reverse a run of segments.
  // A few runs with fixed seeds, keeping the best: the same input always gives the same order.
  const loopOrder: Unit[] = units.map((u) => ({ seg: u.seg, rev: false }));
  let best = loopOrder, bestS = score(loopOrder);
  for (const s0 of SEEDS) {
    const run = anneal(s0, loopOrder, score, U);
    if (run.s > bestS) { best = run.order; bestS = run.s; }
  }
  return best;
}

const SEEDS = [20_271, 7_919, 104_729];

function anneal(seed0: number, start: Unit[], score: (o: Unit[]) => number, U: number): { order: Unit[]; s: number } {
  let seed = seed0;
  const rand = () => ((seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647);
  let cur = start, curS = score(cur);
  let best = cur, bestS = curS;
  for (let it = 0; it < ITERATIONS; it++) {
    const T = 3 * (1 - it / ITERATIONS) + 0.01;
    const next = cur.map((x) => ({ ...x }));
    const i = Math.floor(rand() * U), j = Math.floor(rand() * U);
    const mv = rand();
    if (mv < 0.3) [next[i], next[j]] = [next[j], next[i]];
    else if (mv < 0.55) next.splice(j, 0, next.splice(i, 1)[0]);
    else if (mv < 0.75) next[i].rev = !next[i].rev;
    else {
      const a = Math.min(i, j), b = Math.max(i, j);
      next.splice(a, b - a + 1, ...next.slice(a, b + 1).reverse().map((x) => ({ ...x, rev: !x.rev })));
    }
    const s = score(next);
    if (s > curS || rand() < Math.exp((s - curS) / T)) {
      cur = next; curS = s;
      if (s > bestS) { best = next; bestS = s; }
    }
  }
  return { order: best, s: bestS };
}
