import { useEffect, useMemo, useRef, useState } from "react";
import { wgsToGcj } from "../lib/coords";
import { shortDate } from "../lib/dates";
import { buildShortTrip, defaultShortTrip, loadShortTrip, MAX_WAYPOINTS, SHORT_TRIP_KEY, shortTripGpx, shortTripMarkdown, tripPairs,
  type ShortTripInput, type ShortTripPlan, type TripDrive } from "../lib/shortTrip";
import { abortable, GENERATION_TIMEOUT_MS, queryShortTrip, tripErrorMessage } from "../lib/shortTripAmap";
import { AMAP_ENABLED, loadAMap } from "./amapLoader";
import { Choice, NumOpt, Stepper, Toggle } from "./Fields";
import { ShortTripMap } from "./ShortTripMap";
import { TripPlacePicker } from "./TripPlacePicker";

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function navigation(l: TripDrive): string {
  const from = wgsToGcj(...l.from.ll), to = wgsToGcj(...l.to.ll);
  const q = new URLSearchParams({ from: `${from.join(",")},${l.from.name}`, to: `${to.join(",")},${l.to.name}`, mode: "car", coordinate: "gaode", callnative: "1" });
  return `https://uri.amap.com/navigation?${q}`;
}
type Tab = "route" | "days" | "prep";
export function ShortTrip({ today, onClose }: { today: string; onClose: () => void }) {
  const saved = useMemo(() => loadShortTrip(() => localStorage.getItem(SHORT_TRIP_KEY)), []);
  const [input, setInput] = useState(saved.input ?? defaultShortTrip(today));
  const [waypoints, setWaypoints] = useState<{ id: number; place: ShortTripInput["destination"] }[]>(() => (saved.input?.waypoints ?? []).map((place, id) => ({ id, place })));
  const nextWaypoint = useRef(waypoints.length);
  const [plan, setPlan] = useState<ShortTripPlan | null>(null);
  const [editing, setEditing] = useState(true);
  const [tab, setTab] = useState<Tab>("route");
  const [error, setError] = useState<string | null>(saved.error);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { const request = pending.current; pending.current = null; request?.abort(); }, []);
  const change = <K extends keyof ShortTripInput>(key: K, value: ShortTripInput[K]) => {
    setInput((p) => ({ ...p, [key]: value })); setPlan(null); setError(null);
  };
  const setVia = (next: typeof waypoints) => { setWaypoints(next); setPlan(null); setError(null); };
  const generate = async () => {
    setError(null); setPlan(null); setStorageError(null);
    const next = { ...input, waypoints: waypoints.map((p) => p.place).filter((p): p is NonNullable<typeof p> => p !== null) };
    try {
      if (waypoints.some((p) => p.place === null)) throw new Error("请搜索并选择每一个途经点，或移除空的途经点。" );
      tripPairs(next);
      if (!AMAP_ENABLED) throw new Error("未配置高德地图 Key，暂时无法搜索地点或生成短途驾车路线。" );
    } catch (e) { setError(tripErrorMessage(e)); return; }
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    setBusy(true); setProgress("正在加载高德并计算路线…");
    try {
      const AMap = await abortable((resolve, reject) => { loadAMap(["AMap.Driving"]).then(resolve, reject); }, controller.signal);
      const legs = await queryShortTrip(AMap, next, controller.signal, (done, total) => setProgress(`已计算 ${done} / ${total} 个路段`));
      if (pending.current !== controller || controller.signal.aborted) return;
      const result = buildShortTrip(next, legs);
      setPlan(result); setInput(next); setEditing(false); setTab("route");
      try { localStorage.setItem(SHORT_TRIP_KEY, JSON.stringify(next)); }
      catch { setStorageError("浏览器无法保存短途条件，请导出路书留存。" ); }
      window.scrollTo({ top: 0 });
    } catch (e) { if (pending.current === controller) setError(tripErrorMessage(e)); }
    finally { clearTimeout(timer); if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };
  return <div className="app short-trip">
    <header className="topbar">
      <div className="topbar-row">
        <button type="button" className="brand short-brand" onClick={onClose}>万里路书</button>
        <p className="summary">自定义短途自驾{plan && <><span>{plan.input.days} 天 · {plan.input.roundTrip ? "往返" : "单程"}</span><span>{Math.round(plan.km)} km</span></>}</p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>返回全国路书</button>
          {plan && !editing && <button type="button" className="btn" onClick={() => setEditing(true)}>调整条件</button>}
        </div>
      </div>
      {plan && !editing && <nav className="tabs" aria-label="短途页签">{([["route", "路线"], ["days", "每日行程"], ["prep", "费用与准备"]] as const).map(([key, label]) =>
        <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>}
    </header>
    <main className="content">
      {editing ? <section className="short-form card">
        <h1>这次，去哪里？</h1>
        <p className="muted">从周末往返到多日自驾，选择自己的起终点。路书按真实驾车路线和每日驾驶上限安排。</p>
        {!AMAP_ENABLED && <p className="err" role="status">未配置高德地图 Key，暂时无法搜索地点或生成短途驾车路线。</p>}
        <form onSubmit={(e) => { e.preventDefault(); void generate(); }}>
          <fieldset disabled={busy}>
            <div className="row2">
              <TripPlacePicker id="short-origin" label="出发点" value={input.origin} onChange={(v) => change("origin", v)} />
              <TripPlacePicker id="short-destination" label="目的地" value={input.destination} onChange={(v) => change("destination", v)} />
            </div>
            <details className="short-options" open={waypoints.length > 0}>
              <summary>途经点（按到访顺序，可选）</summary>
              {waypoints.map((p, i) => <div className="short-waypoint" key={p.id}>
                <TripPlacePicker id={`short-via-${p.id}`} label={`途经点 ${i + 1}`} value={p.place} onChange={(v) => setVia(waypoints.map((x, j) => j === i ? { ...x, place: v } : x))} />
                <button type="button" className="btn ghost" onClick={() => setVia(waypoints.filter((_, j) => j !== i))}>移除途经点 {i + 1}</button>
              </div>)}
              <button type="button" className="btn ghost" disabled={waypoints.length >= MAX_WAYPOINTS} onClick={() => setVia([...waypoints, { id: nextWaypoint.current++, place: null }])}>＋ 添加途经点</button>
              <p className="hint">最多 {MAX_WAYPOINTS} 个，只在去程到访；返程从目的地直接回到出发点。途经游览时间需另留。</p>
            </details>
            <div className="row2">
              <div className="field"><label htmlFor="short-date">出发日期</label><input id="short-date" type="date" required value={input.startDate} onChange={(e) => change("startDate", e.target.value)} /></div>
              <div className="field"><label htmlFor="short-days">总天数（包含出发和返程日）</label><input id="short-days" type="number" min={1} max={30} required value={input.days} onChange={(e) => change("days", Number(e.target.value))} /></div>
            </div>
            <Choice label="行程方式" value={input.roundTrip ? "return" : "oneWay"} options={[["return", "往返"], ["oneWay", "单程"]]} onChange={(v) => change("roundTrip", v === "return")} />
            <div className="row2">
              <div className="field"><label htmlFor="short-hours">每天最多驾驶几小时（纯驾驶）</label><input id="short-hours" type="number" min={1} max={12} step={0.5} required value={input.maxDriveHours} onChange={(e) => change("maxDriveHours", Number(e.target.value))} /></div>
              <Choice label="选路偏好" value={input.policy} options={[["fastest", "时间优先"], ["leastFee", "少收费"], ["shortest", "距离优先"]]} onChange={(v) => change("policy", v)} />
            </div>
            <details className="short-options"><summary>同行与其他要求</summary>
              <div className="row2"><Stepper id="short-adults" label="成人" value={input.adults} min={1} max={20} onChange={(v) => change("adults", v)} /><Stepper id="short-kids" label="儿童" value={input.kids} max={20} onChange={(v) => change("kids", v)} /></div>
              <Toggle id="short-dog" label="带狗同行" checked={input.dog} onChange={(v) => change("dog", v)} />
              <div className="field"><label htmlFor="short-notes">其他要求与旅行备注</label><textarea id="short-notes" rows={4} maxLength={2000} value={input.notes} onChange={(e) => change("notes", e.target.value)} placeholder="例如喜欢自然风景、带老人、住宿需要停车位。备注会写入路书，暂不自动理解或推荐景点。" /></div>
            </details>
            <details className="short-options"><summary>预算与费用（可选，按自己了解的价格填写）</summary>
              <div className="row2">
                <NumOpt id="short-budget" label="这次的总预算" unit="元" value={input.budget} onChange={(v) => change("budget", v)} />
                <NumOpt id="short-hotel" label="同行所有人的住宿，每晚合计" unit="元" value={input.hotelPerNight} onChange={(v) => change("hotelPerNight", v)} />
                <NumOpt id="short-food" label="同行所有人的餐饮，每天合计" unit="元" value={input.foodPerDay} onChange={(v) => change("foodPerDay", v)} />
                <NumOpt id="short-energy" label="车辆能源，每公里" unit="元" step={0.01} value={input.energyPerKm} onChange={(v) => change("energyPerKm", v)} />
              </div><p className="hint">不提供默认价格；未填写的项目不计入小计，过路费取高德估算。住宿按总天数减一晚计算。</p>
            </details>
            <button type="submit" className="btn big" disabled={!AMAP_ENABLED}>生成短途路书</button>
          </fieldset>
        </form>
        {busy && <p role="status">{progress}</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </section> : plan && <>
        {storageError && <p className="err" role="status">{storageError}</p>}
        <div className="short-result-heading"><div><h1>{plan.input.origin!.name} → {plan.input.destination!.name}</h1><p className="muted">{plan.input.startDate} 出发 · 纯驾驶约 {plan.h.toFixed(1)} 小时 · {plan.input.adults} 成人 / {plan.input.kids} 儿童{plan.input.dog ? " · 带狗" : ""}</p></div>
          <details className="menu"><summary className="btn ghost">导出路书</summary><div className="menu-pop">
            <button type="button" onClick={() => download(`短途路书-${plan.input.startDate}.md`, shortTripMarkdown(plan), "text/markdown;charset=utf-8")}>导出 Markdown</button>
            <button type="button" onClick={() => download(`短途路书-${plan.input.startDate}.gpx`, shortTripGpx(plan), "application/gpx+xml")}>导出 GPX</button>
            <button type="button" onClick={() => window.print()}>打印路书</button>
          </div></details>
        </div>
        <section hidden={tab !== "route"} className="short-route-section">
          {tab === "route" && <ShortTripMap plan={plan} />}
          <div className="card"><h2>按顺序出发</h2><ol className="short-legs">{plan.legs.map((l, i) => <li key={i}>
            <div><b>{l.from.name} → {l.to.name}</b><p className="small muted">{plan.input.roundTrip && i === plan.legs.length - 1 ? "返程 · " : ""}{l.km.toFixed(1)} km · 约 {l.h.toFixed(1)} 小时 · 过路费{l.toll === null ? "未知" : `约 ¥${l.toll}`}</p></div>
            <a className="btn ghost" href={navigation(l)} target="_blank" rel="noreferrer">高德导航</a>
          </li>)}</ol><p className="hint">地图与里程来自高德驾车查询，实际出行请以当天导航和道路情况为准。</p></div>
        </section>
        <section hidden={tab !== "days"} className="short-days-section"><h2>每日行程</h2>
          {plan.days.map((d, i) => <article className="card short-day" key={d.date}><h3>第 {i + 1} 天 · {shortDate(d.date)}</h3>
            {d.destinationStay ? <p>在{plan.input.destination!.name}自由安排，景点及预约待确认。</p> : <ul>{d.drives.map((l, j) => <li key={j}>{l.from} → {l.to}<p className="small muted">{l.km.toFixed(1)} km{l.partial ? "（拆天估算）" : ""} · 驾驶约 {l.h.toFixed(1)} 小时</p></li>)}</ul>}
            <p className="small">当日驾驶合计 {d.drives.reduce((s, l) => s + l.h, 0).toFixed(1)} 小时{d.overnight ? ` · 住宿区域：${d.overnight}，具体住宿待选` : plan.input.roundTrip ? " · 回到出发点，行程结束" : " · 行程结束"}</p>
          </article>)}
        </section>
        <section hidden={tab !== "prep"} className="short-prep-section">
          <div className="card"><h2>费用小计（估算）</h2><p className="num short-subtotal">¥{plan.subtotal.toFixed(0)}</p><p>尚未计入：{plan.missingCosts.join("、")}。</p><p className="hint">能源、住宿和餐饮按你填写的价格估算；住宿为 {plan.input.days - 1} 晚、餐饮为 {plan.input.days} 天，过路费取高德结果。当地报价需自行确认。</p>{plan.input.budget !== null && <p>总预算：¥{plan.input.budget}</p>}</div>
          <div className="card"><h2>出发准备</h2><ul>{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
          <div className="card"><h2>其他要求（备注）</h2><p className="short-notes">{plan.input.notes || "未填写"}</p><p className="hint">备注未自动转成路线约束；需要落实的地点请加入途经点，其他要求需出发前确认。</p></div>
        </section>
      </>}
    </main>
  </div>;
}
