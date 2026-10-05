// WGS84 ↔ GCJ-02. Route data is WGS84 (OSM/OSRM); AMap renders GCJ-02, so every coordinate goes through wgsToGcj.
const A = 6378245.0;
const EE = 0.00669342162296594;

/** Outside mainland China GCJ-02 equals WGS84. */
export function outOfChina(lon: number, lat: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function tLat(x: number, y: number): number {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
}

function tLon(x: number, y: number): number {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
}

/** [lon, lat] WGS84 → [lon, lat] GCJ-02 */
export function wgsToGcj(lon: number, lat: number): [number, number] {
  if (outOfChina(lon, lat)) return [lon, lat];
  let dLat = tLat(lon - 105, lat - 35);
  let dLon = tLon(lon - 105, lat - 35);
  const radLat = (lat / 180) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * Math.PI);
  dLon = (dLon * 180) / ((A / sq) * Math.cos(radLat) * Math.PI);
  return [lon + dLon, lat + dLat];
}

/** [lon, lat] GCJ-02 → WGS84, by fixed-point iteration (error far below a metre). */
export function gcjToWgs(lon: number, lat: number): [number, number] {
  let w: [number, number] = [lon, lat];
  for (let i = 0; i < 6; i++) {
    const g = wgsToGcj(w[0], w[1]);
    w = [w[0] - (g[0] - lon), w[1] - (g[1] - lat)];
  }
  return w;
}
