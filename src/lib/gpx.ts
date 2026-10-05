// GPX 1.1 export: every overnight stop as a waypoint, the whole drive as one track (WGS84, as GPX expects).
import { shortDate } from "./dates";
import type { Dataset, Plan } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function planToGpx(plan: Plan, data: Dataset): string {
  const L: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="万里路书 wanlilushu.cn" xmlns="http://www.topografix.com/GPX/1/1">`,
    `<metadata><name>${esc(`万里路书：从${plan.start.name}出发`)}</name></metadata>`,
  ];
  const seen = new Set<string>();
  plan.stops.forEach((s, i) => {
    if (seen.has(s.node.id)) return;
    seen.add(s.node.id);
    L.push(`<wpt lat="${s.node.ll[0]}" lon="${s.node.ll[1]}"><name>${esc(`${i + 1} ${s.node.n}`)}</name>`
      + `<desc>${esc(`${shortDate(s.date)} 到，住 ${s.nights} 晚`)}</desc></wpt>`);
  });
  L.push(`<trk><name>${esc("全程路线")}</name>`);
  for (const pl of plan.legs) {
    const pts = pl.legIdx.flatMap((li) => data.legs[li].geom);
    if (!pts.length) continue;
    L.push(`<trkseg>${pts.map(([lon, lat]) => `<trkpt lat="${lat}" lon="${lon}"/>`).join("")}</trkseg>`);
  }
  L.push(`</trk>`, `</gpx>`);
  return L.join("\n");
}
