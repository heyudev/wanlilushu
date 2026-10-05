// Shapes of the bundled data (src/data/*.json, produced by scripts/build_data.py) and of a generated plan.

export type LatLon = [number, number];
export type Confidence = "high" | "medium" | "low";

export interface Segment {
  k: string;
  name: string;
  range: string;
  season: string;
}

export interface NodeImage {
  src: string;
  /** what the photo shows (Wikipedia/Commons title), may differ from the stop name */
  title?: string;
  author: string;
  license: string;
  page: string;
  /** illustrative photo of the region, not of the exact place */
  generic?: boolean;
}

export interface FerryInfo {
  name: string;
  from_ll: LatLon;
  to_ll: LatLon;
  hours: number;
  /** sailing time is a planning guess, not a published figure */
  hoursEstimated?: boolean;
  research?: Record<string, unknown>;
}

export type Interest = "food" | "nature" | "culture" | "city" | "plateau";

export interface RouteNode {
  id: string;
  n: string;
  p: string;
  seg: string;
  ll: LatLon;
  nights: number;
  best: number[];
  star: 1 | 2 | 3;
  /** H=酒店 C=露营 V=车宿, space separated, first is recommended */
  sleep: string;
  wiki: string[];
  /** [dish, note, per-person price range in yuan] */
  food: [string, string, string][];
  tip: string;
  dog: string;
  ex: [string, number, number][];
  tags: Interest[];
  /** city / town / nature / transit */
  kind?: string;
  /** long-stay candidate (rentals, supermarkets, hospitals nearby) */
  base?: boolean;
  /** history, culture and daily life */
  about?: string;
  alt: number | null;
  img?: NodeImage;
  ferry?: FerryInfo;
  /** added by the traveller */
  custom?: boolean;
}

/** A place the traveller adds after an existing stop; legs come from AMap driving directions. */
export interface CustomStop {
  id: string;
  name: string;
  province: string;
  /** WGS84 */
  ll: LatLon;
  after: string;
  nights: number;
  legIn: { km: number; h: number; hw: number; toll: number | null; geom: [number, number][] };
  legOut: { km: number; h: number; hw: number; toll: number | null; geom: [number, number][] };
}

export interface Leg {
  frm: string;
  to: string;
  km: number;
  h: number;
  /** expressway km (estimated from road refs) */
  hw: number;
  /** sea distance for a ferry crossing, 0 otherwise */
  ferry: number;
  geom: [number, number][];
  land_km?: number;
  land_h?: number;
  land_hw?: number;
  /** index in the bundled loop; absent on legs to or from a stop the traveller added */
  orig?: number;
  /** km from the start of the bundled loop to this leg's start (where elevation samples are measured) */
  origStart?: number;
}

export interface Excursion {
  node: string;
  name: string;
  ll: LatLon;
  km: number;
  h: number;
  hw: number;
}

export interface Extra {
  item: string;
  price: number | null;
}

export interface Attraction {
  node: string;
  name: string;
  level: string | null;
  peak: number | null;
  off: number | null;
  season: string | null;
  extras: Extra[];
  reserve: string | null;
  pets: string;
  petsNote: string | null;
  discounts?: string | null;
  open?: string | null;
  src: string[];
  conf: Confidence;
  note: string | null;
  /** date this entry was last verified, YYYY-MM-DD */
  checked?: string | null;
  /** re-verify on or after this date (a known price window or policy end) */
  reviewBy?: string | null;
  reviewNote?: string | null;
}

export interface Campsite {
  node: string;
  name: string;
  location?: string | null;
  price?: string | number | null;
  pets?: string | null;
  src?: string[] | null;
  confidence?: string | null;
  note?: string | null;
  checked?: string | null;
}

export interface PolicyItem {
  key: string;
  title?: string | null;
  topic?: string | null;
  finding: string;
  data?: unknown;
  src: string[];
  conf: Confidence;
  asOf?: string | null;
  checked?: string | null;
  reviewBy?: string | null;
  reviewNote?: string | null;
}

export interface StartCity {
  name: string;
  ll: LatLon;
  entry: string;
  km: number;
  h: number;
  hw: number;
}

export type MonthClimate = [number, number, number, number];

export interface ScenicRoad {
  id: string;
  name: string;
  legs: string[];
  best: number[];
  about: string;
}

export interface PoiCount {
  count: number;
}

/** AMap keyword matches within 15 km: pet-accepting hotels, dog-friendly restaurants or dog cafés, pet clinics. */
export interface PetFriendly {
  hotels: PoiCount;
  dining: PoiCount;
  vets: PoiCount;
  checked: string;
}

export type DogSize = "small" | "medium" | "large";

