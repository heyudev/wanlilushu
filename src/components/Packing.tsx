import { useEffect, useState } from "react";
import { packingFor } from "../lib/packing";
import type { Plan } from "../lib/types";

const KEY = "wanlilushu.packing.v1";

function load(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
}

export function Packing({ plan }: { plan: Plan }) {
  const [done, setDone] = useState<Record<string, boolean>>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* storage may be unavailable */ }
  }, [done]);
  const groups = packingFor(plan);
  const all = groups.flatMap((g) => g.items);
  const n = all.filter((i) => done[i]).length;
  return (
    <div>
      <p className="sub">已准备 {n} / {all.length}，勾选状态只保存在这台设备的浏览器里。</p>
      <div className="pack">
        {groups.map((g) => (
          <div className="card" key={g.title}>
            <h3>{g.title} {g.tag !== "always" && <span className="tag">按你的行程加入</span>}</h3>
            {g.items.map((i) => (
              <label key={i} className={done[i] ? "done" : ""}>
                <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} />
                <span>{i}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
