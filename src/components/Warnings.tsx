import type { Dataset, Plan } from "../lib/types";

const ICON = { critical: "!", warn: "!", info: "i" } as const;
const ORDER = { critical: 0, warn: 1, info: 2 } as const;

export function Warnings({ plan, data, onSelectStop }: { plan: Plan; data: Dataset; onSelectStop: (id: string) => void }) {
  const name = new Map(data.nodes.map((n) => [n.id, n.n]));
  const ws = [...plan.warnings].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <div className="warns">
      {ws.map((w, i) => (
        <div key={i} className={`warn ${w.level}`} role={w.level === "critical" ? "alert" : undefined}>
          <span className="ic" aria-label={w.level === "critical" ? "严重" : w.level === "warn" ? "注意" : "提示"}>{ICON[w.level]}</span>
          <div>
            <div>{w.text}</div>
            {w.nodes && w.nodes.length > 0 && (
              <div className="nodes">
                涉及：{[...new Set(w.nodes)].slice(0, 16).map((id, j) => (
                  <span key={id}>{j > 0 && "、"}<button type="button" className="link" onClick={() => onSelectStop(id)}>{name.get(id) ?? id}</button></span>
                ))}
                {w.nodes.length > 16 && ` 等 ${w.nodes.length} 处`}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
