import { useMemo } from "react";
import { RHYTHMS } from "../lib/defaults";
import { duration } from "../lib/format";
import { buildPlan } from "../lib/plan";
import type { Dataset, PlanInput, Rhythm } from "../lib/types";
import type { SetInput } from "./TripSettings";

type Preset = Exclude<Rhythm, "custom">;

export function applyRhythm(input: PlanInput, r: Preset): PlanInput {
  const p = RHYTHMS[r];
  return { ...input, rhythm: r, stayFactor: p.stayFactor, comfortStayNights: p.comfortStayNights, sojournEveryWeeks: p.sojournEveryWeeks, sojournWeeks: p.sojournWeeks };
}

/** Four rhythm presets, each showing how long the whole trip becomes with the current choices. */
export function RhythmPicker({ input, data, onPick }: { input: PlanInput; data: Dataset; onPick: (next: PlanInput) => void }) {
  const lengths = useMemo(() => Object.fromEntries((Object.keys(RHYTHMS) as Preset[]).map((r) => [r, buildPlan(data, applyRhythm(input, r)).days])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, input.start, input.startDate, input.direction, input.pace, input.interests.join(), input.minComfort, input.breaks, input.waitForSeason, input.maxWaitDays]);
  return (
    <div className="field">
      <span className="label">旅行节奏</span>
      <div className="rhythms" role="group" aria-label="旅行节奏">
        {(Object.keys(RHYTHMS) as Preset[]).map((r) => (
          <button key={r} type="button" aria-pressed={input.rhythm === r} onClick={() => onPick(applyRhythm(input, r))}>
            <b>{RHYTHMS[r].label}</b>
            <span className="num">约 {duration(lengths[r])}</span>
            <span className="muted small">{RHYTHMS[r].hint}</span>
          </button>
        ))}
      </div>
      {input.rhythm === "custom" && <span className="hint">当前是自定义节奏，可在“调整条件”里细调。</span>}
    </div>
  );
}

export function RhythmFields({ input, set }: { input: PlanInput; set: SetInput }) {
  const custom = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => { set(k, v); set("rhythm", "custom"); };
  return (
    <div className="rhythm-fields">
      <div className="row2">
        <div className="field">
          <label htmlFor="sf">每个地方住多久</label>
          <select id="sf" value={String(input.stayFactor)} onChange={(e) => custom("stayFactor", Number(e.target.value))}>
            <option value="1">按基础天数（如大理 3 晚）</option>
            <option value="1.25">多住一点（大理 4 晚）</option>
            <option value="1.5">多住一半（大理约 5 晚）</option>
            <option value="2">住两倍（大理 6 晚）</option>
            <option value="3">住三倍（大理 9 晚）</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cs">舒服的地方住几晚</label>
          <input id="cs" type="number" inputMode="numeric" min={0} max={21} value={input.comfortStayNights}
            onChange={(e) => e.target.value !== "" && custom("comfortStayNights", Math.max(0, Number(e.target.value)))} />
        </div>
        <div className="field">
          <label htmlFor="se">旅居：每隔几周一次（0 为不旅居）</label>
          <input id="se" type="number" inputMode="numeric" min={0} max={52} value={input.sojournEveryWeeks}
            onChange={(e) => e.target.value !== "" && custom("sojournEveryWeeks", Math.max(0, Number(e.target.value)))} />
        </div>
        <div className="field">
          <label htmlFor="sw">旅居：每次几周</label>
          <input id="sw" type="number" inputMode="numeric" min={0} max={26} value={input.sojournWeeks}
            onChange={(e) => e.target.value !== "" && custom("sojournWeeks", Math.max(0, Number(e.target.value)))} />
        </div>
        <div className="field">
          <label htmlFor="mc">多住、旅居要求的气候舒适度</label>
          <select id="mc" value={String(input.minComfort)} onChange={(e) => custom("minComfort", Number(e.target.value))}>
            <option value="0.9">很高（只挑最舒服的月份）</option>
            <option value="0.7">较高</option>
            <option value="0.5">一般</option>
          </select>
        </div>
      </div>
      <label className="toggle" htmlFor="wait">
        <input id="wait" type="checkbox" checked={input.waitForSeason} onChange={(e) => set("waitForSeason", e.target.checked)} />
        <span className="track" aria-hidden="true" />
        <span>等季节（默认不等）：进西藏、新疆、川西、东北极北前季节不对，就在前一个旅居地多住</span>
      </label>
      {input.waitForSeason && (
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="mw">最多等多久（再久就不等，到时提醒季节不对）</label>
          <select id="mw" value={String(input.maxWaitDays)} onChange={(e) => set("maxWaitDays", Number(e.target.value))}>
            {[14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>{d >= 30 ? `${d / 30} 个月` : `${d / 7} 周`}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
