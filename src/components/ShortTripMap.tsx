import { useEffect, useRef, useState } from "react";
import { wgsToGcj } from "../lib/coords";
import type { ShortTripPlan } from "../lib/shortTrip";
import { abortable, SEARCH_TIMEOUT_MS, tripErrorMessage } from "../lib/shortTripAmap";
import { loadAMap } from "./amapLoader";

export function ShortTripMap({ plan }: { plan: ShortTripPlan }) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    let active = true;
    let map: any;
    setError(null); setReady(false);
    abortable<any>((resolve, reject) => { loadAMap().then(resolve, reject); }, controller.signal).then((AMap) => {
      if (!active || controller.signal.aborted || !el.current) return;
      clearTimeout(timer);
      map = new AMap.Map(el.current, { zoom: 9, center: wgsToGcj(...plan.input.origin!.ll) });
      const overlays = plan.legs.map((l, i) => new AMap.Polyline({ path: l.geom.map((ll) => wgsToGcj(...ll)),
        strokeColor: plan.input.roundTrip && i === plan.legs.length - 1 ? "#a76a32" : "#427363", strokeWeight: 5, strokeOpacity: 0.85 }));
      const places = [plan.input.origin!, ...plan.input.waypoints, plan.input.destination!];
      places.forEach((p) => overlays.push(new AMap.Marker({ position: wgsToGcj(...p.ll), title: p.name })));
      map.add(overlays); map.setFitView(overlays); setReady(true);
    }).catch((e) => { if (active) setError(tripErrorMessage(e)); });
    return () => { active = false; clearTimeout(timer); controller.abort(); map?.destroy(); };
  }, [plan]);
  return <div className="amap-wrap">
    <div ref={el} className="amap short-map" role="application" aria-label="短途自驾路线地图" />
    {error ? <div className="amap-loading">地图加载失败：{error} 行程文字仍可查看。</div> : !ready && <div className="amap-loading">正在加载高德地图…</div>}
  </div>;
}
