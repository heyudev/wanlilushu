import { gcjToWgs, wgsToGcj } from "./coords";
import { isTripPlace, tripPairs, type ShortTripInput, type TripDrive, type TripPlace } from "./shortTrip";

export const SEARCH_TIMEOUT_MS = 15_000;
export const GENERATION_TIMEOUT_MS = 60_000;
export function tripErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "高德地图加载或查询失败，请检查网络、Key 与域名权限后刷新页面。";
}
function serviceError(message: string, result: unknown): Error {
  const code = typeof result === "string" && /^[A-Z0-9_]+$/.test(result) ? `（${result}）` : "";
  return new Error(message + code);
}
// AMap JS callbacks expose no transport timeout. Abort bounds the UI wait and ignores late callbacks.
export function abortable<T>(start: (resolve: (value: T) => void, reject: (error: Error) => void) => void, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("查询已取消或超时，请重试。")); return; }
    let done = false;
    const finish = (action: () => void) => {
      if (done) return;
      done = true; signal.removeEventListener("abort", onAbort); action();
    };
    const onAbort = () => finish(() => reject(new Error("查询已取消或超时，请重试。")));
    signal.addEventListener("abort", onAbort, { once: true });
    try { start((v) => finish(() => resolve(v)), (e) => finish(() => reject(e))); }
    catch (e) { finish(() => reject(e instanceof Error ? e : new Error("高德查询失败。"))); }
  });
}

// SDK runtime types are supplied by the AMap loader.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function searchTripPlaces(AMap: any, query: string, signal: AbortSignal): Promise<TripPlace[]> {
  return abortable((resolve, reject) => {
    new AMap.PlaceSearch({ pageSize: 8, city: "全国" }).search(query.trim(), (status: string, result: any) => {
      if (status !== "complete") { reject(serviceError(status === "no_data" ? "没有找到地点，请加上城市名再搜索。" : "高德地点查询失败，请检查网络、Key 与域名权限。", result)); return; }
      const places: TripPlace[] = (result?.poiList?.pois ?? []).filter((p: any) => p.location && Number.isFinite(p.location.lng) && Number.isFinite(p.location.lat))
        .map((p: any) => ({ name: p.name, address: [p.pname, p.cityname, typeof p.address === "string" ? p.address : ""].filter((v) => typeof v === "string" && v).join(" · "),
          ll: gcjToWgs(p.location.lng, p.location.lat) })).filter(isTripPlace);
      if (!places.length) reject(new Error("没有找到可用坐标，请换一个地点。"));
      else resolve(places);
    });
  }, signal);
}

function thin(path: [number, number][]): [number, number][] {
  if (path.length <= 500) return path;
  return Array.from({ length: 500 }, (_, i) => path[Math.round(i * (path.length - 1) / 499)]);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function queryTripDrive(AMap: any, from: TripPlace, to: TripPlace, policy: ShortTripInput["policy"], signal: AbortSignal): Promise<TripDrive> {
  return abortable((resolve, reject) => {
    const selected = { fastest: AMap.DrivingPolicy.LEAST_TIME, leastFee: AMap.DrivingPolicy.LEAST_FEE, shortest: AMap.DrivingPolicy.LEAST_DISTANCE }[policy];
    const a = wgsToGcj(...from.ll), b = wgsToGcj(...to.ll);
    new AMap.Driving({ policy: selected }).search(new AMap.LngLat(...a), new AMap.LngLat(...b), (status: string, result: any) => {
      const route = result?.routes?.[0];
      if (status !== "complete" || !route) { reject(serviceError(`${from.name} → ${to.name}：没有查到驾车路线，请检查地点与高德权限。`, result)); return; }
      const path: [number, number][] = (route.steps ?? []).flatMap((s: any) => (s.path ?? []).map((p: any) => gcjToWgs(p.lng, p.lat)));
      const toll = route.tolls == null || route.tolls === "" ? null : Number(route.tolls);
      if (!Number.isFinite(route.distance) || route.distance <= 0 || !Number.isFinite(route.time) || route.time <= 0
        || path.length < 2 || path.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat))
        || (toll !== null && (!Number.isFinite(toll) || toll < 0))) {
        reject(new Error(`${from.name} → ${to.name}：高德返回的路线数据不完整。`)); return;
      }
      resolve({ from, to, km: route.distance / 1000, h: route.time / 3600, toll, geom: thin(path) });
    });
  }, signal);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryShortTrip(AMap: any, input: ShortTripInput, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<TripDrive[]> {
  const pairs = tripPairs(input), legs: TripDrive[] = [];
  for (const [from, to] of pairs) {
    legs.push(await queryTripDrive(AMap, from, to, input.policy, signal));
    onProgress(legs.length, pairs.length);
  }
  return legs;
}
