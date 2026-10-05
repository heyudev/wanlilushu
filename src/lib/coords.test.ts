import { describe, expect, it } from "vitest";
import { gcjToWgs, outOfChina, wgsToGcj } from "./coords";
import { haversine } from "./geo";

describe("coordinate conversion", () => {
  it("shifts points in China by a few hundred metres", () => {
    for (const [lon, lat] of [[121.4737, 31.2304], [91.117, 29.645], [87.617, 43.825], [126.642, 45.757]]) {
      const [glon, glat] = wgsToGcj(lon, lat);
      const m = haversine([lat, lon], [glat, glon]) * 1000;
      expect(m).toBeGreaterThan(50);
      expect(m).toBeLessThan(1000);
    }
  });
  it("leaves points outside China unchanged", () => {
    expect(outOfChina(139.69, 35.69)).toBe(true);
    expect(wgsToGcj(139.69, 35.69)).toEqual([139.69, 35.69]);
  });
  it("round-trips within a metre", () => {
    const [lon, lat] = [104.0647, 30.6586];
    const [w0, w1] = gcjToWgs(...wgsToGcj(lon, lat));
    expect(haversine([lat, lon], [w1, w0]) * 1000).toBeLessThan(1);
  });
});
