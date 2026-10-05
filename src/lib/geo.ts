/** Great-circle distance in km between [lat, lon] pairs. */
export function haversine(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
