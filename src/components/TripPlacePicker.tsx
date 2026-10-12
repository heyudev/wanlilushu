import { useEffect, useRef, useState } from "react";
import { abortable, SEARCH_TIMEOUT_MS, searchTripPlaces, tripErrorMessage } from "../lib/shortTripAmap";
import type { TripPlace } from "../lib/shortTrip";
import { AMAP_ENABLED, loadAMap } from "./amapLoader";

export function TripPlacePicker({ id, label, value, onChange }: { id: string; label: string; value: TripPlace | null; onChange: (p: TripPlace | null) => void }) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<TripPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { const request = pending.current; pending.current = null; request?.abort(); }, []);
  const search = async () => {
    if (!query.trim() || !AMAP_ENABLED) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setBusy(true); setError(null); setResults([]);
    try {
      const AMap = await abortable((resolve, reject) => { loadAMap(["AMap.PlaceSearch"]).then(resolve, reject); }, controller.signal);
      const places = await searchTripPlaces(AMap, query, controller.signal);
      if (!controller.signal.aborted) setResults(places);
    } catch (e) { if (pending.current === controller) setError(tripErrorMessage(e)); }
    finally { clearTimeout(timer); if (pending.current === controller) { setBusy(false); pending.current = null; } }
  };
  return <div className="field trip-place">
    <label htmlFor={id}>{label}</label>
    <div className="ap-search">
      <input id={id} type="search" value={query} placeholder="输入城市、地址或景点，再选择搜索结果"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
        onChange={(e) => { pending.current?.abort(); pending.current = null; setBusy(false); setQuery(e.target.value); onChange(null); setResults([]); setError(null); }} />
      <button type="button" className="btn" disabled={busy || !query.trim() || !AMAP_ENABLED} onClick={search}>{busy ? "查询中…" : "搜索"}</button>
    </div>
    {value && <p className="small trip-selected">已选择：{value.name}<span className="muted"> · {value.address}</span></p>}
    {error && <p className="err small" role="status">{error}</p>}
    <ul className="ap-list">{results.map((p, i) => <li key={i}><button type="button" onClick={() => { onChange(p); setQuery(p.name); setResults([]); }}><b>{p.name}</b><span className="muted small">{p.address}</span></button></li>)}</ul>
  </div>;
}
