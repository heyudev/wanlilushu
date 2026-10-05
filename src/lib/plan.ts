// Turns the fixed national loop into a personal plan: rotate to the traveller's entry point, apply
// direction and pace, lay out dates, and cost every leg and night.
import {
  attractionPrice, boardingDays, energyFor, energyForDay, foodPerDayAt, fuelPriceFor, lodgingCost, mealsPerDay, needsDogCare,
  passesLevel, priceIndex, sleepModeFor, ticketCost, ZERO_ENERGY,
} from "./costs";
import { comfortScore } from "./comfort";
import { addDays, daysBetween, holidayName, monthOf, newYearLeaveDays } from "./dates";
import { GATE_WINDOWS, PERMIT_NODES, SEASONAL_ROADS, SUSPENDED_NODES } from "./defaults";
import { seasonFit } from "./season";
import { drivingDays, keepNode, nightsFor } from "./stay";
import { estimateDrive, loopRoute, routeFromOrder, routeMode, seasonOrder } from "./order";

export { keepNode, nightsFor, nodeInterests, PLATEAU_M } from "./stay";
export { orderLoop } from "./order";
import type {
  Approach, CostBreakdown, Dataset, Plan, PlanBreak, PlanInput, PlanLeg, PlanPart, PlanWarning, RouteNode, StartCity, Stop,
} from "./types";

/** Days from `date` until the first day of a month inside [m1, m2]; 0 when already inside. */
export function daysUntilWindow(date: string, [m1, m2]: [number, number]): number {
  const m = monthOf(date);
  if (m >= m1 && m <= m2) return 0;
  const y = Number(date.slice(0, 4)) + (m > m2 ? 1 : 0);
  return daysBetween(date, `${y}-${String(m1).padStart(2, "0")}-01`);
}

/** Climate comfort of a stop in a month, null without data. */
export function comfortAt(data: Dataset, id: string, month: number): number | null {
  const c = data.climate[id];
  return c ? comfortScore(c[month - 1]) : null;
}

/** stays of four weeks or more are costed as a monthly rental */
const LONG_STAY_NIGHTS = 28;

export function findStart(data: Dataset, name: string): StartCity {
  return data.starts.find((s) => s.name === name) ?? data.starts[0];
}

function approachFor(start: StartCity, input: PlanInput): Approach | null {
  if (start.km <= 0) return null;
  return { km: start.km, h: start.h, hw: start.hw, days: drivingDays(start.h, input.maxDriveHours) };
}

/** Plan.costBySeg key for the connecting drives between segments */
export const TRANSFER_SEG = "transfer";

/** km of a day's drive spent on connecting drives between segments */
export function transferKm(l: PlanLeg): number {
  return l.parts.reduce((a, p) => a + ("transfer" in p ? p.km : 0), 0);
}

/** less than this from home and the trip simply starts (or ends) at that stop */
const SAME_PLACE_KM = 30;

function estimatedApproach(data: Dataset, from: [number, number], to: [number, number], input: PlanInput): Approach | null {
  const d = estimateDrive(data, from, to);
  if (d.km < SAME_PLACE_KM) return null;
  return { ...d, days: drivingDays(d.h, input.maxDriveHours), estimated: true };
}

const emptyCosts = (): CostBreakdown => ({
  fuel: 0, electricity: 0, toll: 0, tickets: 0, lodging: 0, food: 0, dog: 0, ferry: 0, maintenance: 0, misc: 0, home: 0,
});

export function costTotal(c: CostBreakdown): number {
  return Object.values(c).reduce((s, v) => s + v, 0);
}

interface FerryPrice {
  car: number | null;
  person: number | null;
}

