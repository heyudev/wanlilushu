import { addDays, formatDate, parseDate } from "./dates";

export const SHORT_TRIP_KEY = "wanlilushu.short.v1";
export const MAX_WAYPOINTS = 5;
export interface TripPlace { name: string; address: string; ll: [number, number] } // WGS84 [lon, lat]
export interface ShortTripInput {
  origin: TripPlace | null; destination: TripPlace | null; waypoints: TripPlace[];
  startDate: string; days: number; roundTrip: boolean; maxDriveHours: number;
  policy: "fastest" | "leastFee" | "shortest";
  adults: number; kids: number; dog: boolean; notes: string;
  budget: number | null; hotelPerNight: number | null; foodPerDay: number | null; energyPerKm: number | null;
}
export interface TripDrive { from: TripPlace; to: TripPlace; km: number; h: number; toll: number | null; geom: [number, number][] }
export interface DayDrive { leg: number; h: number; km: number; partial: boolean; from: string; to: string }
export interface TripDay { date: string; drives: DayDrive[]; overnight: string | null; destinationStay: boolean }
export interface ShortTripPlan {
  input: ShortTripInput; legs: TripDrive[]; days: TripDay[]; km: number; h: number;
  minimumDays: number; toll: number | null; subtotal: number; missingCosts: string[]; warnings: string[];
}

export function defaultShortTrip(today: string): ShortTripInput {
  return { origin: null, destination: null, waypoints: [], startDate: today, days: 3, roundTrip: true,
    maxDriveHours: 4, policy: "fastest", adults: 2, kids: 0, dog: false, notes: "",
    budget: null, hotelPerNight: null, foodPerDay: null, energyPerKm: null };
}
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (v: unknown, min: number, max: number): v is number => finite(v) && Number.isInteger(v) && v >= min && v <= max;
const money = (v: unknown) => v === null || (finite(v) && v >= 0);
export function isTripPlace(v: unknown): v is TripPlace {
  if (!v || typeof v !== "object") return false;
  const p = v as TripPlace;
  return typeof p.name === "string" && !!p.name.trim() && typeof p.address === "string" && Array.isArray(p.ll)
    && p.ll.length === 2 && finite(p.ll[0]) && finite(p.ll[1]) && Math.abs(p.ll[0]) <= 180 && Math.abs(p.ll[1]) <= 90;
}
export function parseShortTrip(v: unknown): ShortTripInput | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const p = v as ShortTripInput;
  if (!(p.origin === null || isTripPlace(p.origin)) || !(p.destination === null || isTripPlace(p.destination))
    || !Array.isArray(p.waypoints) || p.waypoints.length > MAX_WAYPOINTS || !p.waypoints.every(isTripPlace)
    || typeof p.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)
    || !Number.isFinite(parseDate(p.startDate)) || formatDate(parseDate(p.startDate)) !== p.startDate
    || !count(p.days, 1, 30) || typeof p.roundTrip !== "boolean" || !finite(p.maxDriveHours) || p.maxDriveHours < 1 || p.maxDriveHours > 12
    || !["fastest", "leastFee", "shortest"].includes(p.policy) || !count(p.adults, 1, 20) || !count(p.kids, 0, 20)
    || typeof p.dog !== "boolean" || typeof p.notes !== "string" || p.notes.length > 2000
    || ![p.budget, p.hotelPerNight, p.foodPerDay, p.energyPerKm].every(money)) return null;
  // Keep only known fields; routes and arbitrary external fields never enter storage.
  return { origin: p.origin, destination: p.destination, waypoints: p.waypoints, startDate: p.startDate, days: p.days,
    roundTrip: p.roundTrip, maxDriveHours: p.maxDriveHours, policy: p.policy, adults: p.adults, kids: p.kids, dog: p.dog,
    notes: p.notes, budget: p.budget, hotelPerNight: p.hotelPerNight, foodPerDay: p.foodPerDay, energyPerKm: p.energyPerKm };
}
export function loadShortTrip(read: () => string | null): { input: ShortTripInput | null; error: string | null } {
  let raw;
  try { raw = read(); } catch { return { input: null, error: "浏览器无法读取短途存档，请重新设置。" }; }
  if (raw === null) return { input: null, error: null };
  try {
    const input = parseShortTrip(JSON.parse(raw));
    return { input, error: input ? null : "短途存档已损坏，请重新设置。原存档会保留到生成新路书。" };
  } catch { return { input: null, error: "短途存档已损坏，请重新设置。原存档会保留到生成新路书。" }; }
}
export const samePlace = (a: TripPlace, b: TripPlace) => a.ll[0] === b.ll[0] && a.ll[1] === b.ll[1];
export function tripPairs(input: ShortTripInput): [TripPlace, TripPlace][] {
  if (!parseShortTrip(input)) throw new Error("请检查短途条件：总天数为 1–30 天，每日驾驶为 1–12 小时。其他数字不能为负。" );
  if (!input.origin || !input.destination) throw new Error("请搜索并选择出发点和目的地。" );
  const places = [input.origin, ...input.waypoints, input.destination, ...(input.roundTrip ? [input.origin] : [])];
  const pairs = places.slice(1).map((to, i): [TripPlace, TripPlace] => [places[i], to]);
  if (pairs.some(([a, b]) => samePlace(a, b))) throw new Error("相邻地点相同，请删除重复地点或调整单程 / 往返。" );
  return pairs;
}

