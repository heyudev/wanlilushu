import { useMemo, useState } from "react";
import { monthlyView } from "../lib/calendar";
import { shortDate, shortDateFrom } from "../lib/dates";
import { hours, km, yuan } from "../lib/format";
import { SEASON_LABEL } from "../lib/season";
import type { Dataset, Plan } from "../lib/types";
import { segmentRuns, roadsLookup } from "./segments";
import { SLEEP_LABEL } from "./StopDetail";

function MonthView({ plan, onOpenStop }: { plan: Plan; onOpenStop: (i: number) => void }) {
  const months = useMemo(() => monthlyView(plan), [plan]);
  return (
    <div className="months-grid">
      {months.map((m) => {
        const [y, mo] = m.month.split("-");
        return (
          <section key={m.month} className="month-card">
            <header>
              <h3><span className="num">{Number(mo)}</span> 月<span className="muted small"> {y}</span></h3>
              <span className="num small muted">{km(m.km)} · {yuan(m.cost)}</span>
            </header>
            <ul>
              {m.runs.map((r) => {
                if (r.label) {
                  return (
                    <li key={`${r.label}-${r.from}`} className="mv-gap">
                      <span className="num muted">{Number(r.from.slice(8))}{r.days > 1 ? `–${Number(r.to.slice(8))}` : ""}日</span>
                      <span className="muted">{r.label}</span>
                    </li>
                  );
                }
                const s = plan.stops[r.stopIdx];
                return (
                  <li key={`${r.stopIdx}-${r.from}`}>
                    <button type="button" onClick={() => onOpenStop(r.stopIdx)}>
                      <span className="num muted">{Number(r.from.slice(8))}{r.days > 1 ? `–${Number(r.to.slice(8))}` : ""}日</span>
                      <span className="mv-name">{s.node.n.split(" · ")[0]}</span>
                      {s.sojourn ? <span className="chip sojourn">旅居</span> : s.waitDays > 0 ? <span className="chip ok">等季节</span> : s.comfortStay ? <span className="chip good">多住</span> : s.transit ? <span className="muted small">途中</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="hint">每月花费含当月的住宿、餐饮、门票和行车费用；保养、杂费等按全程计算的项目不分摊到月。</p>
    </div>
  );
}

export function DaysTab({ plan, data, onOpenStop }: { plan: Plan; data: Dataset; onOpenStop: (i: number) => void }) {
  const [view, setView] = useState<"list" | "month">(() => {
    try { return (localStorage.getItem("wanlilushu.daysView") as "list" | "month") || "list"; } catch { return "list"; }
  });
  const pickView = (v: "list" | "month") => { setView(v); try { localStorage.setItem("wanlilushu.daysView", v); } catch { /* optional */ } };
  const roadsOf = roadsLookup(data);
  const segs = new Map(data.segs.map((s) => [s.k, s]));
  const runs = segmentRuns(plan);
  const year = plan.input.startDate.slice(0, 4);
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const all = open.size === runs.length;
  const last = plan.stops[plan.stops.length - 1];
  const lastLeg = plan.legs[plan.legs.length - 1];
  const toggle_ = (
    <div className="seg-btns view-switch" role="group" aria-label="视图">
      <button type="button" aria-pressed={view === "list"} onClick={() => pickView("list")}>按站点</button>
      <button type="button" aria-pressed={view === "month"} onClick={() => pickView("month")}>按月</button>
    </div>
  );
  if (view === "month") return <div className="days-tab">{toggle_}<MonthView plan={plan} onOpenStop={onOpenStop} /></div>;
  return (
    <div className="days-tab">
      {toggle_}
      <div className="days-tools">
        {plan.loop
          ? plan.approach && <p className="small muted">{plan.input.startDate} 从{plan.start.name}出发，开 {km(plan.approach.km)} 到{plan.entry.n}进入环线，结束后原路返回。</p>
          : <p className="small muted">路线按季节安排：夏天去西部和北方，冬天在南方。{plan.input.startDate} 从{plan.start.name}出发{plan.approach ? `，开约 ${km(plan.approach.km)} 到${plan.entry.n}` : ""}。</p>}
        <button type="button" className="link" onClick={() => setOpen(all ? new Set() : new Set(runs.map((_, i) => i)))}>{all ? "全部收起" : "全部展开"}</button>
      </div>
      {runs.map((r, ri) => {
        const s = segs.get(r.k);
        const isOpen = open.has(ri);
        return (
          <section key={r.k + ri} className={`day-seg${isOpen ? " open" : ""}`}>
            <button type="button" className="day-seg-head" aria-expanded={isOpen} onClick={() => toggle(ri)}>
              <span className="shield">{r.k}</span>
              <span className="seg-name"><b>{s?.name}</b><span className="muted small">{s?.range}</span></span>
              <span className="num small">{shortDateFrom(r.items[0].stop.date, year)} 起 · {r.nights} 晚 · {km(r.km)}</span>
              <span className="chev" aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <ol className="day-list">
                {r.items.map(({ stop, leg, index }) => (
                  <li key={index}>
                    {leg && !leg.resume && (
                      <div className="leg-line small muted">
                        {leg.ferryKm > 0 ? "渤海轮渡（时长未公示，按估算）"
                          : leg.parts.some((p) => "transfer" in p)
                            ? `转场 ${km(leg.km)} · 约 ${hours(leg.h)}${leg.driveDays > 1 ? `，分 ${leg.driveDays} 天开，路上住 ${leg.driveDays - 1} 晚` : ""}${leg.parts.some((p) => "transfer" in p && p.estimated) ? "（无路网数据，按直线估算）" : ""}`
                            : `驾驶 ${km(leg.km)} · 约 ${hours(leg.h)}${leg.driveDays > 1 ? `，分 ${leg.driveDays} 天开，路上住 ${leg.driveDays - 1} 晚` : ""}`}
                        {leg.toll > 0 && ` · 过路费约 ${yuan(leg.toll)}`}
                        {leg.via.length > 0 && ` · 途经 ${leg.via.length} 处`}
                        {roadsOf(leg).map((r) => <span key={r.id} className="road-tag">{r.name}</span>)}
                        {leg.ferryKm === 0 && leg.h / Math.max(1, leg.driveDays) > plan.input.maxDriveHours && <span className="chip ok">长途日</span>}
                      </div>
                    )}
                    <button type="button" className="day-row" onClick={() => onOpenStop(index)}>
                      <span className="num date">{shortDate(stop.date)}</span>
                      {stop.node.img ? <img className="day-thumb" src={stop.node.img.src} alt="" loading="lazy" width={72} height={48} /> : <span className="day-thumb" />}
                      <span className="place">
                        <b>{stop.node.n}</b>
                        <span className="muted small">{stop.resumed ? "回家后回到这里，接着住" : stop.transit ? "途中过夜" : stop.node.food.slice(0, 2).map((f) => f[0]).join(" · ")}</span>
                      </span>
                      <span className="small">{stop.nights >= 14 ? `${Math.round(stop.nights / 7)} 周` : `${stop.nights} 晚`} · {SLEEP_LABEL[stop.sleep]}</span>
                      {stop.sojourn ? <span className="chip sojourn">旅居</span>
                        : stop.waitDays > 0 ? <span className="chip ok">等季节</span>
                        : stop.comfortStay ? <span className="chip good">多住</span>
                        : !stop.transit ? <span className={`chip ${stop.season}`}>{SEASON_LABEL[stop.season]}</span> : <span />}
                      <span className="num small cost">{yuan(stop.lodgingCost + stop.ticketCost)}</span>
                      <span className="chev" aria-hidden="true">›</span>
                    </button>
                    {plan.breaks.filter((b) => b.stopIdx === index).map((b) => (
                      <div key={b.date} className="break-line small">
                        {b.newYear ? `${shortDateFrom(b.date, year)} 回家过年，` : ""}{b.mode === "fly" ? "车停在这里，坐飞机" : "开车"}回家住 {b.days} 天
                        （单程约 {km(b.km)}{b.roadDays ? `，路上来回多花 ${b.roadDays} 天` : ""}，往返约 {yuan(b.cost)}{b.dogBoarding ? `；狗寄养 ${b.dogBoarding} 天` : ""}），之后从这里接着走
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
      {plan.loop
        ? <p className="small muted end-line">{shortDateFrom(last.date, year)} 开 {km(lastLeg.km)} 回到{last.node.n}，环线结束{plan.approach ? `，再开 ${km(plan.approach.km)} 回${plan.start.name}` : ""}。</p>
        : <p className="small muted end-line">{shortDateFrom(plan.endDate, year)} {plan.homeward ? `从${last.node.n}开约 ${km(plan.homeward.km)} 回到${plan.start.name}` : `回到${plan.start.name}`}，全程结束。</p>}
    </div>
  );
}
