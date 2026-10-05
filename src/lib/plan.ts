// Turns the fixed national loop into a personal plan: rotate to the traveller's entry point, apply
// direction and pace, lay out dates, and cost every leg and night.
import {
  addEnergy, attractionPrice, energyFor, foodPerDayAt, fuelPriceFor, lodgingCost, mealsPerDay, needsDogCare, passesLevel,
  priceIndex, sleepModeFor, ticketCost, ZERO_ENERGY,
} from "./costs";
import { comfortScore } from "./comfort";
import { addDays, daysBetween, holidayName, monthOf } from "./dates";
import { GATE_WINDOWS, PERMIT_NODES, SEASONAL_ROADS, SUSPENDED_NODES } from "./defaults";
import { haversine } from "./geo";
import { seasonFit } from "./season";
import type {
  CostBreakdown, Dataset, Leg, Plan, PlanBreak, PlanInput, PlanLeg, PlanWarning, RouteNode, StartCity, Stop,
} from "./types";

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

export function findStart(data: Dataset, name: string): StartCity {
  return data.starts.find((s) => s.name === name) ?? data.starts[0];
}

function approachFor(start: StartCity, input: PlanInput) {
  if (start.km <= 0) return null;
  return { km: start.km, h: start.h, hw: start.hw, days: Math.max(1, Math.ceil(start.h / input.maxDriveHours)) };
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
  const { nodes, legs, idx } = orderLoop(data, entryIdx, input.direction);
  const N = nodes.length;
  const approach = approachFor(start, input);
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
  // nearest stop along the loop (either side) that has local price data
  const pricedNear = (i: number): RouteNode | null => {
    for (let k = 0; k < N; k++) {
      for (const j of [i - k, i + k]) {
        const n = nodes[(j + N) % N];
        if (mealsPerDay(data, n.id, input.foodTier, input.meals) != null) return n;
      }
    }
    return null;
  };
  let stopIdx = 0;
  const planLegs: PlanLeg[] = [];

  // `final` is the arrival back at the entry: no sightseeing there, it was done at the start
  const makeStop = (node: RouteNode, nights: number, transit: boolean, final = false, sojourn = false, waitDays = 0, comfortStay = false): Stop => {
    const date = addDays(input.startDate, day);
    const month = monthOf(date);
    // a month-long stay is costed as a monthly rental
    const sleep = nights >= LONG_STAY_NIGHTS ? "R" : sleepModeFor(node, input.lodging, transit);
    const src = pricedNear(stopIdx);
    const lodging = lodgingCost(sleep, nights, input, (src && priceIndex(data, src.id)) ?? 1);
    if (lodging == null && nights > 0) uncosted.add(sleep === "C" ? "camp" : "hotel");
    const foodPerPerson = input.foodMode === "manual"
      ? foodPerDayAt(data, src?.id ?? node.id, input)
      : src ? mealsPerDay(data, src.id, input.foodTier, input.meals) : null;
    const attractions = transit || final ? [] : (attrByNode.get(node.id) ?? []).filter((a) => passesLevel(a, input.level));
    let ticketPerPerson = 0;
    let unpriced = 0;
    for (const a of attractions) {
      const p = attractionPrice(a, month);
      if (p == null) unpriced++;
      else ticketPerPerson += p;
    }
    const stayDays = Math.max(0, nights - 1);
    const excursions = !transit && input.includeExcursions && stayDays > 0 ? exByNode.get(node.id) ?? [] : [];
    const exKm = excursions.reduce((s, e) => s + e.km, 0);
    const localKm = Math.max(0, stayDays - excursions.length) * input.localKmPerStayDay + exKm;
    const fuel = fuelPriceFor(node, data, input);
    // each stay day starts on a fresh charge; spread local km evenly over those days
    let localEnergy = ZERO_ENERGY;
    if (stayDays > 0 && localKm > 0) {
      const perDay = energyFor(localKm / stayDays, node.seg, fuel, input);
      localEnergy = { fuelL: perDay.fuelL * stayDays, kwh: perDay.kwh * stayDays, fuelCost: perDay.fuelCost * stayDays, elecCost: perDay.elecCost * stayDays };
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
    };
  };

  // ---- how long to stay: rhythm, long stays at comfortable bases, waiting for the next region's season
  let lastSojournDay = 0;
  const waits: { at: string; seg: string; days: number }[] = [];
  const nextGate = (i: number): number => {
    for (let j = i + 1; j < N; j++) {
      const seg = nodes[j].seg;
      if (gates[seg] && seg !== nodes[j - 1].seg && seg !== nodes[i].seg) return j;
    }
    return -1;
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
    if (comfortable && input.sojournEveryWeeks > 0 && input.sojournWeeks > 0 && day - lastSojournDay >= input.sojournEveryWeeks * 7) {
      nights = Math.max(nights, input.sojournWeeks * 7);
      sojourn = true;
      lastSojournDay = day;
    } else if (comfortable && input.comfortStayNights > nights) {
      nights = input.comfortStayNights;
      comfortStay = true;
    }
    if (input.waitForSeason) {
      const g = nextGate(i);
      const lastBase = g > 0 && !nodes.slice(i + 1, g).some((n) => n.base);
      if (g > 0 && ((node.base && lastBase) || i === g - 1)) {
        let ahead = 0;
        for (let j = i + 1; j < g; j++) if (keepNode(nodes[j], input)) ahead += nightsFor(nodes[j], input);
        const arrive = addDays(input.startDate, day + nights + ahead);
        waitDays = Math.min(300, daysUntilWindow(arrive, gates[nodes[g].seg]));
        if (waitDays > 0) {
          nights += waitDays;
          waits.push({ at: node.id, seg: nodes[g].seg, days: waitDays });
        }
      }
    }
    return { nights, sojourn, waitDays, comfortStay };
  };

  // ---- trips home
  const breaks: PlanBreak[] = [];
  const takeBreak = (node: RouteNode) => {
    const b = input.breaks.find((x) => x.after === node.id);
    if (!b || b.days <= 0) return;
    const oneWay = haversine(node.ll, start.ll) * 1.25;
    let cost: number;
    if (b.mode === "fly") {
      cost = input.flightPerPerson * (input.adults + input.kids) * 2 + input.parkingPerDay * b.days;
    } else {
      const e = energyFor(oneWay, node.seg, fuelPriceFor(node, data, input), input);
      cost = 2 * (e.fuelCost + e.elecCost + oneWay * 0.8 * input.tollPerKm);
    }
    breaks.push({ after: node.id, date: addDays(input.startDate, day), days: b.days, mode: b.mode, km: oneWay, cost });
    costs.home += cost;
    day += b.days;
  };

  stopIdx = 0;
  const first = planStay(0);
  stops.push(makeStop(nodes[0], first.nights, false, false, first.sojourn, first.waitDays, first.comfortStay));
  day += first.nights;
  takeBreak(nodes[0]);

  let acc = { km: 0, h: 0, hw: 0, ferryKm: 0, via: [] as string[], energy: ZERO_ENERGY, toll: 0, legIdx: [] as number[] };
  let fromNode = nodes[0];
  for (let i = 0; i < N; i++) {
    const leg = legs[i];
    const isLast = i === N - 1;
    const next = isLast ? nodes[0] : nodes[i + 1];
    const legFrom = nodes[i];
    const fuel = fuelPriceFor(legFrom, data, input);
    acc = {
      km: acc.km + leg.km, h: acc.h + leg.h, hw: acc.hw + leg.hw, ferryKm: acc.ferryKm + leg.ferry,
      via: acc.via, energy: addEnergy(acc.energy, energyFor(leg.km, legFrom.seg, fuel, input)),
      toll: acc.toll + leg.hw * input.tollPerKm, legIdx: [...acc.legIdx, idx[i]],
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
    const nextLegH = isLast ? 0 : legs[i + 1].h;
    const keep = isLast || keepNode(next, input);
    const mustBreak = !keep && acc.h + nextLegH > input.maxDriveHours && leg.ferry === 0;
    if (!keep && !mustBreak) {
      acc.via.push(next.id);
      continue;
    }
    planLegs.push({
      from: fromNode.id, to: next.id, km: acc.km, h: acc.h, hw: acc.hw, ferryKm: acc.ferryKm, via: acc.via,
      seg: fromNode.seg, day, date: addDays(input.startDate, day), energy: acc.energy, toll: acc.toll,
      legIdx: acc.legIdx, reversed: input.direction === "ccw",
    });
    if (isLast) {
      stopIdx = 0;
      stops.push(makeStop(next, 0, false, true));
    } else if (!keep) {
      stopIdx = i + 1;
      stops.push(makeStop(next, 1, true));
      day += 1;
    } else {
      stopIdx = i + 1;
      const st = planStay(i + 1);
      stops.push(makeStop(next, st.nights, false, false, st.sojourn, st.waitDays, st.comfortStay));
      day += st.nights;
      takeBreak(next);
    }
    fromNode = next;
    acc = { km: 0, h: 0, hw: 0, ferryKm: 0, via: [], energy: ZERO_ENERGY, toll: 0, legIdx: [] };
  }

  const endDay = day + (approach ? approach.days : 0);
  const days = endDay + 1;
  const breakDays = breaks.reduce((a, b) => a + b.days, 0);
  const tripDays = days - breakDays;

  // ---- totals and costs
  let km = 0, hwKm = 0, driveH = 0, ferryKm = 0, localKm = 0;
  const costBySeg: Plan["costBySeg"] = {};
  const segAdd = (seg: string, k: number, d: number, c: number) => {
    const s = (costBySeg[seg] ??= { km: 0, days: 0, cost: 0 });
    s.km += k; s.days += d; s.cost += c;
  };
  for (const l of planLegs) {
    km += l.km; hwKm += l.hw; driveH += l.h; ferryKm += l.ferryKm;
    costs.fuel += l.energy.fuelCost; costs.electricity += l.energy.elecCost; costs.toll += l.toll;
    segAdd(l.seg, l.km, 0, l.energy.fuelCost + l.energy.elecCost + l.toll);
  }
  let careDays = 0;
  for (const s of stops) {
    localKm += s.localKm;
    costs.fuel += s.localEnergy.fuelCost; costs.electricity += s.localEnergy.elecCost;
    costs.lodging += s.lodgingCost; costs.tickets += s.ticketCost;
    if (s.petBanned && input.dogCare === "boarding") careDays += Math.max(1, s.nights - 1);
    segAdd(s.node.seg, s.localKm, s.nights, s.localEnergy.fuelCost + s.localEnergy.elecCost + s.lodgingCost + s.ticketCost);
  }
  if (approach) {
    const startNode = nodes[0];
    const fuel = fuelPriceFor(startNode, data, input);
    const e = energyFor(approach.km, startNode.seg, fuel, input);
    // there and back again
    km += approach.km * 2; hwKm += approach.hw * 2; driveH += approach.h * 2;
    costs.fuel += e.fuelCost * 2; costs.electricity += e.elecCost * 2;
    costs.toll += approach.hw * input.tollPerKm * 2;
    const l = lodgingCost("H", (approach.days - 1) * 2, input);
    if (l == null && approach.days > 1) uncosted.add("hotel");
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
  costs.dog = input.dog ? tripDays * input.dogPerDay + careDays * input.boardingPerDay : 0;
  costs.maintenance = ((km + localKm) / 10_000) * input.maintenancePer10k;
  costs.misc = tripDays * input.miscPerDay;

  // ---- warnings
  const visited = new Set(stops.map((s) => s.node.id));
  const visitDate = new Map(stops.map((s) => [s.node.id, s.date]));
  const offStops = stops.filter((s) => s.season === "off");
  if (offStops.length) {
    warnings.push({
      kind: "season", level: offStops.length > 8 ? "warn" : "info",
      text: `${offStops.length} 个停留点到达时不在最佳季节，可以调整出发日期或方向。`,
      nodes: offStops.map((s) => s.node.id),
    });
  }
  const longLegs = planLegs.filter((l) => l.h > input.maxDriveHours && l.ferryKm === 0);
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
    if (!visited.has(a) && !visited.has(b)) continue;
    const date = visitDate.get(a) ?? visitDate.get(b);
    if (!date) continue;
    const m = monthOf(date);
    if (m < m1 || m > m2) {
      warnings.push({ kind: "road-season", level: "critical", text: `${name} 通常只在 ${m1}–${m2} 月通行，按当前日期你会在 ${m} 月经过。`, nodes: [a, b] });
    }
  }
  const high = stops.filter((s) => (s.node.alt ?? 0) >= 4000);
  if (high.length) {
    warnings.push({
      kind: "altitude", level: "info",
      text: `${high.length} 晚住在海拔 4000m 以上，进藏前在 3000m 左右的地方适应 1–2 晚。`,
      nodes: high.map((s) => s.node.id),
    });
  }
  if (input.dog) {
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
    const seg = data.segs.find((x) => x.k === w.seg)?.name ?? w.seg;
    warnings.push({
      kind: "season", level: "info",
      text: `为了赶上「${seg}」的季节，在${at}多住 ${w.days} 天再出发。`,
      nodes: [w.at],
    });
  }
  const unpriced = stops.reduce((s, x) => s + x.unpricedAttractions, 0);
  if (unpriced) {
    warnings.push({ kind: "data", level: "info", text: `${unpriced} 个景点票价未核实，未计入门票总额。` });
  }

  const seasonScore = { good: 0, ok: 0, off: 0 };
  for (const s of stops.slice(0, -1)) if (!s.transit) seasonScore[s.season]++;

  return {
    input, start, entry: nodes[0], approach, stops, legs: planLegs, days,
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