const EPS = 1e-8;
function pack(legs: TripDrive[], indices: number[], limit: number): DayDrive[][] {
  const days: DayDrive[][] = [[]];
  let used = 0;
  for (const index of indices) {
    const leg = legs[index];
    let remaining = leg.h;
    while (remaining > EPS) {
      if (limit - used <= EPS) { days.push([]); used = 0; }
      const h = Math.min(remaining, limit - used);
      const first = Math.abs(remaining - leg.h) < EPS;
      const last = remaining - h <= EPS;
      days[days.length - 1].push({ leg: index, h, km: leg.km * h / leg.h, partial: !first || !last,
        from: first ? leg.from.name : `途中（${leg.from.name} → ${leg.to.name}）`,
        to: last ? leg.to.name : `途中中转（${leg.from.name} → ${leg.to.name}，住宿地点待选）` });
      remaining -= h; used += h;
    }
  }
  return days;
}

export function buildShortTrip(input: ShortTripInput, legs: TripDrive[]): ShortTripPlan {
  const pairs = tripPairs(input);
  if (legs.length !== pairs.length || legs.some((l, i) => !samePlace(l.from, pairs[i][0]) || !samePlace(l.to, pairs[i][1])
    || !finite(l.km) || l.km <= 0 || !finite(l.h) || l.h <= 0 || !money(l.toll)
    || !Array.isArray(l.geom) || l.geom.length < 2 || l.geom.some(([lon, lat]) => !finite(lon) || !finite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90))) {
    throw new Error("驾车路线不完整或顺序不符，请重新查询。" );
  }
  const indices = legs.map((_, i) => i);
  const required = Math.max(1, Math.ceil((legs.reduce((s, l) => s + l.h, 0) - EPS) / input.maxDriveHours));
  if (required > input.days) throw new Error(`按每天最多驾驶 ${input.maxDriveHours} 小时，至少需要 ${required} 天；请增加总天数、减少途经点或调整驾驶上限。`);
  const combined = pack(legs, indices, input.maxDriveHours);
  const minimumDays = combined.length;
  if (minimumDays > input.days) throw new Error(`按每天最多驾驶 ${input.maxDriveHours} 小时，至少需要 ${minimumDays} 天；请增加总天数、减少途经点或调整驾驶上限。`);
  const destination = input.destination!.name;
  let schedule: DayDrive[][];
  if (input.roundTrip) {
    const outbound = pack(legs, indices.slice(0, -1), input.maxDriveHours);
    const homeward = pack(legs, indices.slice(-1), input.maxDriveHours);
    schedule = input.days >= outbound.length + homeward.length
      ? [...outbound, ...Array.from({ length: input.days - outbound.length - homeward.length }, () => []), ...homeward]
      : combined;
  } else {
    schedule = [...combined, ...Array.from({ length: input.days - combined.length }, () => [])];
  }
  const days: TripDay[] = schedule.map((drives, i) => ({ date: addDays(input.startDate, i), drives,
    destinationStay: drives.length === 0,
    overnight: i === input.days - 1 ? null : drives.at(-1)?.to ?? destination }));
  const km = legs.reduce((s, l) => s + l.km, 0), h = legs.reduce((s, l) => s + l.h, 0);
  const toll = legs.every((l) => l.toll !== null) ? legs.reduce((s, l) => s + l.toll!, 0) : null;
  const missingCosts = [toll === null ? "部分过路费" : "", input.energyPerKm === null ? "能源" : "",
    input.days > 1 && input.hotelPerNight === null ? "住宿" : "", input.foodPerDay === null ? "餐饮" : "", "门票、停车及其他花费"].filter(Boolean);
  const subtotal = legs.reduce((s, l) => s + (l.toll ?? 0), 0) + km * (input.energyPerKm ?? 0)
    + (input.days - 1) * (input.hotelPerNight ?? 0) + input.days * (input.foodPerDay ?? 0);
  if (!finite(km) || !finite(subtotal)) throw new Error("里程或费用超出可计算范围，请检查路线和填写的价格。" );
  const warnings = ["驾驶时长为高德查询值，不含休息、游览及临时拥堵；途经点只安排顺路到访，游览时间需另留。",
    "景点开放、预约、住宿价格和道路通行情况需出发前确认。"];
  if (days.some((d) => d.drives.some((l) => l.partial))) warnings.push("长路段已按驾驶上限拆天；中转住宿地点待选，每日公里数按时长比例估算。" );
  if (input.dog) warnings.push("携宠出行：需逐一确认景点与住宿的宠物准入规定，不能据此路书认定允许带狗。" );
  if (input.kids) warnings.push("带孩子出行：休息和游览时间需另外预留，确认安全座椅及住宿入住人数。" );
  if (input.roundTrip && input.days < pack(legs, indices.slice(0, -1), input.maxDriveHours).length + pack(legs, indices.slice(-1), input.maxDriveHours).length) {
    warnings.push("行程紧凑：到达目的地当天即开始返程，没有安排完整游览日。" );
  }
  if (input.budget !== null) warnings.push(subtotal > input.budget ? "已填写的费用小计超过预算，请调整条件。" : "费用尚有未计项，当前小计低于预算不能保证最终不超支。" );
  return { input, legs, days, km, h, minimumDays, toll, subtotal, missingCosts, warnings };
}

