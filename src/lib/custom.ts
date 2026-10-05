// Splices the traveller's own places into the bundled loop. Each one replaces the leg after its anchor stop
// with two legs from AMap driving directions; bundled legs keep their original index in `orig`.
import { withOrigins } from "./legs";
import type { CustomStop, Dataset, Leg, RouteNode } from "./types";

export function customNode(c: CustomStop, anchor: RouteNode): RouteNode {
  return {
    id: c.id, n: c.name, p: c.province, seg: anchor.seg, ll: c.ll, nights: c.nights, best: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    star: 2, sleep: "H", wiki: [], food: [], tip: "", dog: "", ex: [], tags: ["culture"], kind: "town", alt: null, custom: true,
  };
}

const asLeg = (frm: string, to: string, l: CustomStop["legIn"]): Leg => ({ frm, to, km: l.km, h: l.h, hw: l.hw, ferry: 0, geom: l.geom });

export function applyCustomStops(data: Dataset, customs: CustomStop[]): Dataset {
  let nodes = [...data.nodes];
  let legs: Leg[] = data.legs.some((l) => l.orig != null) ? [...data.legs] : withOrigins(data.legs);
  for (const c of customs) {
    const i = nodes.findIndex((n) => n.id === c.after);
    if (i < 0 || nodes.some((n) => n.id === c.id)) continue;
    const next = nodes[(i + 1) % nodes.length];
    const node = customNode(c, nodes[i]);
    nodes = [...nodes.slice(0, i + 1), node, ...nodes.slice(i + 1)];
    // legs[i] went from nodes[i] to next; it becomes two legs through the new stop
    legs = [...legs.slice(0, i), asLeg(nodes[i].id, c.id, c.legIn), asLeg(c.id, next.id, c.legOut), ...legs.slice(i + 1)];
  }
  return { ...data, nodes, legs };
}
