// Plain Markdown export of a plan, for notes apps (Obsidian etc.) and printing.
import { costTotal } from "./plan";
import { shortDateFrom } from "./dates";
import { attractionPrice } from "./costs";
import { monthOf } from "./dates";
import { duration, hours, int, km, yuan } from "./format";
import type { Dataset, Plan } from "./types";

const COST_LABEL: Record<string, string> = {
  fuel: "燃油", electricity: "充电", toll: "过路费", tickets: "门票", lodging: "住宿",
  food: "餐饮", dog: "狗狗", ferry: "轮渡", maintenance: "保养", misc: "停车杂费", home: "回家往返",
};

export function planToMarkdown(plan: Plan, data: Dataset): string {
  const segName = new Map(data.segs.map((s) => [s.k, s.name]));
  const node = new Map(data.nodes.map((n) => [n.id, n]));
  const L: string[] = [];
  const total = costTotal(plan.costs);
  L.push(`# 全国自驾环线：从${plan.start.name}出发`, "");
  L.push(`- 出发 ${plan.input.startDate}，返回 ${plan.endDate}，共 ${plan.days} 天（约 ${duration(plan.days)}）${plan.totals.breakDays ? `，其中回家 ${plan.totals.breakDays} 天` : ""}`);
  L.push(`- 总里程 ${km(plan.totals.km + plan.totals.localKm)}（环线与往返 ${km(plan.totals.km)}，其中高速约 ${km(plan.totals.hwKm)}）`);
  L.push(`- 预估总费用 ${yuan(total)}（${plan.input.adults} 位成人${plan.input.kids ? ` + ${plan.input.kids} 位儿童` : ""}${plan.input.dog ? " + 1 只狗" : ""}）`);
  L.push("", "## 费用", "", "| 项目 | 金额 |", "|---|---:|");
  for (const [k, v] of Object.entries(plan.costs)) if (v > 0) L.push(`| ${COST_LABEL[k] ?? k} | ${yuan(v)} |`);
  L.push(`| 合计 | ${yuan(total)} |`, "");
  if (plan.warnings.length) {
    L.push("## 注意事项", "");
    for (const w of plan.warnings) {
      const names = [...new Set(w.nodes ?? [])].map((id) => node.get(id)?.n ?? id);
      L.push(`- ${w.text}${names.length ? `（${names.join("、")}）` : ""}`);
    }
    L.push("");
  }
  L.push("## 行程", "");
  const year = plan.input.startDate.slice(0, 4);
  let seg = "";
  plan.stops.forEach((s, i) => {
    if (s.node.seg !== seg) {
      seg = s.node.seg;
      L.push(`### ${seg} · ${segName.get(seg) ?? ""}`, "");
    }
    const leg = i > 0 ? plan.legs[i - 1] : null;
    if (leg && !leg.resume) {
      const via = leg.via.length ? `，途经 ${leg.via.map((v) => node.get(v)?.n).join("、")}` : "";
      const transfer = leg.parts.some((p) => "transfer" in p);
      const days = leg.driveDays > 1 ? `，分 ${leg.driveDays} 天开` : "";
      L.push(`> 🚗 ${shortDateFrom(leg.date, year)} ${transfer ? "转场" : "驾驶"} ${km(leg.km)}，约 ${hours(leg.h)}${days}${via}`, "");
    }
    const tag = s.resumed ? "（回家后接着住）" : s.transit ? "（途中过夜）" : s.sojourn ? "（旅居）" : s.waitDays ? `（等季节 ${s.waitDays} 天）` : "";
    L.push(`**${shortDateFrom(s.date, year)} ${s.node.n}${tag}** · ${s.node.p} · 海拔 ${s.node.alt ?? "?"}m · 住 ${s.nights} 晚`, "");
    if (s.resumed) { L.push(""); return; }
    if (s.node.about && !s.transit) L.push(`> ${s.node.about}`, "");
    const m = monthOf(s.date);
    for (const a of s.attractions) {
      const p = attractionPrice(a, m);
      L.push(`- 景点：${a.name}${a.level ? `（${a.level}）` : ""} ${p == null ? "票价待核实" : `约 ¥${int(p)}/人`}`);
    }
    if (!s.transit) for (const f of s.node.food) L.push(`- 美食：${f[0]}（人均约 ¥${f[2]}）${f[1] ? `：${f[1]}` : ""}`);
    if (s.node.tip && !s.transit) L.push(`- 提示：${s.node.tip}`);
    for (const b of plan.breaks.filter((x) => x.stopIdx === i)) {
      L.push(`- ${b.newYear ? `${shortDateFrom(b.date, year)} 回家过年` : "回家"}，在家住 ${b.days} 天（${b.mode === "fly" ? "坐飞机" : "开车"}${b.roadDays ? `，路上来回多花 ${b.roadDays} 天` : ""}，往返约 ${yuan(b.cost)}${b.dogBoarding ? `，狗寄养 ${b.dogBoarding} 天` : ""}），之后从这里接着走`);
    }
    L.push("");
  });
  L.push("---", "数据：里程来自 OSRM / OpenStreetMap；票价来自景区公告与公开报道（2026-10 核查），出发前请再次确认。");
  return L.join("\n");
}
