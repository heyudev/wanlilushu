import { costTotal, TRANSFER_SEG } from "../lib/plan";
import { int, yuan, yuanShort } from "../lib/format";
import type { CostBreakdown, Dataset, Plan, PlanInput } from "../lib/types";
import { CostParams, EatSleepParams, type SetInput } from "./TripSettings";
import { BudgetPanel } from "./BudgetPanel";

export const COST_META: Record<keyof CostBreakdown, { label: string; basis: (p: Plan) => string }> = {
  lodging: { label: "住宿", basis: (p) => `${p.input.lodging === "comfort" ? "全程酒店" : p.input.lodging === "balanced" ? "城市住酒店、营地型目的地露营" : "能车宿就车宿"}；酒店按你填的 ${p.input.hotelPerRoom == null ? "（未填）" : `¥${p.input.hotelPerRoom}`}/间/晚${p.input.localPrice ? "，再乘各地物价指数（当地餐厅人均 ÷ 全线中位数，限 0.5–2 倍）" : ""}；营地 ${p.input.campPerNight == null ? "（未填）" : `¥${p.input.campPerNight}/晚`}；住满 4 周按月租 ${p.input.rentPerMonth == null ? "（未填，按酒店价）" : `¥${p.input.rentPerMonth}`}；海拔 3500m 以上一律住酒店` },
  food: { label: "餐饮", basis: (p) => p.input.foodMode === "manual"
    ? `每人每顿 ${p.input.foodPerMeal == null ? "（未填）" : `¥${p.input.foodPerMeal}`} × 每天 ${p.input.meals} 顿${p.input.localPrice ? "，按各地物价折算" : ""}；儿童按 0.6 人`
    : `每天 ${p.input.meals} 顿：一顿正餐${p.input.meals > 1 ? ` + ${p.input.meals - 1} 顿快餐` : ""}，单价取每站 5 公里内热门餐厅人均（高德地图）的${p.input.foodTier === "budget" ? "低四分位" : p.input.foodTier === "nice" ? "高四分位" : "中位数"}；数据不足的地方用最近一站的价格；儿童按 0.6 人` },
  tickets: { label: "门票", basis: () => "已核查景点的门票 + 必乘交通（观光车等）；4–10 月按旺季价；儿童按半价估算；未核实票价不计入" },
  fuel: { label: "燃油", basis: (p) => `${p.input.lPer100} L/100km；92# 按各省 2026-09-24 调价后限价${p.input.fuelPrice != null ? `（已改为统一 ¥${p.input.fuelPrice}/L）` : ""}` },
  toll: { label: "过路费", basis: (p) => `高速里程 × ¥${p.input.tollPerKm}/km（一类客车，各省 0.4–0.6 不等）；未扣节假日免费` },
  electricity: { label: "充电", basis: (p) => p.input.vehicle === "phev" ? `纯电续航 ${p.input.evRangeKm}km × 各段充电便利度；${p.input.kwhPer100} kWh/100km；¥${p.input.elecPrice}/kWh` : "非插电车型，不计" },
  dog: { label: "狗狗", basis: (p) => p.input.dog ? `¥${p.input.dogPerDay}/天口粮${p.input.dogCare === "boarding" || p.input.adults < 2 ? `；禁宠景区日寄养 ¥${p.input.boardingPerDay}/天` : "；禁宠景区轮流陪护不计费"}；坐飞机回家期间寄养` : "不带狗" },
  maintenance: { label: "保养", basis: (p) => `每 1 万公里 ¥${p.input.maintenancePer10k}` },
  misc: { label: "停车杂费", basis: (p) => `¥${p.input.miscPerDay}/天` },
  ferry: { label: "轮渡", basis: () => "渤海轮渡 大连→烟台（车 + 随车人员）" },
  home: { label: "回家往返", basis: (p) => `飞回：机票 ¥${p.input.flightPerPerson}/人/单程估算 + 停车 ¥${p.input.parkingPerDay}/天；开回：直线距离 × 1.25 估算里程，油电与过路费另算` },
};

