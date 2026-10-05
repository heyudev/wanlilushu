// Zoomable AMap (高德) base map with the plan drawn in layers the viewer can switch on and off.
// Falls back to the SVG overview when no key is set or the AMap script cannot load.
// AMap ships no TypeScript types, so its objects are typed loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import elevation from "../data/elevation.json";
import { wgsToGcj } from "../lib/coords";
import { shortDate } from "../lib/dates";
import { PERMIT_NODES } from "../lib/defaults";
import { km } from "../lib/format";
import type { Dataset, Plan, Stop } from "../lib/types";

import { AMAP_ENABLED, loadAMap } from "./amapLoader";

const DETAIL_ZOOM = 7;
const PASS_MIN_M = 3500;
const gcj = (c: [number, number]) => wgsToGcj(c[0], c[1]);
const llToGcj = (ll: [number, number]) => wgsToGcj(ll[1], ll[0]);
const PEAKS = (elevation as unknown as { peaks?: Record<string, [number, number, number]> }).peaks ?? {};

const C = {
  route: "#0f6a4a", routeDark: "#4cc08b", dim: "#9fb7aa", dimDark: "#3a5a4b",
  start: "#c21f32", sojourn: "#0f6a4a", comfort: "#2a9d5c", wait: "#c98500", road: "#e0a526", ex: "#2a78d6", pass: "#7a4fd6",
};

export type LayerKey = "dir" | "roads" | "numbers" | "passes" | "excursions";
const LAYER_LABEL: Record<LayerKey, string> = {
  dir: "行驶方向", roads: "风景道", numbers: "站点序号", passes: "高海拔山口", excursions: "单日往返",
};

function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