/** 25th / 50th / 75th percentile of per-person cost (人均) of restaurants within 3 km, from AMap. */
export interface PriceStat {
  n: number;
  p25?: number;
  p50?: number;
  p75?: number;
}

export interface LocalPrices {
  meal: PriceStat;
  quick: PriceStat;
  checked: string;
}

export type FoodTier = "budget" | "normal" | "nice";

export interface Dataset {
  segs: Segment[];
  nodes: RouteNode[];
  legs: Leg[];
  exs: Excursion[];
  attractions: Attraction[];
  starts: StartCity[];
  /** 92# price by province name, yuan/L */
  fuelByProvince: Record<string, number>;
  fuelDefault: number;
  /** monthly climate normals per stop id (12 entries) */
  climate: Record<string, MonthClimate[]>;
  pet: Record<string, PetFriendly>;
  prices: Record<string, LocalPrices>;
  /** median of all stops' sit-down meal p50, the base of the local price index */
  priceMedian: number | null;
  roads: ScenicRoad[];
  /** driving routes between segment ends that are not joined by a loop leg, keyed "a>b" (driven either way) */
  transfers: Record<string, Transfer>;
}

export interface Transfer {
  km: number;
  h: number;
  hw: number;
  /** loop stops the route passes within 10 km of */
  near?: string[];
}

// ---------- plan input / output

export type Direction = "cw" | "ccw";
export type Pace = "full" | "highlights" | "essentials";
export type VehicleType = "phev" | "hev" | "ice";
export type LodgingStrategy = "budget" | "balanced" | "comfort";
export type LevelFilter = "all" | "4A" | "5A";
/** H=酒店 C=露营 V=车宿 R=月租（长住） */
export type SleepMode = "H" | "C" | "V" | "R";
export type Rhythm = "checkin" | "slow" | "deep" | "sojourn" | "custom";

export interface HomeBreak {
  /** stop id after which the trip pauses */
  after: string;
  days: number;
  mode: "drive" | "fly";
}

/** auto: follow the seasons for slow rhythms, the loop for 打卡 */
export type RouteOrder = "auto" | "loop" | "season";

export interface NewYearHome {
  days: number;
  mode: "drive" | "fly";
}

export interface PlanInput {
  start: string;
  startDate: string;
  /** loop: the fixed national loop; season: segments reordered so each is visited in its season */
  routeOrder: RouteOrder;
  direction: Direction;
  pace: Pace;
  interests: Interest[];
  level: LevelFilter;
  adults: number;
  kids: number;
  dog: boolean;
  dogSize: DogSize;
  dogCare: "rotate" | "boarding";
  vehicle: VehicleType;
  evRangeKm: number;
  kwhPer100: number;
  lPer100: number;
  /** null = use researched price for each province */
  fuelPrice: number | null;
  elecPrice: number;
  tollPerKm: number;
  lodging: LodgingStrategy;
  /** what you pay per room-night where prices are average; null = not filled in, lodging not costed */
  hotelPerRoom: number | null;
  /** scale hotel prices by each stop's local price level (from restaurant prices) */
  localPrice: boolean;
  campPerNight: number | null;
  /** local = from nearby restaurant prices; manual = your own per-person daily amount */
  foodMode: "local" | "manual";
  foodTier: FoodTier;
  /** meals a day: 1 = one sit-down meal; 2 = a quick meal and a sit-down meal; 3 = two quick meals and a sit-down meal */
  meals: 1 | 2 | 3;
  /** manual mode: per person per meal where prices are average; null = not filled in */
  foodPerMeal: number | null;
  dogPerDay: number;
  boardingPerDay: number;
  /** local driving per stay day; long stays count it only for an ordinary visit's days */
  localKmPerStayDay: number;
  maintenancePer10k: number;
  miscPerDay: number;
  includeExcursions: boolean;
  maxDriveHours: number;
  rhythm: Rhythm;
  /** multiplies each stop's nights */
  stayFactor: number;
  /** nights at a comfortable long-stay place (1–2 weeks); 0 = no extra stay */
  comfortStayNights: number;
  /** take a long stay (旅居) at a comfortable base after about N weeks of travel since the last one; 0 = never */
  sojournEveryWeeks: number;
  sojournWeeks: number;
  /** minimum climate comfort (0–1) for a long stay */
  minComfort: number;
  /** wait at the last base before a seasonal region until its window opens */
  waitForSeason: boolean;
  /** monthly rent for month-long stays; null = price those nights as hotel nights */
  rentPerMonth: number | null;
  breaks: HomeBreak[];
  /** go home for the Spring Festival every year the trip spans; null = no */
  newYearHome: NewYearHome | null;
  flightPerPerson: number;
  parkingPerDay: number;
  /** total budget in yuan, null = none */
  budget: number | null;
  /** stops the traveller removed */
  skip: string[];
  /** segments driven through without stopping */
  skipSegs: string[];
  /** nights chosen by the traveller for a stop, overriding the rhythm */
  nightsOverride: Record<string, number>;
  custom: CustomStop[];
}

