// Add your own place after a stop: AMap place search, then AMap driving directions in and out.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { gcjToWgs, wgsToGcj } from "../lib/coords";

import type { CustomStop, Dataset } from "../lib/types";
import { AMAP_ENABLED, loadAMap } from "./amapLoader";

interface Poi { name: string; address: string; province: string; city: string; lng: number; lat: number }

/** Keep at most `max` points of a long path (enough to draw it). */
function thin(path: [number, number][], max = 300): [number, number][] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)]);
}

function drive(AMap: any, from: [number, number], to: [number, number]): Promise<CustomStop["legIn"]> {
  return new Promise((resolve, reject) => {
    const d = new AMap.Driving({ policy: AMap.DrivingPolicy.LEAST_TIME });
    d.search(new AMap.LngLat(from[0], from[1]), new AMap.LngLat(to[0], to[1]), (status: string, result: any) => {
      const r = result?.routes?.[0];
      if (status !== "complete" || !r) return reject(new Error(typeof result === "string" ? result : "没有找到驾车路线"));
      const path: [number, number][] = (r.steps ?? []).flatMap((s: any) => (s.path ?? []).map((p: any) => gcjToWgs(p.lng, p.lat)));
      resolve({
        km: Math.round(r.distance / 100) / 10, h: Math.round((r.time / 3600) * 100) / 100,
        hw: Math.round((r.toll_distance ?? 0) / 100) / 10, toll: r.tolls != null ? Number(r.tolls) : null, geom: thin(path),
      });
    });
  });
}

export function AddPlace({ data, afterId, onAdd }: { data: Dataset; afterId: string; onAdd: (c: CustomStop) => void }) {
  const i = data.nodes.findIndex((n) => n.id === afterId);
  const anchor = data.nodes[i];
  const next = data.nodes[(i + 1) % data.nodes.length];
  const [q, setQ] = useState("");
  const [pois, setPois] = useState<Poi[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nights, setNights] = useState(1);

  if (!AMAP_ENABLED) return <p>需要配置高德地图 Key 才能搜索和计算路线。</p>;

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true); setError(null);
    try {
      const AMap = await loadAMap(["AMap.PlaceSearch"]);
      const ps = new AMap.PlaceSearch({ pageSize: 8, city: "全国" });
      ps.search(q.trim(), (status: string, result: any) => {
        setBusy(false);
        const list = result?.poiList?.pois ?? [];
        // status is "complete", "no_data" or "error" (result is then the error code, e.g. INVALID_USER_DOMAIN)
        if (status === "error") { setPois([]); setError(`高德地点搜索出错（${typeof result === "string" ? result : "未知错误"}），请稍后再试。`); return; }
        if (status !== "complete" || !list.length) { setPois([]); setError("没有找到，换个关键词试试。"); return; }
        setPois(list.filter((p: any) => p.location).map((p: any) => ({
          name: p.name, address: typeof p.address === "string" ? p.address : "", province: p.pname ?? "", city: p.cityname ?? "",
          lng: p.location.lng, lat: p.location.lat,
        })));
      });
    } catch { setBusy(false); setError("高德地图没有加载成功，请稍后再试。"); }
  };

  const pick = async (p: Poi) => {
    setBusy(true); setError(null);
    try {
      const AMap = await loadAMap(["AMap.Driving"]);
      const a = wgsToGcj(anchor.ll[1], anchor.ll[0]), b = wgsToGcj(next.ll[1], next.ll[0]);
      const legIn = await drive(AMap, a, [p.lng, p.lat]);
      const legOut = await drive(AMap, [p.lng, p.lat], b);
      const [lon, lat] = gcjToWgs(p.lng, p.lat);
      onAdd({ id: `c-${Date.now().toString(36)}`, name: p.name, province: p.province, ll: [lat, lon], after: afterId, nights, legIn, legOut });
    } catch (e) {
      setError(`计算路线失败：${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="add-place">
      <p className="small">加在 <b>{anchor.n}</b> 和 <b>{next.n}</b> 之间。原来这两站之间的路段会改成：{anchor.n.split(" · ")[0]} → 新地点 → {next.n.split(" · ")[0]}，里程、时长和过路费由高德地图计算。</p>
      <form className="ap-search" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="地名、景点或村镇，如：洱源、喜洲" aria-label="搜索地点" />
        <button type="submit" className="btn" disabled={busy}>搜索</button>
      </form>
      <div className="field">
        <label htmlFor="ap-n">在那里住几晚</label>
        <input id="ap-n" type="number" min={1} max={60} value={nights} onChange={(e) => e.target.value && setNights(Math.max(1, Number(e.target.value)))} />
      </div>
      {busy && <p className="muted small">正在查询…</p>}
      {error && <p className="err small">{error}</p>}
      <ul className="ap-list">
        {pois.map((p) => (
          <li key={`${p.name}${p.lng}`}>
            <button type="button" onClick={() => pick(p)} disabled={busy}>
              <b>{p.name}</b>
              <span className="muted small">{[p.province, p.city, p.address].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
      {pois.length > 0 && <p className="hint">点一个结果即可加入。到新地点的路线按高德“最快”策略计算，过路费为高德给出的估算，以出发时导航为准。</p>}
    </div>
  );
}
