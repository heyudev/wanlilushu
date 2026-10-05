// Monthly comfort score of a place for living there (not sightseeing), from climate normals.
// [tmax °C, tmin °C, relative humidity %, rainy days per month]
export type MonthClimate = [number, number, number, number];

/**
 * 0–1 score. Daytime mean 16–24 °C scores 1, falling to 0 at 6 °C and 30 °C.
 * Hot afternoons (max > 32 °C), freezing nights (min < 0 °C), muggy air (RH > 80 %) and rainy months
 * (> 10 / > 15 rainy days) each subtract. Chosen to match "冬暖夏凉、不闷不湿" — adjust here if needed.
 */
export function comfortScore([tmax, tmin, rh, rain]: MonthClimate): number {
  const t = (tmax + tmin) / 2;
  let s = t < 16 ? (t - 6) / 10 : t > 24 ? (30 - t) / 6 : 1;
  if (tmax > 32) s -= 0.3;
  if (tmin < 0) s -= 0.3;
  if (rh > 80) s -= 0.15;
  if (rain > 15) s -= 0.2;
  else if (rain > 10) s -= 0.1;
  return Math.max(0, Math.min(1, s));
}

export function comfortLabel(s: number): string {
  return s >= 0.8 ? "舒适" : s >= 0.55 ? "尚可" : s >= 0.3 ? "偏冷或偏热" : "不宜久住";
}
