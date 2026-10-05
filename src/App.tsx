import { useCallback, useEffect, useMemo, useState } from "react";
import { AddPlace } from "./components/AddPlace";
import { Costs } from "./components/Costs";
import { DaysTab } from "./components/DaysTab";
import { Drawer } from "./components/Drawer";
import { PrepTab } from "./components/PrepTab";
import { RouteTab } from "./components/RouteTab";
import { SearchBox } from "./components/SearchBox";
import { SojournTab } from "./components/SojournTab";
import { StopDetail } from "./components/StopDetail";
import { TripSettings } from "./components/TripSettings";
import { Welcome } from "./components/Welcome";
import { applyCustomStops } from "./lib/custom";
import { loadDataset } from "./lib/data";
import { dateRange, formatDate } from "./lib/dates";
import { DEFAULT_INPUT } from "./lib/defaults";
import { duration, int, yuanShort } from "./lib/format";
import { planToGpx } from "./lib/gpx";
import { loadTransferGeom } from "./lib/transferGeom";
import { planToMarkdown } from "./lib/markdown";
import { buildPlan, costTotal } from "./lib/plan";
import { decodePlan, encodePlan, SHARE_PARAM } from "./lib/share";
import type { CustomStop, PlanInput } from "./lib/types";

const baseData = loadDataset();
// v2: food and lodging prices are no longer guessed defaults, so settings saved by v1 are dropped
const KEY = "wanlilushu.input.v2";

type Tab = "route" | "days" | "stay" | "costs" | "prep";
const TABS: [Tab, string][] = [["route", "路线"], ["days", "行程"], ["stay", "旅居"], ["costs", "费用"], ["prep", "出发准备"]];

function loadSaved(): PlanInput | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved ? { ...DEFAULT_INPUT, ...saved } : null;
  } catch {
    return null;
  }
}