const xml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);
const line = (s: string) => s.replace(/[\r\n]+/g, " ");
export function shortTripMarkdown(p: ShortTripPlan): string {
  return [`# 短途路书：${line(p.input.origin!.name)} → ${line(p.input.destination!.name)}`,
    `${p.input.startDate} 出发 · ${p.input.days} 天 · ${p.input.roundTrip ? "往返" : "单程"} · ${p.input.adults} 成人 / ${p.input.kids} 儿童${p.input.dog ? " · 带狗" : ""}`,
    `路程 ${p.km.toFixed(1)} km，纯驾驶约 ${p.h.toFixed(1)} 小时。费用小计 ¥${p.subtotal.toFixed(0)}（估算）；未计：${p.missingCosts.join("、")}。`,
    ...p.days.flatMap((d, i) => [`\n## 第 ${i + 1} 天 · ${d.date}`, ...(d.destinationStay ? [`在${line(p.input.destination!.name)}自由安排，景点及预约待确认。`] :
      d.drives.map((l) => `${line(l.from)} → ${line(l.to)} · ${l.km.toFixed(1)} km${l.partial ? "（拆天估算）" : ""} · 驾驶约 ${l.h.toFixed(1)} 小时`)),
    d.overnight ? `住宿区域：${line(d.overnight)}；具体住宿待选。` : "行程结束。"]),
    "\n## 出发准备", ...p.warnings.map((w) => `- ${w}`), "\n## 其他要求（备注，未自动解释）", p.input.notes || "未填写", ""].join("\n\n");
}
export function shortTripGpx(p: ShortTripPlan): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Wanlilushu" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(p.input.origin!.name)} → ${xml(p.input.destination!.name)}</name>${p.legs.map((l) => `<trkseg>${l.geom.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join("")}</trkseg>`).join("")}</trk></gpx>`;
}