export interface PlanLeg {
  from: string;
  to: string;
  km: number;
  h: number;
  hw: number;
  ferryKm: number;
  /** nodes passed without stopping */
  via: string[];
  seg: string;
  day: number;
  date: string;
  energy: EnergyCost;
  toll: number;
  /** indexes into Dataset.legs, in travel order */
  legIdx: number[];
  /** travelled against the stored leg direction */
  reversed: boolean;
  /** what the day's drive is made of, in order: loop legs and connecting drives between segments */
  parts: PlanPart[];
  /** days on the road (a long connecting drive takes several, with nights in between) */
  driveDays: number;
  /** no drive: the same stop again after a trip home */
  resume?: boolean;
}

export type PlanPart =
  | { leg: number; reversed: boolean }
  /** `estimated`: no road data for this pair, distance from the straight line × 1.25 */
  | { transfer: string; reversed: boolean; km: number; estimated: boolean };

export interface EnergyCost {
  fuelL: number;
  kwh: number;
  fuelCost: number;
  elecCost: number;
}

export interface Stop {
  node: RouteNode;
  day: number;
  date: string;
  nights: number;
  /** overnight inserted only to break a long drive */
  transit: boolean;
  sleep: SleepMode;
  season: "good" | "ok" | "off";
  lodgingCost: number;
  /** per person per day at this stop; null when it cannot be priced */
  foodPerPerson: number | null;
  /** id of the stop whose prices were used when this one has too little data */
  priceFrom: string | null;
  ticketCost: number;
  /** attractions counted for this stop (after the level filter) */
  attractions: Attraction[];
  unpricedAttractions: number;
  petBanned: boolean;
  localKm: number;
  localEnergy: EnergyCost;
  excursions: Excursion[];
  /** stayed 1–2 weeks because the place is comfortable that month */
  comfortStay: boolean;
  /** long stay (旅居) of a month or more */
  sojourn: boolean;
  /** extra nights waiting for the next region's season */
  waitDays: number;
  /** climate comfort 0–1 in the arrival month, null when no climate data */
  comfort: number | null;
  /** the rest of a stay, after a trip home in the middle of it */
  resumed?: boolean;
}

export interface PlanBreak {
  after: string;
  /** index in Plan.stops after which the trip pauses */
  stopIdx: number;
  /** the yearly Spring Festival trip */
  newYear?: boolean;
  /** driving: days on the road there and back beyond the day of leaving and of returning */
  roadDays?: number;
  /** flying: days the dog is boarded meanwhile */
  dogBoarding?: number;
  date: string;
  /** at home, not counting days on the road */
  days: number;
  mode: "drive" | "fly";
  /** one-way distance home, great-circle × 1.25 (estimate) */
  km: number;
  cost: number;
}

export interface CostBreakdown {
  fuel: number;
  electricity: number;
  toll: number;
  tickets: number;
  lodging: number;
  food: number;
  dog: number;
  ferry: number;
  maintenance: number;
  misc: number;
  /** trips home: tickets or fuel and tolls, parking */
  home: number;
}

export type WarningKind =
  | "season"
  | "long-drive"
  | "permit"
  | "permit-suspended"
  | "altitude"
  | "road-season"
  | "dog"
  | "holiday"
  | "data";

export interface PlanWarning {
  kind: WarningKind;
  level: "info" | "warn" | "critical";
  text: string;
  nodes?: string[];
}

export interface Approach {
  km: number;
  h: number;
  hw: number;
  days: number;
  /** no road data: straight line × 1.25 at the loop's average speed */
  estimated?: boolean;
}

export interface Plan {
  input: PlanInput;
  start: StartCity;
  entry: RouteNode;
  /** home to the first stop */
  approach: Approach | null;
  /** last stop back home */
  homeward: Approach | null;
  /** true: the last stop is the arrival back where the loop was joined; false: the trip ends at its last stop */
  loop: boolean;
  /** segments in travel order */
  order: { seg: string; rev: boolean }[];
  stops: Stop[];
  legs: PlanLeg[];
  days: number;
  endDate: string;
  totals: { km: number; hwKm: number; driveH: number; ferryKm: number; nights: number; localKm: number; breakDays: number; tripDays: number;
    waitDays: number; sojournNights: number };
  breaks: PlanBreak[];
  costs: CostBreakdown;
  costBySeg: Record<string, { km: number; days: number; cost: number }>;
  /** cost items that could not be priced: missing inputs or data */
  uncosted: ("hotel" | "camp" | "food")[];
  warnings: PlanWarning[];
  seasonScore: { good: number; ok: number; off: number };
}