function tabFromHash(): Tab {
  const h = location.hash.slice(1);
  return (TABS.find(([t]) => t === h)?.[0]) ?? "route";
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function App() {
  const saved = useMemo(loadSaved, []);
  const [input, setInput] = useState<PlanInput>(saved ?? DEFAULT_INPUT);
  const [started, setStarted] = useState(saved != null);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [selectedSeg, setSelectedSeg] = useState<string | null>(null);
  const [openStop, setOpenStop] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addAfter, setAddAfter] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const data = useMemo(() => applyCustomStops(baseData, input.custom), [input.custom]);
  const plan = useMemo(() => buildPlan(data, input), [data, input]);
  const today = useMemo(() => formatDate(Date.now()), []);

  // a shared link (?plan=…) opens that plan once, then the address bar is cleaned
  useEffect(() => {
    const code = new URLSearchParams(location.search).get(SHARE_PARAM);
    if (!code) return;
    decodePlan(code).then((shared) => {
      if (shared) { setInput(shared); setStarted(true); setNotice("已打开分享的路书。改动只保存在你自己的浏览器里。"); }
      else setNotice("分享链接已损坏，打开的是你自己的路书。");
      history.replaceState(null, "", location.pathname + location.hash);
    });
  }, []);

  useEffect(() => {
    if (!started) return;
    try { localStorage.setItem(KEY, JSON.stringify(input)); } catch { /* storage may be unavailable */ }
  }, [input, started]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const set = useCallback(<K extends keyof PlanInput>(k: K, v: PlanInput[K]) => setInput((p) => ({ ...p, [k]: v })), []);
  const setAll = useCallback((next: PlanInput) => setInput(next), []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); window.scrollTo({ top: 0 }); };
  // on the loop the final stop is the arrival back at the entry, not a stay to open
  const lastIdx = plan.stops.length - (plan.loop ? 2 : 1);
  const openStopAt = (i: number) => { if (i >= 0) setOpenStop(Math.min(i, lastIdx)); };
  const openStopById = (id: string) => {
    const i = plan.stops.findIndex((s) => s.node.id === id);
    if (i >= 0) openStopAt(i);
    else setNotice("这个地方不在当前行程里（被跳过、整段不去或只途经，或被节奏省略）。可以在“调整条件”里恢复。");
  };
  const closeStop = useCallback(() => setOpenStop(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const share = async () => {
    const url = `${location.origin}${location.pathname}?${SHARE_PARAM}=${await encodePlan(input)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("分享链接已复制。对方打开后看到的是同一份路书。");
    } catch {
      setShareUrl(url);
    }
  };
  const stamp = `${plan.start.name}-${plan.input.startDate}`;
  const addCustom = (c: CustomStop) => { setInput((p) => ({ ...p, custom: [...p.custom, c] })); setAddAfter(null); setNotice(`已把「${c.name}」加入行程。`); };

  if (!started) {
    return <Welcome input={input} set={set} setAll={setAll} data={data} today={today} onStart={() => { setStarted(true); go("route"); }} />;
  }

  const total = costTotal(plan.costs);
  const critical = plan.warnings.filter((w) => w.level === "critical").length;
  const stop = openStop != null ? plan.stops[openStop] : null;
  const parts = [
    plan.totals.waitDays ? `等季节 ${plan.totals.waitDays} 天` : "",
    plan.totals.sojournNights ? `旅居 ${plan.totals.sojournNights} 天` : "",
    plan.totals.breakDays ? `回家 ${plan.totals.breakDays} 天` : "",
  ].filter(Boolean);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <a className="brand" href="#route" onClick={(e) => { e.preventDefault(); go("route"); }}><span className="seal" aria-hidden="true"><i>路</i><i>万</i><i>书</i><i>里</i></span>万里路书</a>
          <p className="summary">
            <span>{plan.start.name}出发</span>
            <span className="num">{dateRange(plan.input.startDate, plan.endDate)}</span>
            <span className="num" title={parts.join("，")}>{duration(plan.days)}{parts.length > 0 && <span className="muted">（其中{parts.join("、")}）</span>}</span>
            <span className="num">{int(plan.totals.km + plan.totals.localKm)} km</span>
            <span className="num">
              {yuanShort(total)}
              {plan.uncosted.includes("hotel") && <a className="missing-link" href="#costs" onClick={(e) => { e.preventDefault(); go("costs"); }}>（未含住宿，去填写）</a>}
            </span>
          </p>
          <SearchBox data={data} onPick={openStopById} />
          <div className="actions">
            <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>调整条件</button>
            <details className="menu">
              <summary className="btn ghost">分享与导出</summary>
              <div className="menu-pop">
                <button type="button" onClick={share}>复制分享链接</button>
                <button type="button" onClick={() => download(`万里路书-${stamp}.md`, planToMarkdown(plan, data), "text/markdown;charset=utf-8")}>导出 Markdown（笔记）</button>
                <button type="button" onClick={async () => download(`万里路书-${stamp}.gpx`, planToGpx(plan, data, plan.legs.some((l) => l.parts.some((p) => "transfer" in p)) ? await loadTransferGeom() : {}), "application/gpx+xml")}>导出 GPX（导航、轨迹软件）</button>
              </div>
            </details>
          </div>
        </div>
        <nav className="tabs" aria-label="页签">
          {TABS.map(([t, label]) => (
            <a key={t} href={`#${t}`} aria-current={tab === t ? "page" : undefined} onClick={(e) => { e.preventDefault(); go(t); }}>
              {label}{t === "prep" && critical > 0 && <span className="badge" aria-label={`${critical} 条严重提醒`}>{critical}</span>}
            </a>
          ))}
        </nav>
      </header>

      {notice && <div className="toast" role="status">{notice}</div>}

      <main className="content">
        {tab === "route" && (
          <RouteTab plan={plan} data={data} selectedSeg={selectedSeg} onSelectSeg={setSelectedSeg}
            onOpenStop={openStopAt} criticalCount={critical} onShowPrep={() => go("prep")} set={set} />
        )}
        {tab === "days" && <DaysTab plan={plan} data={data} onOpenStop={openStopAt} />}
        {tab === "stay" && <SojournTab plan={plan} data={data} onOpenStop={openStopById} />}
        {tab === "costs" && <Costs plan={plan} data={data} set={set} setAll={setAll} />}
        {tab === "prep" && <PrepTab plan={plan} data={data} onOpenStop={openStopById} />}
      </main>

      {stop && openStop != null && (
        <Drawer title={stop.node.n} onClose={closeStop}
          footer={
            <div className="pager">
              <button type="button" className="btn ghost" disabled={openStop <= 0} onClick={() => setOpenStop(openStop - 1)}>← 上一站</button>
              <span className="muted small num">{openStop + 1} / {lastIdx + 1}</span>
              <button type="button" className="btn ghost" disabled={openStop >= lastIdx} onClick={() => setOpenStop(openStop + 1)}>下一站 →</button>
            </div>
          }>
          <StopDetail s={stop} plan={plan} data={data} set={set}
            onAddAfter={(id) => { setOpenStop(null); setAddAfter(id); }}
            onSkipped={(name) => { setOpenStop(null); setNotice(`已跳过「${name}」，路线仍会经过那里。`); }} />
        </Drawer>
      )}

      {addAfter && (
        <Drawer title="加入一个地方" onClose={() => setAddAfter(null)}>
          <AddPlace data={data} afterId={addAfter} onAdd={addCustom} />
        </Drawer>
      )}

      {shareUrl && (
        <Drawer title="分享链接" onClose={() => setShareUrl(null)}>
          <p className="small">浏览器不允许自动复制，请手动复制下面的链接：</p>
          <textarea className="share-text" readOnly value={shareUrl} onFocus={(e) => e.target.select()} rows={6} />
        </Drawer>
      )}

      {settingsOpen && (
        <Drawer title="调整条件" onClose={closeSettings} wide
          footer={
            <div className="pager">
              <button type="button" className="btn ghost" onClick={() => setInput(DEFAULT_INPUT)}>恢复默认</button>
              <button type="button" className="btn ghost" onClick={() => { setSettingsOpen(false); setStarted(false); }}>回到首页</button>
              <button type="button" className="btn" onClick={closeSettings}>完成</button>
            </div>
          }>
          <TripSettings input={input} set={set} setAll={setAll} data={data} today={today} />
        </Drawer>
      )}
    </div>
  );
}