function ferryPrice(node: RouteNode): FerryPrice {
  const r = (node.ferry?.research ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return { car: num(r.car_fare_small_car), person: num(r.passenger_fare_lowest_class) };
}

export function buildPlan(data: Dataset, input: PlanInput, gates: Record<string, [number, number]> = GATE_WINDOWS): Plan {
  const start = findStart(data, input.start);
  const entryIdx = Math.max(0, data.nodes.findIndex((n) => n.id === start.entry));
  const seasonal = routeMode(input) === "season";
  let route = seasonal ? routeFromOrder(data, input, seasonOrder(data, input, gates, start.ll)) : null;
  if (!route || !route.nodes.length) route = loopRoute(data, input, entryIdx);
  const { nodes, legs, refs, closed } = route;
  const N = nodes.length;
  const lastNode = closed ? nodes[0] : nodes[N - 1];
  // the loop joins the start city's entry stop (road data); a season route starts and ends wherever its
  // first and last segments do, so those drives are estimated
  // (the start city's own entry stop has road data either way)
  const roadOr = (node: RouteNode, from: [number, number], to: [number, number]) =>
    node.id === start.entry ? approachFor(start, input) : estimatedApproach(data, from, to, input);
  const approach = closed ? approachFor(start, input) : roadOr(nodes[0], start.ll, nodes[0].ll);
  const homeward = closed ? approach : roadOr(lastNode, lastNode.ll, start.ll);
  const people = input.adults + input.kids;
  const costs = emptyCosts();
  const warnings: PlanWarning[] = [];
  const exByNode = new Map<string, Dataset["exs"]>();
  for (const e of data.exs) exByNode.set(e.node, [...(exByNode.get(e.node) ?? []), e]);
  const attrByNode = new Map<string, Dataset["attractions"]>();
  for (const a of data.attractions) attrByNode.set(a.node, [...(attrByNode.get(a.node) ?? []), a]);

  let day = approach ? approach.days - 1 : 0;
  const stops: Stop[] = [];
  const uncosted = new Set<Plan["uncosted"][number]>();
  // nearest stop along the route (either side) that has local price data; only a loop wraps around
  const pricedNear = (i: number): RouteNode | null => {
    for (let k = 0; k < N; k++) {
      for (const j of [i - k, i + k]) {
        if (!closed && (j < 0 || j >= N)) continue;
        const n = nodes[(j + N) % N];
        if (mealsPerDay(data, n.id, input.foodTier, input.meals) != null) return n;
      }
    }
    return null;
  };
  let stopIdx = 0;
  const planLegs: PlanLeg[] = [];

  interface StopOpts {
    transit?: boolean;
    /** the arrival back at the loop entry: no sightseeing there, it was done at the start */
    final?: boolean;
    sojourn?: boolean;
    waitDays?: number;
    comfortStay?: boolean;
    /** nights of the whole stay when a trip home splits it in two */
    whole?: number;
    /** the second part of a split stay: sights were seen in the first */
    resumed?: boolean;
  }
  const makeStop = (node: RouteNode, nights: number, o: StopOpts = {}): Stop => {
    const { transit = false, final = false, sojourn = false, waitDays = 0, comfortStay = false, resumed = false } = o;
    const whole = o.whole ?? nights;
    const date = addDays(input.startDate, day);
    const month = monthOf(date);
    // a month-long stay is costed as a monthly rental
    const sleep = whole >= LONG_STAY_NIGHTS ? "R"
      : sleepModeFor(node, input.lodging, transit, { minTemp: data.climate[node.id]?.[month - 1]?.[1] ?? null, people: input.adults + input.kids });
    const src = pricedNear(stopIdx);
    const lodging = lodgingCost(sleep, nights, input, (src && priceIndex(data, src.id)) ?? 1);
    if (lodging == null && nights > 0) uncosted.add(sleep === "C" ? "camp" : "hotel");
    const foodPerPerson = input.foodMode === "manual"
      ? foodPerDayAt(data, src?.id ?? node.id, input)
      : src ? mealsPerDay(data, src.id, input.foodTier, input.meals) : null;
    const sightseeing = !transit && !final && !resumed;
    const attractions = sightseeing ? (attrByNode.get(node.id) ?? []).filter((a) => passesLevel(a, input.level)) : [];
    let ticketPerPerson = 0;
    let unpriced = 0;
    for (const a of attractions) {
      const p = attractionPrice(a, month);
      if (p == null) unpriced++;
      else ticketPerPerson += p;
    }
    const stayDays = Math.max(0, nights - 1);
    const excursions = sightseeing && input.includeExcursions && stayDays > 0 ? exByNode.get(node.id) ?? [] : [];
    const exKm = excursions.reduce((s, e) => s + e.km, 0);
    // during a long stay (a sojourn, or a month or more in one place) local driving counts only for the
    // days of an ordinary visit; the rest is living there, not sightseeing by car. The part after a trip
    // home in the middle of a stay has no sightseeing left.
    const long = sojourn || whole >= LONG_STAY_NIGHTS;
    const driveDays = resumed ? 0 : long ? Math.max(0, Math.min(nights, nightsFor(node, { ...input, nightsOverride: {} })) - 1) : stayDays;
    const localKm = Math.max(0, driveDays - excursions.length) * input.localKmPerStayDay + exKm;
    const fuel = fuelPriceFor(node, data, input);
    // each driving day starts on a fresh charge; spread local km evenly over those days
    let localEnergy = ZERO_ENERGY;
    const kmDays = Math.max(driveDays, excursions.length);
    if (kmDays > 0 && localKm > 0) {
      const perDay = energyFor(localKm / kmDays, node.seg, fuel, input);
      localEnergy = { fuelL: perDay.fuelL * kmDays, kwh: perDay.kwh * kmDays, fuelCost: perDay.fuelCost * kmDays, elecCost: perDay.elecCost * kmDays };
    }
    const exToll = excursions.reduce((s, e) => s + e.hw * input.tollPerKm, 0);
    costs.toll += exToll;
    return {
      node, day, date, nights, transit, sleep,
      season: transit || final ? "ok" : seasonFit(month, node.best),
      lodgingCost: lodging ?? 0,
      foodPerPerson, priceFrom: src && src.id !== node.id ? src.id : null,
      ticketCost: ticketCost(ticketPerPerson, input),
      attractions, unpricedAttractions: unpriced,
      petBanned: input.dog && needsDogCare(attractions),
      localKm, localEnergy, excursions, sojourn, waitDays, comfortStay,
      comfort: comfortAt(data, node.id, month),
      ...(resumed ? { resumed } : {}),
    };
  };

  // ---- how long to stay: rhythm, long stays at comfortable bases, waiting for the next region's season
  // day the last long stay (a sojourn, or a month or more waiting) ended; the interval is travel time since then
  let lastLongStayEnd = 0;
  const waits: { at: string; segs: string[]; days: number }[] = [];
  // Spring Festival trips home: the day each one starts, and the next one still to take
  const newYear = input.newYearHome && input.newYearHome.days > 0 ? input.newYearHome : null;
  const nyLeave = newYear ? newYearLeaveDays(input.startDate) : [];
  let nyNext = 0;
  const newYearDaysWithin = (from: number, to: number) => (newYear ? nyLeave.filter((d) => d >= from && d < to).length * newYear.days : 0);
  const breakDaysAfter = (id: string) => input.breaks.find((b) => b.after === id)?.days ?? 0;
  /**
   * Seasonal regions entered between stop i and the next long-stay base, with the days from arriving
   * at i until entering each (stays at the stops in between and trips home included).
   */
  const gatesAhead = (i: number, nightsHere: number) => {
    const out: { seg: string; offset: number }[] = [];
    let offset = nightsHere + breakDaysAfter(nodes[i].id);
    for (let j = i + 1; j < N; j++) {
      const n = nodes[j];
      const kept = keepNode(n, input);
      // a region is entered on arriving at its first stop, even when that stop is the next base
      if (gates[n.seg] && n.seg !== nodes[j - 1].seg) out.push({ seg: n.seg, offset: offset + newYearDaysWithin(day, day + offset) });
      if (kept && n.base) break;
      if (kept) offset += nightsFor(n, input) + breakDaysAfter(n.id);
    }
    return out;
  };
  /**
   * Days to wait at stop i so that the regions ahead are entered in season: the shortest wait that brings
   * the most of them into their windows. A trip home right after stop i counts as part of the wait.
   */
  const seasonWait = (i: number, nightsHere: number) => {
    const ahead = gatesAhead(i, nightsHere);
    if (!ahead.length) return { days: 0, segs: [] as string[] };
    let best = { days: 0, fit: -1 };
    for (let w = 0; w <= 366; w++) {
      const fit = ahead.filter((g) => daysUntilWindow(addDays(input.startDate, day + w + g.offset), gates[g.seg]) === 0).length;
      if (fit > best.fit) best = { days: w, fit };
      if (fit === ahead.length) break;
    }
    return { days: best.days, segs: ahead.map((g) => g.seg) };
  };
  const planStay = (i: number) => {
    const node = nodes[i];
    let nights = nightsFor(node, input);
    let sojourn = false;
    let comfortStay = false;
    let waitDays = 0;
    const month = monthOf(addDays(input.startDate, day));
    const comfort = comfortAt(data, node.id, month);
    // nights the traveller set by hand are kept as they are
    const comfortable = node.base === true && comfort != null && comfort >= input.minComfort && input.nightsOverride[node.id] == null;
    if (comfortable && input.sojournEveryWeeks > 0 && input.sojournWeeks > 0 && day - lastLongStayEnd >= input.sojournEveryWeeks * 7) {
      nights = Math.max(nights, input.sojournWeeks * 7);
      sojourn = true;
    } else if (comfortable && input.comfortStayNights > nights) {
      nights = input.comfortStayNights;
      comfortStay = true;
    }
    // waiting happens only where one can live for a while (a long-stay base, or the starting point),
    // never at a stop in the middle of a seasonal region
    if (input.waitForSeason && (node.base || i === 0)) {
      const w = seasonWait(i, nights);
      if (w.days > 0) {
        waitDays = w.days;
        nights += waitDays;
        waits.push({ at: node.id, segs: w.segs, days: waitDays });
      }
    }
    // a month or more in one place is a long stay too: the next one is due an interval of travel later
    if (nights >= LONG_STAY_NIGHTS) lastLongStayEnd = day + nights;
    return { nights, sojourn, waitDays, comfortStay };
  };

  // ---- trips home
  const breaks: PlanBreak[] = [];
  /** days on the road each way when driving home from `node` (one day's drive fits in the day you leave) */
  const homeDriveDays = (node: RouteNode) => drivingDays(estimateDrive(data, node.ll, start.ll).h, input.maxDriveHours);
  let dogBoardingAtHome = 0;
  const goHome = (node: RouteNode, days: number, mode: "drive" | "fly", isNewYear: boolean) => {
    const way = estimateDrive(data, node.ll, start.ll);
    // a drive longer than a day adds days and hotel nights on the road, both ways
    const roadDays = mode === "drive" ? 2 * (homeDriveDays(node) - 1) : 0;
    let cost: number;
    if (mode === "fly") {
      cost = input.flightPerPerson * (input.adults + input.kids) * 2 + input.parkingPerDay * days;
    } else {
      const e = energyFor(way.km, node.seg, fuelPriceFor(node, data, input), input);
      cost = 2 * (e.fuelCost + e.elecCost + way.hw * input.tollPerKm) + (lodgingCost("H", roadDays, input) ?? 0);
      if (roadDays > 0 && input.hotelPerRoom == null) uncosted.add("hotel");
    }
    // flying home, the dog stays behind in boarding
    const dogBoarding = input.dog && mode === "fly" ? days : 0;
    dogBoardingAtHome += dogBoarding;
    breaks.push({ after: node.id, stopIdx: stops.length - 1, date: addDays(input.startDate, day), days, mode, km: way.km, cost,
      ...(roadDays ? { roadDays } : {}), ...(dogBoarding ? { dogBoarding } : {}), ...(isNewYear ? { newYear: true } : {}) });
    costs.home += cost;
    day += days + roadDays;
  };
  // trips home already taken at the Spring Festival instead (one trip, not two in a row)
  const mergedBreaks = new Set<string>();
  const takeBreak = (node: RouteNode) => {
    const b = input.breaks.find((x) => x.after === node.id);
    if (!b || b.days <= 0 || mergedBreaks.has(node.id)) return;
    goHome(node, b.days, b.mode, false);
    // a Spring Festival that falls while already at home needs no trip of its own
    while (nyNext < nyLeave.length && nyLeave[nyNext] < day) nyNext++;
  };
  /** A stay of `nights` at a stop; when a Spring Festival trip home falls inside it, the stay is split around it. */
  const stay = (node: RouteNode, nights: number, o: StopOpts) => {
    // driving home takes longer from far away: leave early enough to be home before New Year's Eve
    const leave = nyLeave[nyNext] == null ? undefined
      : nyLeave[nyNext] - (newYear?.mode === "drive" ? homeDriveDays(node) - 1 : 0);
    if (newYear && leave != null && leave < day + nights) {
      nyNext++;
      // leave on the planned day, but sleep at least one night here first
      const before = Math.min(nights, Math.max(1, leave - day));
      stops.push(makeStop(node, before, { ...o, whole: nights }));
      day += before;
      // a trip home planned after this stop anyway is taken now, together with the Spring Festival
      const planned = input.breaks.find((x) => x.after === node.id && x.days > 0);
      if (planned) mergedBreaks.add(node.id);
      goHome(node, Math.max(newYear.days, planned?.days ?? 0), planned?.mode ?? newYear.mode, true);
      const after = nights - before;
      if (after > 0) {
        planLegs.push({
          from: node.id, to: node.id, km: 0, h: 0, hw: 0, ferryKm: 0, via: [], seg: node.seg, day, date: addDays(input.startDate, day),
          energy: ZERO_ENERGY, toll: 0, legIdx: [], reversed: false, parts: [], driveDays: 0, resume: true,
        });
        stops.push(makeStop(node, after, { ...o, waitDays: 0, whole: nights, resumed: true }));
        day += after;
      }
      return;
    }
    stops.push(makeStop(node, nights, o));
    day += nights;
  };

  stopIdx = 0;
  const first = planStay(0);
  stay(nodes[0], first.nights, first);
  takeBreak(nodes[0]);

  type Part = { km: number; seg: string; fuelPrice: number };
  const fresh = () => ({ km: 0, h: 0, hw: 0, ferryKm: 0, via: [] as string[], energy: [] as Part[], toll: 0, legIdx: [] as number[], parts: [] as PlanPart[] });
  let acc = fresh();
  let fromNode = nodes[0];
  const steps = closed ? N : N - 1;
  for (let i = 0; i < steps; i++) {
    const leg = legs[i];
    const isLast = closed && i === N - 1;
    const next = isLast ? nodes[0] : nodes[i + 1];
    const legFrom = nodes[i];
    const ref = refs[i];
    const fuel = fuelPriceFor(legFrom, data, input);
    acc = {
      km: acc.km + leg.km, h: acc.h + leg.h, hw: acc.hw + leg.hw, ferryKm: acc.ferryKm + leg.ferry,
      via: acc.via, energy: [...acc.energy, { km: leg.km, seg: legFrom.seg, fuelPrice: fuel }],
      toll: acc.toll + leg.hw * input.tollPerKm, legIdx: "leg" in ref ? [...acc.legIdx, ref.leg] : acc.legIdx, parts: [...acc.parts, ref],
    };
    if (leg.ferry > 0) {
      const fp = ferryPrice(next.n === legFrom.n ? legFrom : next.ferry ? next : legFrom);
      if (fp.car != null) costs.ferry += fp.car + (fp.person ?? 0) * Math.max(0, people - 1);
      else warnings.push({
        kind: "data", level: "warn",
        text: "渤海轮渡（大连—烟台）车辆运费、船票和航行时长官网未公示，费用里未计入，航行时间按 7 小时估算；出发前在 12306 或客服 400-090-1777 确认，并问清狗能否留在车内。",
        nodes: [legFrom.id, next.id],
      });
    }
    const nextLegH = i + 1 < steps ? legs[i + 1].h : 0;
    const keep = isLast || i === steps - 1 || keepNode(next, input);
    const mustBreak = !keep && acc.h + nextLegH > input.maxDriveHours && leg.ferry === 0;
    if (!keep && !mustBreak) {
      acc.via.push(next.id);
      continue;
    }
    // a drive longer than a day (mostly connecting drives between segments) takes several, with nights on the road
    const driveDays = acc.ferryKm > 0 ? 1 : drivingDays(acc.h, input.maxDriveHours);
    planLegs.push({
      from: fromNode.id, to: next.id, km: acc.km, h: acc.h, hw: acc.hw, ferryKm: acc.ferryKm, via: acc.via,
      seg: fromNode.seg, day, date: addDays(input.startDate, day), energy: energyForDay(acc.energy, input), toll: acc.toll,
      legIdx: acc.legIdx, reversed: acc.parts.some((p) => p.reversed), parts: acc.parts, driveDays,
    });
    day += driveDays - 1;
    if (isLast) {
      stopIdx = 0;
      stops.push(makeStop(next, 0, { final: true }));
    } else if (!keep) {
      stopIdx = i + 1;
      stay(next, 1, { transit: true });
    } else {
      stopIdx = i + 1;
      const st = planStay(i + 1);
      stay(next, st.nights, st);
      takeBreak(next);
    }
    fromNode = next;
    acc = fresh();
  }

  const endDay = day + (homeward ? homeward.days : 0);
  const days = endDay + 1;
  // days away from the trip: at home and on the road there and back
  const breakDays = breaks.reduce((a, b) => a + b.days + (b.roadDays ?? 0), 0);
  const tripDays = days - breakDays;

  // ---- totals and costs
  let km = 0, hwKm = 0, driveH = 0, ferryKm = 0, localKm = 0;
  const costBySeg: Plan["costBySeg"] = {};
  const segAdd = (seg: string, k: number, d: number, c: number) => {
    const s = (costBySeg[seg] ??= { km: 0, days: 0, cost: 0 });
    s.km += k; s.days += d; s.cost += c;
  };
  let roadNights = 0;
  for (const l of planLegs) {
    km += l.km; hwKm += l.hw; driveH += l.h; ferryKm += l.ferryKm;
    costs.fuel += l.energy.fuelCost; costs.electricity += l.energy.elecCost; costs.toll += l.toll;
    // a connecting drive belongs to neither segment it joins: its share of the day goes to its own bucket
    const drive = l.energy.fuelCost + l.energy.elecCost + l.toll + (lodgingCost("H", l.driveDays - 1, input) ?? 0);
    const tKm = transferKm(l);
    const share = l.km > 0 ? tKm / l.km : 0;
    segAdd(l.seg, l.km - tKm, 0, drive * (1 - share));
    if (tKm > 0) segAdd(TRANSFER_SEG, tKm, 0, drive * share);
    roadNights += Math.max(0, l.driveDays - 1);
  }
  // taking turns to stay with the dog needs two adults; alone, the dog is boarded on those days
  const boardDog = input.dog && (input.dogCare === "boarding" || input.adults < 2);
  let careDays = 0;
  for (const s of stops) {
    localKm += s.localKm;
    costs.fuel += s.localEnergy.fuelCost; costs.electricity += s.localEnergy.elecCost;
    costs.lodging += s.lodgingCost; costs.tickets += s.ticketCost;
    if (boardDog) careDays += boardingDays(s.attractions, s.nights);
    segAdd(s.node.seg, s.localKm, s.nights, s.localEnergy.fuelCost + s.localEnergy.elecCost + s.lodgingCost + s.ticketCost);
  }
  // the drives from home and back home, and nights on the road during long drives
  for (const [a, node] of [[approach, nodes[0]], [homeward, lastNode]] as const) {
    if (!a) continue;
    const e = energyFor(a.km, node.seg, fuelPriceFor(node, data, input), input);
    km += a.km; hwKm += a.hw; driveH += a.h;
    costs.fuel += e.fuelCost; costs.electricity += e.elecCost;
    costs.toll += a.hw * input.tollPerKm;
    roadNights += a.days - 1;
  }
  if (roadNights > 0) {
    const l = lodgingCost("H", roadNights, input);
    if (l == null) uncosted.add("hotel");
    costs.lodging += l ?? 0;
  }
  // food: each stop's nights at its local prices; the remaining days (departure, approach) at the entry's prices
  const eaters = input.adults + input.kids * 0.6;
  let foodDays = 0;
  for (const s of stops) {
    if (s.foodPerPerson == null) { if (s.nights > 0) uncosted.add("food"); continue; }
    costs.food += s.nights * eaters * s.foodPerPerson;
    foodDays += s.nights;
  }
  const entryFood = stops[0]?.foodPerPerson;
  if (entryFood != null) costs.food += Math.max(0, tripDays - foodDays) * eaters * entryFood;
  costs.dog = input.dog ? tripDays * input.dogPerDay + (careDays + dogBoardingAtHome) * input.boardingPerDay : 0;
  costs.maintenance = ((km + localKm) / 10_000) * input.maintenancePer10k;
  costs.misc = tripDays * input.miscPerDay;

  // ---- warnings
  const visited = new Set(stops.map((s) => s.node.id));
  const offStops = stops.filter((s) => s.season === "off" && !s.resumed);
  if (offStops.length) {
    warnings.push({
      kind: "season", level: offStops.length > 8 ? "warn" : "info",
      text: `${offStops.length} 个停留点到达时不在最佳季节，${closed ? "可以调整出发日期或方向，或者改为跟着季节走。" : "可以调整出发日期。"}`,
      nodes: offStops.map((s) => s.node.id),
    });
  }
  // drives already split over several days only count when a day is still over the limit
  const longLegs = planLegs.filter((l) => l.ferryKm === 0 && l.h / Math.max(1, l.driveDays) > input.maxDriveHours);
  if (longLegs.length) {
    warnings.push({
      kind: "long-drive", level: "warn",
      text: `${longLegs.length} 天纯驾驶超过 ${input.maxDriveHours} 小时（OSRM 估算，不含休息与检查站），建议早出发或中途加一晚。`,
      nodes: longLegs.map((l) => l.to),
    });
  }
  const suspended = SUSPENDED_NODES.filter((n) => visited.has(n));
  if (suspended.length) {
    warnings.push({
      kind: "permit-suspended", level: "critical",
      text: "国家移民管理局 2026 年第 5 号公告：自 2026-08-28 起暂停签发前往日喀则市的电子边境管理区通行证，恢复时间另行公布。定日（珠峰）、萨嘎—仲巴（新藏线南段）受影响；出发前在“移民局12367”确认是否恢复，否则改走拉萨—那曲—阿里北线（路况需另行核实）。",
      nodes: suspended,
    });
  }
  const permit = PERMIT_NODES.filter((n) => visited.has(n));
  if (permit.length) {
    warnings.push({
      kind: "permit", level: "warn",
      text: "以下停留点在边境管理区，需提前在“移民局12367”App 或微信/支付宝小程序办理电子边境管理区通行证（2026-04-15 起全面电子化）。",
      nodes: permit,
    });
  }
  for (const [a, b, m1, m2, name] of SEASONAL_ROADS) {
    const k = data.legs.findIndex((l) => (l.frm === a && l.to === b) || (l.frm === b && l.to === a));
    // driven as a loop leg, or on a connecting drive whose road passes both ends
    const drive = planLegs.find((l) => (k >= 0 && l.legIdx.includes(k))
      || l.parts.some((p) => "transfer" in p && [a, b].every((id) => data.transfers[p.transfer]?.near?.includes(id))));
    if (!drive) continue;
    const m = monthOf(drive.date);
    if (m < m1 || m > m2) {
      warnings.push({ kind: "road-season", level: "critical", text: `${name} 通常只在 ${m1}–${m2} 月通行，按当前日期你会在 ${m} 月经过。`, nodes: [a, b] });
    }
  }
  const high = stops.filter((s) => (s.node.alt ?? 0) >= 4000 && s.nights > 0);
  if (high.length) {
    warnings.push({
      kind: "altitude", level: "info",
      text: `${high.reduce((a, s) => a + s.nights, 0)} 晚住在海拔 4000m 以上（${high.length} 个地方），进藏前在 3000m 左右的地方适应 1–2 晚。`,
      nodes: high.map((s) => s.node.id),
    });
  }
  if (input.dog) {
    if (input.dogCare === "rotate" && input.adults < 2 && careDays > 0) {
      warnings.push({
        kind: "dog", level: "info",
        text: `只有一位大人时没法轮流陪狗，不让带狗的景区按就近寄养计费（共 ${careDays} 天）。`,
      });
    }
    if (visited.has("beijing") && input.dogSize !== "small") {
      warnings.push({
        kind: "dog", level: "warn",
        text: `北京重点管理区（城六区等）禁止饲养成年体高超过 35cm 的犬和烈性犬，${input.dogSize === "large" ? "大型犬" : "体高超过 35cm 的中型犬"}进城有执法风险，建议住在重点管理区外或寄养。`,
        nodes: ["beijing"],
      });
    }
    if (input.dogSize === "large") {
      warnings.push({
        kind: "dog", level: "warn",
        text: "大型犬：很多酒店民宿只接受小型犬，景区和餐厅限制也更多。每一站提前电话确认，或以露营、车宿为主；回家时不建议带大型犬坐飞机。",
      });
    }
    warnings.push({
      kind: "dog", level: "info",
      text: "带狗跨省：随身带狂犬病免疫证明；按《动物防疫法》，运输犬只需出发地开具的《动物检疫合格证明》（多地要求提前 3 天申报、有效期最长 5 天）。新疆自 2026-02-01 起要求运输动物经指定检查站进疆。",
    });
  }
  const holidayStops = stops.filter((s) => holidayName(s.date));
  if (holidayStops.length) {
    const names = [...new Set(holidayStops.map((s) => holidayName(s.date)))].join("、");
    warnings.push({
      kind: "holiday", level: "info",
      text: `行程经过${names}假期（按常见日期估算）：7 座及以下小客车高速免费，但热门景区限流、要提前预约。`,
      nodes: holidayStops.map((s) => s.node.id),
    });
  }
  for (const w of waits) {
    const at = data.nodes.find((n) => n.id === w.at)?.n ?? w.at;
    const segs = w.segs.map((k) => `「${data.segs.find((x) => x.k === k)?.name ?? k}」`).join("");
    warnings.push({
      kind: "season", level: "info",
      text: `为了赶上${segs}的季节，在${at}多住 ${w.days} 天再出发。`,
      nodes: [w.at],
    });
  }
  const transfers = planLegs.filter((l) => l.parts.some((p) => "transfer" in p));
  if (transfers.length) {
    const guessed = transfers.filter((l) => l.parts.some((p) => "transfer" in p && p.estimated)).length;
    warnings.push({
      kind: "data", level: "info",
      text: `按季节安排的路线有 ${transfers.length} 段转场，共约 ${Math.round(transfers.reduce((a, l) => a + l.km, 0)).toLocaleString("en-US")} km`
        + `（路网计算${guessed ? `；其中 ${guessed} 段没有路网数据，按直线距离 × 1.25 估算` : ""}），超过一天车程的按每天最多 ${input.maxDriveHours} 小时分几天开，路上住酒店。`,
      nodes: transfers.map((l) => l.to),
    });
  }
  const unpriced = stops.reduce((s, x) => s + x.unpricedAttractions, 0);
  if (unpriced) {
    warnings.push({ kind: "data", level: "info", text: `${unpriced} 个景点票价未核实，未计入门票总额。` });
  }

  const seasonScore = { good: 0, ok: 0, off: 0 };
  for (const s of closed ? stops.slice(0, -1) : stops) if (!s.transit && !s.resumed) seasonScore[s.season]++;

  return {
    input, start, entry: nodes[0], approach, homeward, loop: closed, order: route.order, stops, legs: planLegs, days,
    endDate: addDays(input.startDate, days - 1),
    totals: { km, hwKm, driveH, ferryKm, nights: days - 1, localKm, breakDays, tripDays,
      waitDays: stops.reduce((a, s) => a + s.waitDays, 0),
      sojournNights: stops.reduce((a, s) => a + (s.sojourn ? s.nights : 0), 0) },
    breaks, costs, costBySeg, warnings, seasonScore, uncosted: [...uncosted],
  };
}

/** Season score of a plan: good stops count 1, ok 0.5; a closed seasonal road costs 10. */
export function scorePlan(plan: Plan): number {
  const closed = plan.warnings.filter((w) => w.kind === "road-season").length;
  return plan.seasonScore.good + plan.seasonScore.ok * 0.5 - closed * 10;
}

/** Best departure dates within `windowDays` of `from`, at least two weeks apart. */
export function bestStartDates(data: Dataset, input: PlanInput, from: string, windowDays = 365, top = 3) {
  // a season route is rearranged for every start date, so scanning a year of them would take too long;
  // and the rearranging already does what the scan is for
  if (routeMode(input) === "season") return [];
  const scored: { date: string; score: number; good: number; total: number }[] = [];
  for (let d = 0; d < windowDays; d += 2) {
    const date = addDays(from, d);
    const p = buildPlan(data, { ...input, startDate: date });
    const total = p.seasonScore.good + p.seasonScore.ok + p.seasonScore.off;
    scored.push({ date, score: scorePlan(p), good: p.seasonScore.good, total });
  }
  scored.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.every((p) => Math.abs(Date.parse(p.date) - Date.parse(s.date)) >= 14 * 86_400_000)) picked.push(s);
    if (picked.length === top) break;
  }
  return picked;
}
