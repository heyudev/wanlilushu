import { useMemo, useState } from "react";
import { searchStops } from "../lib/search";
import type { Dataset } from "../lib/types";

export function SearchBox({ data, onPick }: { data: Dataset; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => searchStops(data, q), [data, q]);
  return (
    <div className="searchbox" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input type="search" value={q} placeholder="搜地方、美食、景点，或“带狗”“旅居”" aria-label="搜索"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { onPick(hits[0].node.id); setOpen(false); } if (e.key === "Escape") setOpen(false); }} />
      {open && q.trim() && (
        <ul className="search-pop" role="listbox">
          {hits.length === 0 && <li className="muted small">没有找到</li>}
          {hits.map((h) => (
            <li key={h.node.id}>
              <button type="button" onClick={() => { onPick(h.node.id); setOpen(false); }}>
                <b>{h.node.n}</b><span className="muted small">{h.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
