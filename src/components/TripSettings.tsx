import { useMemo } from "react";
import { DOG_SIZE_LABEL, FOOD_TIER_LABEL, INTEREST_LABEL } from "../lib/defaults";
import { bestStartDates, buildPlan } from "../lib/plan";
import { routeMode } from "../lib/order";
import { duration, int } from "../lib/format";
import { shortDate } from "../lib/dates";
import type { Dataset, Interest, Plan, PlanInput } from "../lib/types";
import { Choice, Num, NumOpt, Stepper, Toggle } from "./Fields";
import { RhythmFields, RhythmPicker } from "./RhythmPicker";

export type SetInput = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => void;

export const POPULAR = ["北京", "上海", "广州", "深圳", "成都", "杭州", "武汉", "西安", "重庆", "南京"];

export function StartFields({ input, set, data, today }: { input: PlanInput; set: SetInput; data: Dataset; today: string }) {
  const best = useMemo(() => bestStartDates(data, input, today, 365, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, input.start, input.direction, input.pace, input.interests.join(), input.maxDriveHours, routeMode(input), today]);
  const others = data.starts.filter((s) => !POPULAR.includes(s.name));
  return (
    <>
      <div className="field">
        <span className="label">从哪里出发</span>
        <div className="seg-btns" role="group" aria-label="热门出发城市">
          {POPULAR.map((c) => <button key={c} type="button" aria-pressed={input.start === c} onClick={() => set("start", c)}>{c}</button>)}
          <select aria-label="其他出发城市" className={POPULAR.includes(input.start) ? "" : "picked"}
            value={POPULAR.includes(input.start) ? "" : input.start} onChange={(e) => e.target.value && set("start", e.target.value)}>
            <option value="">其他城市…</option>
            {others.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="date">哪天出发</label>
        <input id="date" type="date" value={input.startDate} onChange={(e) => e.target.value && set("startDate", e.target.value)} />
        {routeMode(input) === "season"
          ? <span className="hint">路线跟着季节走，会按出发日期重新安排，不用特意挑日子。</span>
          : <div className="best-dates">
          <span className="hint">季节最顺：</span>
          {best.map((b) => (
            <button key={b.date} type="button" aria-pressed={input.startDate === b.date} onClick={() => set("startDate", b.date)}
              title={`${b.good}/${b.total} 个停留点到达时当季`}>
              {b.date.slice(0, 4)} {shortDate(b.date)}
            </button>
          ))}
        </div>}
      </div>
      <div className="field">
        <span className="label">谁一起去</span>
        <div className="people">
          <Stepper id="adults-l" label="成人" value={input.adults} min={1} onChange={(v) => set("adults", v)} />
          <Stepper id="kids-l" label="儿童" value={input.kids} onChange={(v) => set("kids", v)} />
          <Toggle id="dog" label="带狗" checked={input.dog} onChange={(v) => set("dog", v)} />
        </div>
      </div>
      {input.dog && (
        <div className="field">
          <span className="label">狗的体型</span>
          <div className="seg-btns" role="group" aria-label="狗的体型">
            {(Object.keys(DOG_SIZE_LABEL) as (keyof typeof DOG_SIZE_LABEL)[]).map((k) => (
              <button key={k} type="button" aria-pressed={input.dogSize === k} onClick={() => set("dogSize", k)} title={DOG_SIZE_LABEL[k].hint}>
                {DOG_SIZE_LABEL[k].label}
              </button>
            ))}
          </div>
          <span className="hint">{DOG_SIZE_LABEL[input.dogSize].hint}。体型会影响能住的酒店和北京等地的规定。</span>
        </div>
      )}
    </>
  );
}

/** What the traveller changed by hand: skipped stops, drive-through segments, added places, chosen nights. */
function EditsSummary({ input, set, data }: { input: PlanInput; set: SetInput; data: Dataset }) {
  const name = (id: string) => data.nodes.find((n) => n.id === id)?.n ?? id;
  const segName = (k: string) => data.segs.find((s) => s.k === k)?.name ?? k;
  const nOver = Object.keys(input.nightsOverride).length;
  if (!input.skip.length && !input.skipSegs.length && !input.custom.length && !nOver) return null;
  return (
    <fieldset>
      <legend>你改过的地方</legend>
      <ul className="edits">
        {input.skip.map((id) => (
          <li key={id}>不去 <b>{name(id)}</b> <button type="button" className="link" onClick={() => set("skip", input.skip.filter((x) => x !== id))}>恢复</button></li>
        ))}
        {input.skipSegs.map((k) => (
          <li key={k}><b>{segName(k)}</b> {routeMode(input) === "season" ? "不去" : "只途经"} <button type="button" className="link" onClick={() => set("skipSegs", input.skipSegs.filter((x) => x !== k))}>恢复停留</button></li>
        ))}
        {input.custom.map((c) => (
          <li key={c.id}>加入 <b>{c.name}</b>（在{name(c.after)}之后，住 {c.nights} 晚） <button type="button" className="link" onClick={() => set("custom", input.custom.filter((x) => x.id !== c.id))}>删除</button></li>
        ))}
        {nOver > 0 && (
          <li>{nOver} 个地方手动设了住几晚 <button type="button" className="link" onClick={() => set("nightsOverride", {})}>全部恢复按节奏</button></li>
        )}
      </ul>
    </fieldset>
  );
}

export function BudgetField({ input, set }: { input: PlanInput; set: SetInput }) {
  return (
    <div className="field">
      <label htmlFor="budget">总预算（元）</label>
      <input id="budget" type="number" inputMode="numeric" step={10000} min={0} placeholder="不填则不限"
        value={input.budget ?? ""} onChange={(e) => set("budget", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
    </div>
  );
}

/** Loop or season order, with what each would mean for this trip. */
function RouteOrderField({ input, set, data }: { input: PlanInput; set: SetInput; data: Dataset }) {
  const mode = routeMode(input);
  const both = useMemo(() => (["season", "loop"] as const).map((o) => {
    const p = buildPlan(data, { ...input, routeOrder: o });
    return { o, km: p.totals.km, off: p.seasonScore.off, days: p.days };
  }), [data, input]);
  const label = { season: "跟着季节走", loop: "一条环线" } as const;
  return (
    <>
      <div className="field">
        <span className="label">路线顺序</span>
        <div className="seg-btns" role="group" aria-label="路线顺序">
          {both.map((b) => <button key={b.o} type="button" aria-pressed={mode === b.o} onClick={() => set("routeOrder", b.o)}>{label[b.o]}</button>)}
        </div>
        <ul className="route-compare small">
          {both.map((b) => (
            <li key={b.o} className={mode === b.o ? "on" : ""}>
              <b>{label[b.o]}</b>：{duration(b.days)}，开 {int(b.km)} km，{b.off} 站到达时不在最佳季节
            </li>
          ))}
        </ul>
        <p className="hint">
          跟着季节走：按段重新排先后，夏天去西藏、新疆、西北和东北，冬天在云南和华南，段与段之间开车转场。一条环线：沿全国大环线顺着走，路最顺。
          {input.routeOrder === "auto" ? "现在按节奏自动选择：打卡走环线，更慢的节奏跟着季节走。" : ""}
          {input.routeOrder !== "auto" && <button type="button" className="link" onClick={() => set("routeOrder", "auto")}>改回按节奏自动选择</button>}
        </p>
      </div>
      {mode === "loop" && (
        <>
          <Choice label="方向" value={input.direction} onChange={(v) => set("direction", v)}
            options={[["cw", "顺时针（推荐）"], ["ccw", "逆时针"]]} />
          <p className="hint">顺时针按季节排：春天江南华南，初夏进藏，盛夏新疆、青海和东北，秋天川西。</p>
        </>
      )}
    </>
  );
}

/** Going home for the Spring Festival every year the trip spans. */
function NewYearField({ input, set }: { input: PlanInput; set: SetInput }) {
  const ny = input.newYearHome;
  return (
    <div className="field new-year">
      <Toggle id="ny" label="过年回家" checked={ny != null} onChange={(v) => set("newYearHome", v ? { days: 14, mode: "fly" } : null)} />
      {ny && (
        <>
          <div className="people">
            <Stepper id="ny-days" label="在家住几天" value={ny.days} min={3} max={60} onChange={(v) => set("newYearHome", { ...ny, days: v })} />
          </div>
          <Choice label="怎么回" value={ny.mode} onChange={(v) => set("newYearHome", { ...ny, mode: v })}
            options={[["fly", "车停在当地，坐飞机"], ["drive", "开车回"]]} />
        </>
      )}
      <p className="hint">每年除夕前三天从当时所在的地方回家（春节日期按香港天文台公历农历对照表），住满天数后回到原地接着走；正在住的地方回来后接着住完。春运机票较贵，可在下面“回家机票”里调整。</p>
    </div>
  );
}

export function TripSettings({ input, set, setAll, data, today }: { input: PlanInput; set: SetInput; setAll: (next: PlanInput) => void; data: Dataset; today: string }) {
  const toggleInterest = (t: Interest) =>
    set("interests", input.interests.includes(t) ? input.interests.filter((x) => x !== t) : [...input.interests, t]);
  return (
    <form className="settings" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>出发</legend>
        <StartFields input={input} set={set} data={data} today={today} />
        <RouteOrderField input={input} set={set} data={data} />
        {input.dog && (
          <Choice label="景区不让带狗时" value={input.dogCare} onChange={(v) => set("dogCare", v)}
            options={[["rotate", "轮流陪狗"], ["boarding", "就近寄养"]]} />
        )}
      </fieldset>
      <EditsSummary input={input} set={set} data={data} />
      <fieldset>
        <legend>节奏与旅居</legend>
        <RhythmPicker input={input} data={data} onPick={setAll} />
        <RhythmFields input={input} set={set} />
        <NewYearField input={input} set={set} />
      </fieldset>
      <fieldset>
        <legend>预算</legend>
        <BudgetField input={input} set={set} />
        <p className="hint">超出预算时，在“费用”页签里会列出能省钱的调整，由你决定是否采用。</p>
      </fieldset>
      <fieldset>
        <legend>玩法</legend>
        <Choice label="节奏" value={input.pace} onChange={(v) => set("pace", v)}
          options={[["full", "完整"], ["highlights", "精华"], ["essentials", "极简"]]} />
        <div className="field">
          <span className="label">偏好（精华和极简会多保留这类地方）</span>
          <div className="seg-btns">
            {(Object.keys(INTEREST_LABEL) as Interest[]).map((t) => (
              <button key={t} type="button" aria-pressed={input.interests.includes(t)} onClick={() => toggleInterest(t)}>{INTEREST_LABEL[t]}</button>
            ))}
          </div>
        </div>
        <Choice label="景区等级" value={input.level} onChange={(v) => set("level", v)}
          options={[["all", "全部"], ["4A", "4A 及以上"], ["5A", "只看 5A"]]} />
        <Choice label="住宿" value={input.lodging} onChange={(v) => set("lodging", v)}
          options={[["budget", "车宿露营优先"], ["balanced", "均衡"], ["comfort", "全住酒店"]]} />
        <p className="hint">海拔 3500 米以上、当月平均最低气温低于 0℃ 的地方不露营不车宿，改住酒店；车里最多睡两个人。</p>
        <div className="row2">
          <Num id="maxh" label="每天最多开" unit="小时" value={input.maxDriveHours} step={0.5} min={3} onChange={(v) => set("maxDriveHours", Math.max(3, v))} />
        </div>
        <Toggle id="ex" label="包含单日往返（纳木错、雅丹、长城等）" checked={input.includeExcursions} onChange={(v) => set("includeExcursions", v)} />
      </fieldset>
      <fieldset>
        <legend>车</legend>
        <Choice label="动力" value={input.vehicle} onChange={(v) => set("vehicle", v)}
          options={[["phev", "插混/增程"], ["hev", "油电混动"], ["ice", "燃油"]]} />
        <div className="row2">
          <Num id="l100" label="油耗" unit="L/100km" step={0.1} value={input.lPer100} onChange={(v) => set("lPer100", v)} />
          {input.vehicle === "phev" && <Num id="ev" label="纯电续航" unit="km" step={10} value={input.evRangeKm} onChange={(v) => set("evRangeKm", v)} />}
          {input.vehicle === "phev" && <Num id="kwh" label="电耗" unit="kWh/100km" step={0.5} value={input.kwhPer100} onChange={(v) => set("kwhPer100", v)} />}
        </div>
      </fieldset>
    </form>
  );
}

export function MealsChoice({ input, set }: { input: PlanInput; set: SetInput }) {
  return (
    <Choice label="每天吃几顿" value={String(input.meals) as "1" | "2" | "3"} onChange={(v) => set("meals", Number(v) as 1 | 2 | 3)}
      options={[["1", "1 顿"], ["2", "2 顿"], ["3", "3 顿"]]} />
  );
}

/** The two inputs that decide most of the total: what you eat and where you sleep. */
export function EatSleepParams({ input, set, plan }: { input: PlanInput; set: SetInput; plan: Plan }) {
  const priced = plan.stops.filter((s) => s.foodPerPerson != null && s.nights > 0);
  const nights = priced.reduce((a, s) => a + s.nights, 0);
  const avgFood = nights ? priced.reduce((a, s) => a + s.foodPerPerson! * s.nights, 0) / nights : null;
  const hotelStops = plan.stops.filter((s) => s.sleep === "H" && s.nights > 0 && s.lodgingCost > 0);
  const hotelNights = hotelStops.reduce((a, s) => a + s.nights, 0);
  const avgHotel = hotelNights ? hotelStops.reduce((a, s) => a + s.lodgingCost, 0) / hotelNights : null;
  return (
    <div className="eat-sleep">
      <div className="es-col">
        <h3>吃</h3>
        <MealsChoice input={input} set={set} />
        <Choice label="怎么算" value={input.foodMode} onChange={(v) => set("foodMode", v)}
          options={[["manual", "我自己填每顿多少钱"], ["local", "按各地餐厅的真实价格"]]} />
        {input.foodMode === "manual" ? (
          <NumOpt id="meal" label="每人每顿大约" unit="元，按物价中等的地方填" step={5} value={input.foodPerMeal} onChange={(v) => set("foodPerMeal", v)} />
        ) : (
          <>
            <Choice label="档次" value={input.foodTier} onChange={(v) => set("foodTier", v)}
              options={(Object.keys(FOOD_TIER_LABEL) as (keyof typeof FOOD_TIER_LABEL)[]).map((k) => [k, FOOD_TIER_LABEL[k].label])} />
            <p className="hint">
              {input.meals === 1 ? "一顿按当地正餐人均" : `一顿正餐 + ${input.meals - 1} 顿快餐`}，取每站 5 公里内热门餐厅人均的{FOOD_TIER_LABEL[input.foodTier].hint.replace("当地餐厅人均的", "")}（高德地图）。
            </p>
          </>
        )}
        {avgFood != null && <p className="es-result">全程平均每人每天约 <b className="num">¥{Math.round(avgFood)}</b></p>}
      </div>
      <div className="es-col">
        <h3>住</h3>
        <NumOpt id="hotel" label="酒店民宿，每间每晚均价" unit="元" step={20} value={input.hotelPerRoom} onChange={(v) => set("hotelPerRoom", v)}
          placeholder="必填，没有可靠的公开房价" />
        <div className="row2">
          <NumOpt id="camp" label="营地每晚" unit="元" step={10} value={input.campPerNight} onChange={(v) => set("campPerNight", v)} />
          <NumOpt id="rent" label="旅居月租" unit="元/月" step={500} value={input.rentPerMonth} onChange={(v) => set("rentPerMonth", v)} placeholder="不填按酒店价" />
        </div>
        {avgHotel != null && <p className="es-result">全程平均每晚约 <b className="num">¥{Math.round(avgHotel)}</b></p>}
      </div>
      <div className="es-foot">
        <Toggle id="lp" label="酒店价和自己填的餐费，按各地物价折算（物价指数 = 当地餐厅人均 ÷ 全线中位数，限 0.5–2 倍）" checked={input.localPrice} onChange={(v) => set("localPrice", v)} />
      </div>
    </div>
  );
}

export function CostParams({ input, set, data }: { input: PlanInput; set: SetInput; data: Dataset }) {
  return (
    <div>
      <div className="cost-group">
        <h4>行 <span className="muted small">油价、过路费有公开来源，可按你的车和习惯修改</span></h4>
        <div className="cost-params">
          <div className="field">
            <label htmlFor="fuel">92# 油价（元/升）</label>
            <input id="fuel" type="number" inputMode="decimal" step={0.01} placeholder={`按各省限价，全国均价 ${data.fuelDefault}`}
              value={input.fuelPrice ?? ""} onChange={(e) => set("fuelPrice", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
          {input.vehicle === "phev" && <Num id="ep" label="充电价" unit="元/kWh" step={0.1} value={input.elecPrice} onChange={(v) => set("elecPrice", v)} />}
          <Num id="toll" label="过路费" unit="元/km" step={0.05} value={input.tollPerKm} onChange={(v) => set("tollPerKm", v)} />
          <Num id="local" label="停留日市内行驶（旅居等长住不计）" unit="km/天" step={5} value={input.localKmPerStayDay} onChange={(v) => set("localKmPerStayDay", v)} />
          <Num id="maint" label="保养" unit="元/万公里" step={100} value={input.maintenancePer10k} onChange={(v) => set("maintenancePer10k", v)} />
          <Num id="misc" label="停车杂费" unit="元/天" step={5} value={input.miscPerDay} onChange={(v) => set("miscPerDay", v)} />
        </div>
      </div>
      <div className="cost-group">
        <h4>其他 <span className="muted small">默认值是估计，请改成你的实际情况</span></h4>
        <div className="cost-params">
          {input.dog && <Num id="dogpd" label="狗粮等" unit="元/天" value={input.dogPerDay} onChange={(v) => set("dogPerDay", v)} />}
          {input.dog && <Num id="board" label="寄养" unit="元/天" step={10} value={input.boardingPerDay} onChange={(v) => set("boardingPerDay", v)} />}
          <Num id="flight" label="回家机票" unit="元/人/单程" step={100} value={input.flightPerPerson} onChange={(v) => set("flightPerPerson", v)} />
          <Num id="park" label="回家期间停车" unit="元/天" step={5} value={input.parkingPerDay} onChange={(v) => set("parkingPerDay", v)} />
        </div>
      </div>
    </div>
  );
}
