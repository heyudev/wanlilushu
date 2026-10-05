import { shortDate } from "../lib/dates";
import { km } from "../lib/format";
import type { Dataset, Plan, PlanInput } from "../lib/types";
import { Elevation } from "./Elevation";
import { AmapView } from "./AmapView";
import { segmentRuns } from "./segments";

export function RouteTab({ plan, data, selectedSeg, onSelectSeg, onOpenStop, criticalCount, onShowPrep, set }: {
  plan: Plan; data: Dataset; selectedSeg: string | null; onSelectSeg: (k: string | null) => void;
  onOpenStop: (i: number) => void; criticalCount: number; onShowPrep: () => void;
  set: <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => void;
}) {
  const passThrough = (k: string, on: boolean) =>
    set("skipSegs", on ? [...plan.input.skipSegs, k] : plan.input.skipSegs.filter((x) => x !== k));
  const segs = new Map(data.segs.map((s) => [s.k, s]));
  const runs = segmentRuns(plan);
  return (
    <div className="route-tab">
      {criticalCount > 0 && (
        <button type="button" className="banner crit" onClick={onShowPrep}>
          <b>!</b> {criticalCount} 条提醒会影响行程能否走通（边境证、季节性道路等），点这里查看
        </button>
      )}
      <div className="route-grid">
        <div className="route-map">
          <AmapView plan={plan} data={data} selectedSeg={selectedSeg}
            onSelectStop={(id) => onOpenStop(plan.stops.findIndex((s) => s.node.id === id))} onSelectSeg={onSelectSeg} />
        </div>
        <aside className="seg-panel" aria-label="分段">
          <div className="seg-panel-head">
            <h2>{runs.length} 段路线</h2>
            {selectedSeg && <button type="button" className="link" onClick={() => onSelectSeg(null)}>显示全部</button>}
          </div>
          <ol className="seg-list">
            {runs.map((r) => {
              const s = segs.get(r.k);
              const open = selectedSeg === r.k;
              return (
                <li key={r.k + r.items[0].index} className={open ? "open" : ""}>
                  <button type="button" className="seg-row" aria-expanded={open} onClick={() => onSelectSeg(open ? null : r.k)}>
                    <span className="shield">{r.k}</span>
                    <span className="seg-name"><b>{s?.name}</b><span className="muted small">{shortDate(r.items[0].stop.date)} 起 · {r.nights} 晚 · {km(r.km)}</span></span>
                    <span className={`fit ${r.good === r.counted ? "good" : r.good * 2 >= r.counted ? "ok" : "off"}`} title="到达时当季的停留点">{r.good}/{r.counted}</span>
                  </button>
                  {open && (
                    <div className="seg-stops">
                      <p className="small muted">{s?.range} · 最佳季节：{s?.season}</p>
                      <label className="pass-through small">
                        <input type="checkbox" checked={plan.input.skipSegs.includes(r.k)} onChange={(e) => passThrough(r.k, e.target.checked)} />
                        这一段只开车经过，不停留（路线不变，途中按需过夜）
                      </label>
                      <ul>
                        {r.items.map(({ stop, index }) => (
                          <li key={index}>
                            <button type="button" className="stop-link" onClick={() => onOpenStop(index)}>
                              <span className="num muted">{shortDate(stop.date).split(" ")[0]}</span>
                              <span>{stop.node.n}{stop.transit && <span className="muted small">（途中过夜）</span>}</span>
                              <span className="muted small">{stop.nights} 晚</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="seg-panel-head"><h2>{data.roads.length} 条风景道</h2></div>
          <ul className="road-list">
            {data.roads.map((rd) => {
              const first = data.nodes.find((n) => n.id === rd.legs[0].split(">")[0]);
              return (
                <li key={rd.id}>
                  <button type="button" className="road-row" onClick={() => first && onSelectSeg(first.seg)}>
                    <b>{rd.name}</b>
                    <span className="muted small">{rd.about}</span>
                    <span className="small">最佳 {rd.best.join("/")} 月</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
      <Elevation plan={plan} data={data} />
    </div>
  );
}