export function Costs({ plan, data, set, setAll }: { plan: Plan; data: Dataset; set: SetInput; setAll: (next: PlanInput) => void }) {
  const total = costTotal(plan.costs);
  const people = plan.input.adults + plan.input.kids;
  const rows = (Object.keys(COST_META) as (keyof CostBreakdown)[])
    .map((k) => ({ k, v: plan.costs[k] }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v);
  const max = Math.max(...rows.map((r) => r.v), 1);
  // segments in travel order, then the connecting drives between them
  const segs = [
    ...plan.order.map((u) => data.segs.find((s) => s.k === u.seg)).filter((s) => s && plan.costBySeg[s.k]).map((s) => ({ s: s!, c: plan.costBySeg[s!.k] })),
    ...(plan.costBySeg[TRANSFER_SEG] ? [{ s: { k: "→", name: "转场", range: "", season: "" }, c: plan.costBySeg[TRANSFER_SEG] }] : []),
  ];
  const segMax = Math.max(...segs.map((x) => x.c.cost), 1);
  return (
    <div>
      <div className={`card eat-sleep-card${plan.uncosted.length ? " missing" : ""}`}>
        <h2 className="sec-title">吃和住 <span className="muted small">这两项决定了总花费的大部分</span></h2>
        {plan.uncosted.length > 0 && (
          <p className="es-missing">
            还没计入：{plan.uncosted.map((u) => ({ hotel: "住宿（请填每晚均价）", camp: "露营（请填营地价）", food: "餐饮（请填每顿多少钱）" }[u])).join("、")}
          </p>
        )}
        <EatSleepParams input={plan.input} set={set} plan={plan} />
      </div>
      <BudgetPanel plan={plan} data={data} set={set} setAll={setAll} />
      <div className="hero">
        <div><div className="v">{yuanShort(total)}</div><div className="k">预估总花费</div></div>
        {/* days at home are not travel days: averaging over them would understate the cost on the road */}
        <div><div className="v">{yuan(total / Math.max(1, plan.totals.tripDays))}</div><div className="k">在路上平均每天</div></div>
        <div><div className="v">{yuan((total / Math.max(1, plan.totals.tripDays)) * 30.44)}</div><div className="k">在路上平均每月</div></div>
        <div><div className="v">{yuan(total / Math.max(1, people))}</div><div className="k">人均（{people} 人）</div></div>
        <div><div className="v">{yuan((plan.costs.fuel + plan.costs.electricity) / Math.max(1, (plan.totals.km + plan.totals.localKm) / 100))}</div><div className="k">每百公里能耗</div></div>
      </div>
      <div className="costgrid">
        <div className="card">
          <h3>按类别</h3>
          <div className="bars">
            {rows.map((r) => (
              <div className="bar" key={r.k} title={COST_META[r.k].basis(plan)}>
                <span>{COST_META[r.k].label}</span>
                <span className="track"><span className="fill" style={{ width: `${(r.v / max) * 100}%`, display: "block" }} /></span>
                <span className="val">{yuan(r.v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>按分段（行驶 + 住宿 + 门票）</h3>
          <div className="bars">
            {segs.map(({ s, c }) => (
              <div className="bar" key={s.k} title={`${s.name}｜${int(c.km)} km｜${c.days} 晚`}>
                <span><b className="num">{s.k}</b> {s.name}</span>
                <span className="track"><span className="fill" style={{ width: `${(c.cost / segMax) * 100}%`, display: "block" }} /></span>
                <span className="val">{yuan(c.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3>其他单价</h3>
        <CostParams input={plan.input} set={set} data={data} />
      </div>
      <details className="card tablewrap fold" style={{ marginTop: 16 }}>
        <summary><h3>每一项怎么算的</h3></summary>
        <table className="t">
          <thead><tr><th>项目</th><th className="r">金额</th><th className="r">占比</th><th>怎么算的</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <td>{COST_META[r.k].label}</td>
                <td className="r">{yuan(r.v)}</td>
                <td className="r">{((r.v / total) * 100).toFixed(1)}%</td>
                <td>{COST_META[r.k].basis(plan)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">不含：车辆购置与年度保险、罚款、购物与纪念品、意外维修。</p>
      </details>
    </div>
  );
}