const svgUri = (w: number, h: number, body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`)}`;

/** Marker icon by stop kind and state: circle = city, square = town or village, triangle = nature, dashed ring = overnight on the road. */
function stopIcon(s: Stop, dark: boolean) {
  const big = s.node.star === 3 && !s.transit;
  const r = s.transit ? 3.5 : big ? 7 : 5.5;
  const fill = s.sojourn ? C.sojourn : s.comfortStay ? C.comfort : s.waitDays > 0 ? C.wait : big ? (dark ? C.routeDark : C.route) : dark ? "#171d1a" : "#ffffff";
  const stroke = s.waitDays > 0 ? C.wait : dark ? C.routeDark : C.route;
  const size = Math.ceil(r * 2 + 6), c = size / 2;
  const kind = s.transit ? "transit" : s.node.kind;
  let shape: string;
  if (kind === "town") shape = `<rect x="${c - r}" y="${c - r}" width="${r * 2}" height="${r * 2}" rx="1.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  else if (kind === "nature") shape = `<path d="M${c} ${c - r - 1}L${c + r + 1} ${c + r}L${c - r - 1} ${c + r}Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
  else shape = `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${kind === "transit" ? 'stroke-dasharray="2 2"' : ""}/>`;
  return { image: svgUri(size, size, shape), size: [size, size], anchor: "center" };
}

/** Large pin for start / end / loop entry. */
function pinImage(text: string) {
  const body = `<path d="M18 2C9.7 2 3 8.4 3 16.4 3 27 18 44 18 44s15-17 15-27.6C33 8.4 26.3 2 18 2z" fill="${C.start}" stroke="#fff" stroke-width="2.5"/>`
    + `<text x="18" y="21" text-anchor="middle" font-size="13" font-weight="700" fill="#fff" font-family="sans-serif">${text}</text>`;
  return svgUri(36, 46, body);
}

function stopLabel(s: Stop, order: number, numbers: boolean) {
  const name = s.node.n.split(" · ")[0];
  const tags: string[] = [];
  if (s.sojourn) tags.push(`旅居${Math.round(s.nights / 7)}周`);
  else if (s.comfortStay) tags.push(`住${s.nights}晚`);
  if (s.waitDays > 0) tags.push(`等季节${s.waitDays}天`);
  if (PERMIT_NODES.includes(s.node.id)) tags.push("边防证");
  return `${numbers ? `${order} ` : ""}${name}${tags.length ? `·${tags.join("·")}` : ""}`;
}

interface Props {
  plan: Plan;
  data: Dataset;
  selectedSeg: string | null;
  onSelectStop: (id: string) => void;
  onSelectSeg: (k: string | null) => void;
}


const detailCache = new Map<string, Promise<Record<string, [number, number][]>>>();
function loadDetail(seg: string) {
  if (!detailCache.has(seg)) {
    detailCache.set(seg, fetch(`route/${seg}.json`).then((r) => (r.ok ? r.json() : { legs: {} })).then((j) => j.legs ?? {}).catch(() => ({})));
  }
  return detailCache.get(seg)!;
}

const LAYER_STORE = "wanlilushu.mapLayers.v1";
function loadLayers(): Record<LayerKey, boolean> {
  const all = { dir: true, roads: true, numbers: true, passes: true, excursions: true };
  try { return { ...all, ...JSON.parse(localStorage.getItem(LAYER_STORE) ?? "{}") }; } catch { return all; }
}

export function AmapView(props: Props) {
  const { plan, data, selectedSeg, onSelectStop, onSelectSeg } = props;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const AMapRef = useRef<any>(null);
  // lines are keyed by leg index in `data` (which may include the traveller's own stops); origToLi maps
  // bundled leg indexes (used by the detailed-geometry files) to those keys
  const L = useRef<{ lines: Map<number, { line: any; seg: string }>; groups: Record<string, any[]>; sat: any[]; hover: any; origToLi: Map<number, number> }>(
    { lines: new Map(), groups: {}, sat: [], hover: null, origToLi: new Map() });
  const cb = useRef({ onSelectStop, onSelectSeg });
  cb.current = { onSelectStop, onSelectSeg };
  const [failed, setFailed] = useState(!AMAP_ENABLED);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(loadLayers);
  const [themeTick, setThemeTick] = useState(0);
  const [legendOpen, setLegendOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 760);

  useEffect(() => { try { localStorage.setItem(LAYER_STORE, JSON.stringify(layers)); } catch { /* optional */ } }, [layers]);

  // stops in travel order, first visit only (the loop end shares the entry's pin)
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const out: { s: Stop; order: number }[] = [];
    plan.stops.forEach((s, i) => { if (!seen.has(s.node.id)) { seen.add(s.node.id); out.push({ s, order: i + 1 }); } });
    return out;
  }, [plan]);

  // ---- create the map once
  useEffect(() => {
    if (!AMAP_ENABLED || !el.current) return;
    let disposed = false;
    loadAMap().then((AMap) => {
      if (disposed || !el.current) return;
      AMapRef.current = AMap;
      const map = new AMap.Map(el.current, {
        zoom: 4, center: [104, 36], viewMode: "2D", resizeEnable: true,
        mapStyle: isDark() ? "amap://styles/dark" : "amap://styles/normal",
      });
      map.addControl(new AMap.Scale());
      map.addControl(new AMap.ToolBar({ position: "RT" }));
      L.current.sat = [new AMap.TileLayer.Satellite(), new AMap.TileLayer.RoadNet()];
      L.current.hover = new AMap.Text({ text: "", anchor: "bottom-center", offset: new AMap.Pixel(0, -14), zIndex: 300,
        style: { padding: "6px 9px", "border-radius": "5px", "background-color": "rgba(20,28,25,0.92)", color: "#fff", "font-size": "12px", "line-height": "1.5", border: "0", "white-space": "pre" } });
      mapRef.current = map;
      if (import.meta.env.DEV) (window as any).__amap = map;
      setReady(true);
    }).catch(() => setFailed(true));
    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      L.current = { lines: new Map(), groups: {}, sat: [], hover: null, origToLi: new Map() };
      setReady(false);
    };
  }, []);

  // ---- follow the page theme (system setting or the viewer's toggle)
  useEffect(() => {
    if (!ready) return;
    const apply = () => { mapRef.current?.setMapStyle(isDark() ? "amap://styles/dark" : "amap://styles/normal"); setThemeTick((t) => t + 1); };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", apply);
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq?.removeEventListener?.("change", apply); mo.disconnect(); };
  }, [ready]);

  // ---- draw everything for the current plan and layer switches
  useEffect(() => {
    const map = mapRef.current, AMap = AMapRef.current;
    if (!ready || !map || !AMap) return;
    const dark = isDark();
    const R = L.current;
    R.lines.forEach(({ line }) => map.remove(line));
    R.lines.clear();
    R.origToLi = new Map(data.legs.flatMap((l, i) => (l.orig != null ? [[l.orig, i] as [number, number]] : [])));
    Object.values(R.groups).flat().forEach((o) => map.remove(o));
    const G: Record<string, any[]> = { roads: [], passes: [], excursions: [], stops: [], pins: [], ferry: [] };
    R.groups = G;
    const hover = R.hover;
    const showHover = (pos: any, text: string) => { hover.setText(text); hover.setPosition(pos); map.add(hover); };
    const hideHover = () => map.remove(hover);
    const nodeName = new Map(data.nodes.map((n) => [n.id, n.n]));

    // route lines with direction arrows; scenic-road bands underneath
    const roadByLeg = new Map<string, string>();
    for (const r of data.roads) for (const k of r.legs) roadByLeg.set(k, r.name);
    plan.legs.forEach((pl) => {
      for (const li of pl.legIdx) {
        const leg = data.legs[li];
        const path = leg.geom.map((c) => gcj(c as [number, number]));
        const line = new AMap.Polyline({
          path, strokeColor: dark ? C.routeDark : C.route, strokeWeight: 6, strokeOpacity: 0.95,
          strokeStyle: leg.ferry > 0 ? "dashed" : "solid", lineJoin: "round", lineCap: "round",
          showDir: layers.dir, dirColor: "#ffffff", extData: { seg: pl.seg, li }, cursor: "pointer", zIndex: 50,
        });
        const road = roadByLeg.get(`${leg.frm}>${leg.to}`);
        line.on("click", () => cb.current.onSelectSeg(pl.seg));
        line.on("mouseover", (e: any) => showHover(e.lnglat,
          `${nodeName.get(pl.from)} → ${nodeName.get(pl.to)}\n${km(pl.km)} · 约 ${pl.h.toFixed(1)} 小时 · ${shortDate(pl.date)}${road ? `\n风景道：${road}` : ""}`));
        line.on("mouseout", hideHover);
        R.lines.set(li, { line, seg: pl.seg });
        map.add(line);
        if (road && layers.roads) {
          G.roads.push(new AMap.Polyline({ path, strokeColor: C.road, strokeWeight: 14, strokeOpacity: 0.45, lineJoin: "round", lineCap: "round", zIndex: 40, bubble: true, extData: { li } }));
        }
        if (leg.ferry > 0) {
          G.ferry.push(new AMap.Text({ text: "⛴ 渤海轮渡", position: path[Math.floor(path.length / 2)], anchor: "center", zIndex: 130,
            style: { padding: "2px 6px", "border-radius": "4px", border: `1px solid ${C.ex}`, "background-color": dark ? "#171d1a" : "#fff", color: C.ex, "font-size": "12px" } }));
        }
        // the leg's highest point, when it is a real mountain pass
        const pk = leg.orig != null ? PEAKS[String(leg.orig)] : undefined;
        if (pk && pk[2] >= PASS_MIN_M && layers.passes) {
          // only the highest passes at country scale; the rest appear once zoomed in
          G.passes.push(new AMap.Text({ text: `▲约${pk[2]}m`, position: gcj([pk[1], pk[0]]), anchor: "bottom-center", zIndex: 125,
            zooms: [pk[2] >= 5000 ? 3 : 6, 20],
            style: { padding: "1px 5px", "border-radius": "3px", border: "0", "background-color": pk[2] >= 4500 ? C.pass : "rgba(122,79,214,0.75)", color: "#fff", "font-size": "11px", "font-weight": "600" } }));
        }
      }
    });

    // day trips: dashed spoke from the stop to the destination
    if (layers.excursions) {
      for (const s of plan.stops) {
        for (const e of s.excursions) {
          const a = llToGcj(s.node.ll), b = llToGcj(e.ll);
          G.excursions.push(new AMap.Polyline({ path: [a, b], strokeColor: C.ex, strokeWeight: 2, strokeStyle: "dashed", strokeDasharray: [6, 4], zIndex: 45, zooms: [5, 20] }));
          G.excursions.push(new AMap.Text({ text: `${e.name} · 往返${Math.round(e.km)}km`, position: b, anchor: "middle-left", offset: new AMap.Pixel(6, 0), zIndex: 126,
            zooms: [6, 20],
            style: { padding: "1px 5px", "border-radius": "3px", border: `1px solid ${C.ex}`, "background-color": dark ? "#171d1a" : "#fff", color: C.ex, "font-size": "11px" } }));
        }
      }
    }

    // stops in one collision-aware layer; rank decides who keeps the label when crowded
    const labels = new AMap.LabelsLayer({ collision: true, allowCollision: false, zIndex: 120 });
    const entryId = plan.entry.id;
    for (const { s, order } of ordered) {
      if (s.node.id === entryId) continue; // drawn as a pin
      // country scale shows the main places; the rest appear as you zoom in
      const major = s.sojourn || s.comfortStay || s.waitDays > 0 || s.node.custom || (s.node.star === 3 && !s.transit);
      const m = new AMap.LabelMarker({
        position: llToGcj(s.node.ll),
        zooms: [major ? 3 : s.transit ? 7 : 5.5, 20],
        rank: (s.sojourn ? 40 : 0) + (s.comfortStay ? 20 : 0) + s.node.star * 10 + (s.transit ? 0 : 5),
        icon: stopIcon(s, dark),
        text: {
          content: stopLabel(s, order, layers.numbers), direction: "right", offset: [4, 0],
          style: { fontSize: 12, fontWeight: s.sojourn || s.node.star === 3 ? 600 : 400, fillColor: dark ? "#e6ebe8" : "#1b2320", strokeColor: dark ? "#111614" : "#ffffff", strokeWidth: 3 },
        },
      });
      const brk = plan.breaks.find((b) => b.after === s.node.id);
      const detail = `${order}. ${s.node.n}${s.transit ? "（途中过夜）" : ""}\n${shortDate(s.date)} 到 · 住 ${s.nights} 晚${s.sojourn ? " · 旅居" : s.comfortStay ? " · 多住" : ""}${s.waitDays ? ` · 等季节 ${s.waitDays} 天` : ""}\n海拔 ${s.node.alt ?? "?"} m${brk ? `\n之后回家 ${brk.days} 天` : ""}`;
      m.on("click", () => cb.current.onSelectStop(s.node.id));
      m.on("mouseover", () => showHover(llToGcj(s.node.ll), detail));
      m.on("mouseout", hideHover);
      labels.add(m);
      if (brk) {
        G.pins.push(new AMap.Text({ text: `回家 ${brk.days} 天`, position: llToGcj(s.node.ll), anchor: "top-center", offset: new AMap.Pixel(0, 10), zIndex: 140,
          style: { padding: "1px 6px", "border-radius": "3px", border: "0", "background-color": C.start, color: "#fff", "font-size": "11px" } }));
      }
    }
    G.stops.push(labels);

    // start / end pins: home city and where the loop is joined
    const entryStop = plan.stops[0];
    const homeIsEntry = !plan.approach;
    const pin = (pos: any, text: string, html: string, onClick?: () => void) => {
      const mk = new AMap.Marker({
        position: pos, zIndex: 200, anchor: "bottom-center",
        content: `<img src="${pinImage(text)}" width="36" height="46" alt="" style="display:block"/>`,
        label: { content: `<div class="amap-pin-label">${html}</div>`, direction: "right", offset: new AMap.Pixel(2, -30) },
      });
      if (onClick) mk.on("click", onClick);
      G.pins.push(mk);
    };
    pin(llToGcj(entryStop.node.ll), homeIsEntry ? "起" : "入",
      `${homeIsEntry ? "起点 · 终点" : "进入 · 离开环线"}<b>${entryStop.node.n.split(" · ")[0]}</b><span>${shortDate(plan.input.startDate)} 出发，${shortDate(plan.endDate)} 回来</span>`,
      () => cb.current.onSelectStop(entryStop.node.id));
    if (plan.approach) {
      const home = llToGcj(plan.start.ll);
      pin(home, "家", `起点 · 终点<b>${plan.start.name}</b><span>开 ${km(plan.approach.km)} 接入环线</span>`);
      G.pins.push(new AMap.Polyline({ path: [home, llToGcj(entryStop.node.ll)], strokeColor: C.start, strokeWeight: 3, strokeStyle: "dashed", strokeDasharray: [8, 6], zIndex: 46 }));
    }

    Object.values(G).flat().forEach((o) => map.add(o));
  }, [ready, plan, data, ordered, layers, themeTick]);

  // ---- segment focus: dim the others, zoom to it, swap in detailed geometry
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const dark = isDark();
    const R = L.current;
    const on = dark ? C.routeDark : C.route, off = dark ? C.dimDark : C.dim;
    R.lines.forEach(({ line, seg }) => line.setOptions({ strokeColor: !selectedSeg || seg === selectedSeg ? on : off, zIndex: seg === selectedSeg ? 60 : 50 }));
    if (selectedSeg) {
      const focus = [...R.lines.values()].filter((x) => x.seg === selectedSeg).map((x) => x.line);
      if (focus.length) map.setFitView(focus, true, [60, 60, 60, 60]);
      applyDetail(selectedSeg);
    } else {
      map.setZoomAndCenter(4, [104, 36], true);
    }
  }, [ready, selectedSeg, plan, layers]);

  // ---- load detailed geometry for segments in view once zoomed in
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const onMove = () => {
      if (map.getZoom() < DETAIL_ZOOM) return;
      const b = map.getBounds();
      const segs = new Set<string>();
      for (const s of plan.stops) if (b.contains(llToGcj(s.node.ll))) segs.add(s.node.seg);
      segs.forEach(applyDetail);
    };
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    return () => { map.off("moveend", onMove); map.off("zoomend", onMove); };
  }, [ready, plan, layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    L.current.sat.forEach((l) => (satellite ? map.add(l) : map.remove(l)));
  }, [ready, satellite]);

  function applyDetail(seg: string) {
    loadDetail(seg).then((legs) => {
      for (const [orig, coords] of Object.entries(legs)) {
        const li = L.current.origToLi.get(Number(orig));
        const entry = li == null ? undefined : L.current.lines.get(li);
        if (entry && !entry.line.getExtData().detailed) {
          const path = coords.map(gcj);
          entry.line.setPath(path);
          entry.line.setExtData({ ...entry.line.getExtData(), detailed: true });
          (L.current.groups.roads ?? []).filter((b) => b.getExtData().li === li).forEach((b) => b.setPath(path));
        }
      }
    });
  }

  if (failed) {
    // no home-made national map here: maps shown to the public in China need an approved base map (审图号)
    return (
      <div className="map-failed">
        <p>{AMAP_ENABLED ? "高德地图没有加载成功，可能是网络问题，刷新页面再试。" : "没有配置高德地图 Key，地图不可用。"}</p>
        <p className="hint">行程、旅居、费用等其他页签不受影响。</p>
      </div>
    );
  }
  return (
    <div className="amap-wrap">
      <div ref={el} className="amap" role="application" aria-label="可缩放的全国自驾路线地图" />
      <div className="map-switch" role="group" aria-label="底图">
        <button type="button" aria-pressed={!satellite} onClick={() => setSatellite(false)}>标准</button>
        <button type="button" aria-pressed={satellite} onClick={() => setSatellite(true)}>卫星</button>
      </div>
      {!ready && <div className="amap-loading">正在加载高德地图…</div>}
      <div className={`map-legend${legendOpen ? " open" : ""}`}>
        <button type="button" className="legend-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>图例与图层 {legendOpen ? "−" : "+"}</button>
        {legendOpen && (
          <div className="legend-body">
            <div className="lg-row"><i className="lg-pin" />起点、终点</div>
            <div className="lg-row"><i className="lg-shape circle" />城市 <i className="lg-shape square" />古镇村寨 <i className="lg-shape tri" />自然</div>
            <div className="lg-row"><i className="lg-shape circle fill" />三星必去 <i className="lg-shape circle ring" />途中过夜</div>
            <div className="lg-row"><i className="lg-dot" style={{ background: C.sojourn }} />旅居 <i className="lg-dot" style={{ background: C.comfort }} />多住 <i className="lg-dot" style={{ background: C.wait }} />等季节</div>
            <hr />
            {(Object.keys(LAYER_LABEL) as LayerKey[]).map((k) => (
              <label key={k} className="lg-row lg-check">
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />
                {k === "roads" && <i className="lg-road" />}
                {k === "passes" && <i className="lg-pass">▲</i>}
                {k === "excursions" && <i className="lg-ex" />}
                {LAYER_LABEL[k]}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
