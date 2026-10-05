// Data freshness audit: which researched facts need re-checking. Used by scripts/check-data.ts and CI.
import { daysBetween } from "./dates";
import type { Attraction, PolicyItem, RouteNode } from "./types";

export type AuditKind = "due" | "stale" | "unpriced" | "low-confidence" | "pets-unknown" | "unverified-policy";

export interface AuditItem {
  kind: AuditKind;
  /** node id for attractions, policy key for policy items */
  ref: string;
  name: string;
  detail: string;
}

export const AUDIT_LABEL: Record<AuditKind, string> = {
  due: "到了复核日期",
  stale: "超过有效期未复核",
  unpriced: "票价未查到",
  "low-confidence": "来源可信度低",
  "pets-unknown": "宠物政策未查到",
  "unverified-policy": "政策待确认",
};

export function auditData(
  nodes: RouteNode[], attractions: Attraction[], policy: PolicyItem[], today: string, maxAgeDays = 90,
): AuditItem[] {
  const out: AuditItem[] = [];
  const nodeName = new Map(nodes.map((n) => [n.id, n.n]));
  const age = (d?: string | null) => (d ? daysBetween(d, today) : Infinity);

  for (const a of attractions) {
    const where = `${nodeName.get(a.node) ?? a.node} · ${a.name}`;
    if (a.reviewBy && a.reviewBy <= today) out.push({ kind: "due", ref: a.node, name: where, detail: a.reviewNote ?? `复核日 ${a.reviewBy}` });
    else if (age(a.checked) > maxAgeDays) out.push({ kind: "stale", ref: a.node, name: where, detail: `上次核查 ${a.checked ?? "无记录"}` });
    if (a.peak == null) out.push({ kind: "unpriced", ref: a.node, name: where, detail: a.note?.slice(0, 60) ?? "" });
    else if (a.conf === "low") out.push({ kind: "low-confidence", ref: a.node, name: where, detail: `旺季 ¥${a.peak}` });
    if (!a.pets.includes("禁止") && !a.pets.includes("允许")) out.push({ kind: "pets-unknown", ref: a.node, name: where, detail: "" });
  }
  for (const p of policy) {
    const name = p.title ?? p.topic ?? p.key;
    if (p.reviewBy && p.reviewBy <= today) out.push({ kind: "due", ref: p.key, name, detail: p.reviewNote ?? `复核日 ${p.reviewBy}` });
    else if (age(p.checked) > maxAgeDays) out.push({ kind: "stale", ref: p.key, name, detail: `上次核查 ${p.checked ?? "无记录"}` });
    if (p.conf === "low" || /待确认|未查到/.test(p.finding)) out.push({ kind: "unverified-policy", ref: p.key, name, detail: p.finding.slice(0, 80) });
  }
  return out;
}

/** Markdown report grouped by kind, most urgent first. */
export function auditMarkdown(items: AuditItem[], today: string): string {
  const order: AuditKind[] = ["due", "stale", "unverified-policy", "unpriced", "low-confidence", "pets-unknown"];
  const L = [`# 数据待更新清单（${today}）`, "", "| 类别 | 条数 |", "|---|---:|"];
  for (const k of order) L.push(`| ${AUDIT_LABEL[k]} | ${items.filter((i) => i.kind === k).length} |`);
  for (const k of order) {
    const rows = items.filter((i) => i.kind === k);
    if (!rows.length) continue;
    L.push("", `## ${AUDIT_LABEL[k]}（${rows.length}）`, "");
    for (const r of rows) L.push(`- ${r.name}${r.detail ? `：${r.detail}` : ""}`);
  }
  L.push("", "更新方法见仓库 `docs/数据维护.md`。");
  return L.join("\n");
}
