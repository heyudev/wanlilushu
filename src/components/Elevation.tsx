import { useMemo, useRef, useState } from "react";
import elevation from "../data/elevation.json";
import { buildProfile, type RawSample } from "../lib/profile";
import { int } from "../lib/format";
import type { Dataset, Plan } from "../lib/types";

const W = 1000;
const H = 210;
const M = { l: 46, r: 12, t: 14, b: 34 };
const YMAX = 5600;

export function Elevation({ plan, data }: { plan: Plan; data: Dataset }) {
  const pts = useMemo(() => buildProfile(plan, data, elevation.profile as RawSample[]), [plan, data]);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const maxKm = pts.length ? pts[pts.length - 1].km : 1;
  const x = (k: number) => M.l + (k / maxKm) * (W - M.l - M.r);
  const y = (m: number) => H - M.b - (Math.max(0, m) / YMAX) * (H - M.t - M.b);

  const area = useMemo(() => {
    if (!pts.length) return "";
    // one closed shape per stretch with samples; connecting drives between segments are left as gaps
    const runs: (typeof pts)[] = [];
    for (const p of pts) (p.gapBefore || !runs.length ? runs.push([p]) : runs[runs.length - 1].push(p));
    return runs.map((r) => {
      const line = r.map((p) => `${x(p.km).toFixed(1)},${y(p.m).toFixed(1)}`).join("L");
      return `M${x(r[0].km).toFixed(1)},${y(0)}L${line}L${x(r[r.length - 1].km).toFixed(1)},${y(0)}Z`;
    }).join("");
  }, [pts, maxKm]);

  const peak = pts.reduce((a, p) => (p.m > a.m ? p : a), { km: 0, m: 0, leg: 0 });
  const node = (id: string) => data.nodes.find((n) => n.id === id)?.n ?? id;

  // segment boundaries along the x axis
  const segMarks = useMemo(() => {
    const marks: { k: string; km: number }[] = [];
    let last = "";
    for (const p of pts) {
      const seg = plan.legs[p.leg].seg;
      if (seg !== last) { marks.push({ k: seg, km: p.km }); last = seg; }
    }
    return marks;
  }, [pts, plan]);

  const step = maxKm > 20000 ? 5000 : maxKm > 8000 ? 2000 : 1000;
  const xticks: number[] = [];
  for (let k = 0; k <= maxKm; k += step) xticks.push(k);

  const onMove = (e: React.MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || !pts.length) return;
    const k = ((e.clientX - r.left) / r.width * W - M.l) / (W - M.l - M.r) * maxKm;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].km - k) < Math.abs(pts[best].km - k)) best = i;
    setHover(best);
  };
  const hp = hover != null ? pts[hover] : null;
  const hl = hp ? plan.legs[hp.leg] : null;

  return (
    <div className="chart" ref={wrap}>
      <div className="title">海拔剖面 · 沿行驶方向（SRTM 90m，每 12km 取样）</div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label={`全程海拔剖面，最高约 ${int(peak.m)} 米`}>
        <g className="grid">
          {[1000, 2000, 3000, 4000, 5000].map((m) => <line key={m} x1={M.l} x2={W - M.r} y1={y(m)} y2={y(m)} />)}
        </g>
        <g className="axis">
          {[0, 1000, 2000, 3000, 4000, 5000].map((m) => <text key={m} x={M.l - 6} y={y(m) + 4} textAnchor="end">{m}</text>)}
          {xticks.map((k) => <text key={k} x={x(k)} y={H - M.b + 14} textAnchor="middle">{k === 0 ? "0" : `${k / 1000}k km`}</text>)}
          {segMarks.map((s) => (
            <g key={s.k + s.km}>
              <line x1={x(s.km)} x2={x(s.km)} y1={H - M.b} y2={H - M.b + 4} stroke="var(--ink-3)" />
              <text x={x(s.km) + 2} y={H - 4} style={{ fontSize: 10 }}>{s.k}</text>
            </g>
          ))}
        </g>
        <path className="area" d={area} />
        <g className="ref">
          <line x1={M.l} x2={W - M.r} y1={y(3000)} y2={y(3000)} />
          <text x={W - M.r - 4} y={y(3000) - 4} textAnchor="end">3000m 高原</text>
          <line x1={M.l} x2={W - M.r} y1={y(4000)} y2={y(4000)} />
          <text x={W - M.r - 4} y={y(4000) - 4} textAnchor="end">4000m</text>
        </g>
        {peak.m > 0 && (
          <g className="ref">
            <circle cx={x(peak.km)} cy={y(peak.m)} r={3.5} fill="var(--area)" />
            <text x={x(peak.km) + 6} y={y(peak.m) + 2}>最高约 {int(peak.m)}m（{node(plan.legs[peak.leg].from)}→{node(plan.legs[peak.leg].to)}）</text>
          </g>
        )}
        {hp && (
          <g className="cross">
            <line x1={x(hp.km)} x2={x(hp.km)} y1={M.t} y2={H - M.b} />
            <circle cx={x(hp.km)} cy={y(hp.m)} r={4.5} />
          </g>
        )}
      </svg>
      {hp && hl && (
        <div className="tip" style={{ left: `${(x(hp.km) / W) * 100}%`, top: 30, transform: x(hp.km) > W * 0.7 ? "translateX(-105%)" : "translateX(8px)" }}>
          <div>第 {int(hp.km)} km · 海拔 {int(hp.m)} m</div>
          <div>{node(hl.from)} → {node(hl.to)}</div>
        </div>
      )}
    </div>
  );
}
