import { comfortLabel, comfortScore } from "../lib/comfort";
import type { MonthClimate } from "../lib/types";

/** Twelve monthly cells: comfort as fill, temperature range as text. Highlights the arrival month. */
export function ClimateBars({ months, current }: { months: MonthClimate[]; current?: number }) {
  return (
    <div className="climate">
      <div className="climate-grid" role="table" aria-label="逐月气候与舒适度">
        {months.map((m, i) => {
          const s = comfortScore(m);
          return (
            <div key={i} role="row" className={`cm${current === i + 1 ? " now" : ""}`}
              title={`${i + 1} 月：${Math.round(m[1])}–${Math.round(m[0])}°C，湿度 ${m[2]}%，雨天约 ${m[3]} 天，${comfortLabel(s)}`}>
              <span className="cm-bar" style={{ ["--s" as string]: String(s) }} aria-hidden="true" />
              <span className="cm-m">{i + 1}月</span>
              <span className="cm-t num">{Math.round(m[1])}~{Math.round(m[0])}°</span>
            </div>
          );
        })}
      </div>
      <p className="hint">柱高为居住舒适度（按日均温、最高最低温、湿度、雨天数计算），数据为近年逐日气象的月平均（2016–2025 或 2022–2025 年，Open-Meteo）。</p>
    </div>
  );
}
