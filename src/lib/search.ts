// Finds stops by name, province, food, attraction or a few plain-language tags.
import type { Dataset, RouteNode } from "./types";

export interface SearchHit {
  node: RouteNode;
  /** why it matched, shown under the name */
  reason: string;
  score: number;
}

const TAG_WORDS: [RegExp, (n: RouteNode, d: Dataset) => boolean, string][] = [
  [/带狗|宠物|狗/, (n, d) => (d.pet[n.id]?.hotels.count ?? 0) >= 10, "能带狗的酒店较多"],
  [/旅居|长住|住一段/, (n) => n.base === true, "适合长住"],
  [/5A/i, (n, d) => d.attractions.some((a) => a.node === n.id && a.level === "5A"), "有 5A 景区"],
  [/古镇|古城|村寨/, (n) => n.kind === "town", "古镇村寨"],
  [/高原|西藏|藏区/, (n) => (n.alt ?? 0) >= 3000, "海拔 3000 米以上"],
];

export function searchStops(data: Dataset, query: string, limit = 12): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits = new Map<string, SearchHit>();
  const add = (node: RouteNode, score: number, reason: string) => {
    const cur = hits.get(node.id);
    if (!cur || cur.score < score) hits.set(node.id, { node, score, reason });
  };
  for (const n of data.nodes) {
    if (n.n.includes(q)) add(n, 100 - n.n.indexOf(q), n.p);
    else if (n.p.includes(q)) add(n, 60, n.p);
    const food = n.food.find((f) => f[0].includes(q));
    if (food) add(n, 50, `美食：${food[0]}`);
    const attr = data.attractions.find((a) => a.node === n.id && a.name.includes(q));
    if (attr) add(n, 55, `景点：${attr.name}`);
    if (n.about?.includes(q)) add(n, 30, n.about.slice(0, 30) + "…");
  }
  for (const [re, test, reason] of TAG_WORDS) {
    if (re.test(q)) for (const n of data.nodes) if (test(n, data)) add(n, 40 + n.star, reason);
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
