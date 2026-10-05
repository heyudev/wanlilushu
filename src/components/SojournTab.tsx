import { useMemo, useState } from "react";
import { comfortScore } from "../lib/comfort";
import { monthOf, shortDate } from "../lib/dates";
import type { Dataset, Plan } from "../lib/types";

/** Long-stay candidates compared month by month: climate comfort and pet clinics nearby. */
export function SojournTab({ plan, data, onOpenStop }: { plan: Plan; data: Dataset; onOpenStop: (id: string) => void }) {
  const [month, setMonth] = useState<number | null>(null);
  const visits = useMemo(() => {
    const m = new Map<string, { date: string; nights: number; sojourn: boolean }>();
    for (const s of plan.stops) if (!m.has(s.node.id)) m.set(s.node.id, { date: s.date, nights: s.nights, sojourn: s.sojourn });
    return m;
  }, [plan]);
  const bases = data.nodes.filter((n) => n.base && data.climate[n.id]);
  const rows = [...bases].sort((a, b) => {
    if (!month) return 0;
    return comfortScore(data.climate[b.id][month - 1]) - comfortScore(data.climate[a.id][month - 1]);
  });
  return (
    <div className="sojourn-tab">
      <h2 className="sec-title">旅居地对比</h2>
      <p className="sub">
        {bases.length} 个适合住一两周以上的地方。颜色越深代表那个月越舒服（按近年逐日气象的月平均计算：47 处为 2016–2025 年，其余为 2022–2025 年，来自 Open-Meteo），框出的月份是你的行程会在那里的时候。
        点月份按当月舒适度排序，点地名看详情。
      </p>
      <div className="tablewrap">
        <table className="t heat">
          <thead>
            <tr>
              <th>地方</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className="m">
                  <button type="button" className="link" aria-pressed={month === i + 1} onClick={() => setMonth(month === i + 1 ? null : i + 1)}>{i + 1}月</button>
                </th>
              ))}
              <th className="r">可带宠物酒店</th>
              <th className="r">宠物餐厅狗咖</th>
              <th className="r">宠物医院</th>
              <th>行程中</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const v = visits.get(n.id);
              const vm = v ? monthOf(v.date) : null;
              const pet = data.pet[n.id];
              return (
                <tr key={n.id}>
                  <td><button type="button" className="link" onClick={() => onOpenStop(n.id)}>{n.n}</button><div className="muted small">{n.p}</div></td>
                  {data.climate[n.id].map((m, i) => {
                    const s = comfortScore(m);
                    return (
                      <td key={i} className={`hc${vm === i + 1 ? " here" : ""}`} style={{ ["--s" as string]: String(s) }}
                        title={`${n.n} ${i + 1} 月：${Math.round(m[1])}–${Math.round(m[0])}°C，湿度 ${m[2]}%，雨天约 ${m[3]} 天`}>
                        <span className="num">{Math.round((m[0] + m[1]) / 2)}°</span>
                      </td>
                    );
                  })}
                  <td className="r">{pet ? pet.hotels.count : "—"}</td>
                  <td className="r">{pet ? pet.dining.count : "—"}</td>
                  <td className="r">{pet ? pet.vets.count : "—"}</td>
                  <td className="small">{v ? `${shortDate(v.date).split(" ")[0]}${v.sojourn ? " 旅居" : ""}` : <span className="muted">未经过</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">格子里是当月日均气温。酒店、餐厅、宠物医院为高德地图 15 公里内的关键词检索数量，用于比较各地带狗的方便程度，具体能否带狗、接受多大的狗要逐一确认。</p>
    </div>
  );
}
