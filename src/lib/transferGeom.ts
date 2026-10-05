// Road geometry of the connecting drives between segments ([lon, lat], WGS84), loaded only when a plan uses one.
let cache: Promise<Record<string, [number, number][]>> | null = null;

export function loadTransferGeom(): Promise<Record<string, [number, number][]>> {
  cache ??= fetch("route/transfers.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return cache;
}
