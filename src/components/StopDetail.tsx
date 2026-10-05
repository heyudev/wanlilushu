import { campsites } from "../lib/data";
import { attractionPrice } from "../lib/costs";
import { monthOf, shortDate } from "../lib/dates";
import { int, km, yuan } from "../lib/format";
import { SEASON_LABEL } from "../lib/season";
import type { Attraction, Dataset, DogSize, HomeBreak, PetFriendly, Plan, PlanInput, Stop } from "../lib/types";
import { wgsToGcj } from "../lib/coords";
import { nightsFor } from "../lib/plan";
import { ClimateBars } from "./ClimateBars";
import { comfortLabel } from "../lib/comfort";

export const SLEEP_LABEL = { H: "住酒店", C: "露营", V: "车宿", R: "月租长住" } as const;
const CONF_LABEL = { high: "官方", medium: "OTA/新闻", low: "待核实" } as const;

export function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "来源"; }
}

export function SourceLinks({ src }: { src: string[] }) {
  return <span className="srcs">{src.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{host(u)}</a>)}</span>;
}

function AttractionItem({ a, month }: { a: Attraction; month: number }) {
  const p = attractionPrice(a, month);
  const extras = a.extras.filter((e) => e.price != null);
  const pets = a.pets.includes("禁止") ? "off" : a.pets.includes("允许") ? "good" : "";
  return (
    <li className="attr">
      <div className="attr-top">
        <b>{a.name}</b>
        {a.level && <span className="chip">{a.level}</span>}
        <span className="attr-price num">{p == null ? "票价待核实" : p === 0 ? "免费" : `约 ¥${int(p)}/人`}</span>
      </div>
      <div className="attr-meta">
        {a.peak != null && a.peak > 0 && <span>门票 ¥{a.peak}{a.off != null && a.off !== a.peak && ` / 淡季 ¥${a.off}`}</span>}
        {extras.map((e) => <span key={e.item}>{e.item} ¥{e.price}</span>)}
        <span className={`chip ${pets}`}>{pets === "off" ? "禁止宠物" : pets === "good" ? a.pets : "宠物政策未查到"}</span>
        <span className={`conf ${a.conf}`}>{CONF_LABEL[a.conf]}</span>
        <SourceLinks src={a.src} />
      </div>
      {(a.reserve || a.note || a.open) && (
        <details className="more">
          <summary>预约、开放时间与说明</summary>
          {a.reserve && <p>预约：{a.reserve}</p>}
          {a.open && <p>开放：{a.open}</p>}
          {a.discounts && <p>优惠：{a.discounts}</p>}
          {a.note && <p>{a.note}</p>}
          {a.checked && <p className="muted">核查于 {a.checked}</p>}
        </details>
      )}
    </li>
  );
}

/** Live AMap search around a place (GCJ-02 centre), opening the app on phones. */
function amapSearch(keyword: string, ll: [number, number]) {
  const [lon, lat] = wgsToGcj(ll[1], ll[0]);
  return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&center=${lon.toFixed(6)},${lat.toFixed(6)}&view=map&src=wanlilushu&coordinate=gaode&callnative=1`;
}

function PetBlock({ pet, size, ll }: { pet: PetFriendly; size: DogSize; ll: [number, number] }) {
  const row = (label: string, p: PetFriendly["hotels"], keyword: string) => (
    <li><b>{label}</b> <span className="num">{p.count}</span> 家 <a href={amapSearch(keyword, ll)} target="_blank" rel="noreferrer">在高德地图中查看</a></li>
  );
  return (
    <section>
      <h3>带狗方便吗</h3>
      <ul className="pet-list small">
        {row("可带宠物的酒店民宿", pet.hotels, "可带宠物酒店")}
        {row("宠物餐厅、狗咖", pet.dining, "宠物餐厅")}
        {row("宠物医院", pet.vets, "宠物医院")}
      </ul>
      <p className="hint">
        高德地图 15 公里内关键词检索（{pet.checked}），用于比较各地。
        {size === "small" ? "" : `${size === "large" ? "大型犬" : "中型犬"}能否入住要提前问清，很多店只收小型犬。`}
      </p>
    </section>
  );
}

function HomeBreakControl({ s, plan, onBreaks }: { s: Stop; plan: Plan; onBreaks: (b: HomeBreak[]) => void }) {
  const cur = plan.input.breaks.find((b) => b.after === s.node.id);
  const others = plan.input.breaks.filter((b) => b.after !== s.node.id);
  const setB = (b: HomeBreak | null) => onBreaks(b ? [...others, b] : others);
  return (
    <section className="home-break">
      <h3>在这里回家一趟</h3>
      {cur ? (
        <div className="hb-row">
          <label>住满后回家
            <input type="number" min={1} max={365} value={cur.days} onChange={(e) => e.target.value && setB({ ...cur, days: Math.max(1, Number(e.target.value)) })} /> 天
          </label>
          <select aria-label="回家方式" value={cur.mode} onChange={(e) => setB({ ...cur, mode: e.target.value as HomeBreak["mode"] })}>
            <option value="drive">开车回去</option>
            <option value="fly">车停这里，坐飞机回去</option>
          </select>
          <button type="button" className="link" onClick={() => setB(null)}>取消</button>
        </div>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setB({ after: s.node.id, days: 30, mode: "drive" })}>从这里回家，之后再回来接着走</button>
      )}
      {cur && plan.input.dog && cur.mode === "fly" && <p className="hint">带狗坐飞机需要托运，手续多、风险大，带狗建议开车回去。</p>}
    </section>
  );
}

const REPO = "https://github.com/heyudev/wanlilushu";

/** Open the place in the AMap app or web (GCJ-02 coordinates, as the URI API expects). */
function amapLinks(name: string, ll: [number, number]) {
  const [lon, lat] = wgsToGcj(ll[1], ll[0]);
  const n = encodeURIComponent(name);
  return {
    marker: `https://uri.amap.com/marker?position=${lon.toFixed(6)},${lat.toFixed(6)}&name=${n}&coordinate=gaode&callnative=1`,
    nav: `https://uri.amap.com/navigation?to=${lon.toFixed(6)},${lat.toFixed(6)},${n}&mode=car&coordinate=gaode&callnative=1`,
  };
}

type SetInput = <K extends keyof PlanInput>(k: K, v: PlanInput[K]) => void;

function EditStop({ s, plan, set, onAddAfter, onSkipped }: {
  s: Stop; plan: Plan; set: SetInput; onAddAfter: (id: string) => void; onSkipped: (name: string) => void;
}) {
  const input = plan.input;
  const id = s.node.id;
  const chosen = input.nightsOverride[id];
  const setNights = (v: number | null) => {
    const next = { ...input.nightsOverride };
    if (v == null) delete next[id]; else next[id] = Math.max(1, Math.min(120, v));
    set("nightsOverride", next);
  };
  const isEntry = plan.stops[0].node.id === id;
  return (
    <section className="edit-stop">
      <h3>调整这一站</h3>
      {!s.transit && (
        <div className="es-row">
          <span>住</span>
          <button type="button" className="icon-btn" aria-label="少住一晚" onClick={() => setNights((chosen ?? s.nights) - 1)} disabled={(chosen ?? s.nights) <= 1}>−</button>
          <b className="num">{chosen ?? s.nights}</b>
          <button type="button" className="icon-btn" aria-label="多住一晚" onClick={() => setNights((chosen ?? s.nights) + 1)}>+</button>
          <span>晚</span>
          {chosen != null && <button type="button" className="link" onClick={() => setNights(null)}>恢复按节奏（{nightsFor({ ...s.node }, { ...input, nightsOverride: {} })} 晚起）</button>}
        </div>
      )}
      <div className="es-row wrap">
        {!isEntry && !s.node.custom && (
          <button type="button" className="btn ghost" onClick={() => { set("skip", [...input.skip, id]); onSkipped(s.node.n); }}>不去这一站</button>
        )}
        {s.node.custom && (
          <button type="button" className="btn ghost" onClick={() => { set("custom", input.custom.filter((c) => c.id !== id)); onSkipped(s.node.n); }}>删除这个地方</button>
        )}
        <button type="button" className="btn ghost" onClick={() => onAddAfter(id)}>在这一站之后加一个地方</button>
      </div>
    </section>
  );
}

export function StopDetail({ s, plan, data, set, onAddAfter, onSkipped }: {
  s: Stop; plan: Plan; data: Dataset; set: SetInput; onAddAfter: (id: string) => void; onSkipped: (name: string) => void;
}) {
  const onBreaks = (b: HomeBreak[]) => set("breaks", b);
  const links = amapLinks(s.node.n.split(" · ")[0], s.node.ll);
  const n = s.node;
  const month = monthOf(s.date);
  const camps = campsites.filter((c) => c.node === n.id);
  const i = plan.stops.indexOf(s);
  const legIn = i > 0 ? plan.legs[i - 1] : null;
  return (
    <div className="stop-detail">
      {n.img && (
        <figure className="hero-img">
          <img src={n.img.src} alt={n.n} width={640} height={400} />
          <figcaption>
            {n.img.generic && "区域示意 · "}<a href={n.img.page} target="_blank" rel="noreferrer">{n.img.author || "Wikimedia Commons"}</a> · {n.img.license}
          </figcaption>
        </figure>
      )}
      <div className="sd-head">
        <span className="muted">{n.p}{n.alt != null && ` · 海拔 ${int(n.alt)}m`}</span>
        <div className="chips">
          <span className="chip date">{shortDate(s.date)} 到</span>
          {s.nights > 0 && <span className="chip">住 {s.nights} 晚 · {SLEEP_LABEL[s.sleep]}</span>}
          {s.transit && <span className="chip">途中过夜</span>}
          {!s.transit && <span className={`chip ${s.season}`}>{SEASON_LABEL[s.season]} · 最佳 {n.best.join("/")} 月</span>}
          {s.sojourn && <span className="chip sojourn">旅居</span>}
          {s.comfortStay && <span className="chip good">气候舒服，多住几天</span>}
          {s.waitDays > 0 && <span className="chip ok">等季节 {s.waitDays} 天</span>}
          {s.comfort != null && <span className="chip">{monthOf(s.date)} 月气候{comfortLabel(s.comfort)}</span>}
        </div>
        {legIn && (
          <p className="small muted">
            {legIn.ferryKm > 0 ? "坐渤海轮渡抵达" : `从上一站开 ${km(legIn.km)}，约 ${legIn.h.toFixed(1)} 小时`}
            {legIn.toll > 0 && `，过路费约 ${yuan(legIn.toll)}`}
          </p>
        )}
      </div>
      <div className="nav-links">
        <a className="btn" href={links.nav} target="_blank" rel="noreferrer">高德导航到这里</a>
        <a className="btn ghost" href={links.marker} target="_blank" rel="noreferrer">在高德地图中查看</a>
      </div>
      {n.custom && <p className="hint">这是你加入的地方，里程和过路费来自高德驾车路线；没有景点、美食和气候数据。</p>}
      {n.about && <p className="sd-about">{n.about}</p>}
      {n.tip && <p className="sd-tip">{n.tip}</p>}
      {plan.input.dog && (n.dog || s.petBanned) && (
        <p className="dogline">
          {n.dog}{s.petBanned && !n.dog && `这里有禁宠或宠物政策未查到的收费景区，${plan.input.dogCare === "boarding" ? "已按寄养计费" : "安排一人陪狗或就近寄养"}。`}
        </p>
      )}
      {s.attractions.length > 0 && (
        <section>
          <h3>景点与门票</h3>
          <ul className="attrs">{s.attractions.map((a) => <AttractionItem key={a.name} a={a} month={month} />)}</ul>
        </section>
      )}
      {s.excursions.length > 0 && (
        <section>
          <h3>单日往返</h3>
          <p className="small">{s.excursions.map((e) => `${e.name}（往返 ${km(e.km)}）`).join("、")}</p>
        </section>
      )}
      {n.food.length > 0 && !s.transit && (
        <section>
          <h3>吃什么 <span className="muted small">人均为经验估计</span></h3>
          <ul className="foods">
            {n.food.map((f) => <li key={f[0]}><b>{f[0]}</b> <span className="num muted">≈¥{f[2]}</span>{f[1] && <div className="muted small">{f[1]}</div>}</li>)}
          </ul>
        </section>
      )}
      {camps.length > 0 && (
        <section>
          <h3>营地线索</h3>
          {camps.map((c) => (
            <p key={c.name} className="small">{c.name}{c.location && ` · ${c.location}`}{c.price != null && ` · ${c.price}`}{c.note && <span className="muted">（{c.note}）</span>} {c.src && <SourceLinks src={c.src} />}</p>
          ))}
        </section>
      )}
      {data.climate[n.id] && (
        <section>
          <h3>一年里的气候</h3>
          <ClimateBars months={data.climate[n.id]} current={monthOf(s.date)} />
        </section>
      )}
      {plan.input.dog && data.pet[n.id] && <PetBlock pet={data.pet[n.id]} size={plan.input.dogSize} ll={n.ll} />}
      {n.base && (
        <section>
          <h3>适合长住</h3>
          <p className="small">这里有租房、超市、医院等住一两周以上的条件。</p>
        </section>
      )}
      <EditStop s={s} plan={plan} set={set} onAddAfter={onAddAfter} onSkipped={onSkipped} />
      {!s.transit && <HomeBreakControl s={s} plan={plan} onBreaks={onBreaks} />}
      {s.attractions.length > 0 && (
        <p className="hint">
          价格或规定变了？<a href={`${REPO}/issues/new?labels=data-refresh&title=${encodeURIComponent(`数据更新：${n.n}`)}&body=${encodeURIComponent(`地点：${n.n}（${n.id}）

哪条信息变了：

现在的情况（价格、开放时间、宠物政策等）：

来源链接：
`)}`} target="_blank" rel="noreferrer">告诉我们</a>（需要 GitHub 账号）
        </p>
      )}
      {data.prices[s.priceFrom ?? n.id] && s.foodPerPerson != null && (
        <section>
          <h3>当地物价</h3>
          <p className="small">
            {s.priceFrom ? `这里餐厅价格数据不足，参考${data.nodes.find((x) => x.id === s.priceFrom)?.n}：` : ""}
            正餐人均中位数 ¥{data.prices[s.priceFrom ?? n.id].meal.p50}（{data.prices[s.priceFrom ?? n.id].meal.p25}–{data.prices[s.priceFrom ?? n.id].meal.p75}），
            简餐 ¥{data.prices[s.priceFrom ?? n.id].quick.p50 ?? "—"}；按你的档次每人每天约 ¥{Math.round(s.foodPerPerson)}。
            <span className="muted">高德地图 5 公里内热门 {data.prices[s.priceFrom ?? n.id].meal.n} 家餐厅，{data.prices[s.priceFrom ?? n.id].checked} 查询。</span>
          </p>
        </section>
      )}
      <p className="small muted">
        本站费用：{s.lodgingCost > 0 && `住宿约 ${yuan(s.lodgingCost)}`}{s.lodgingCost > 0 && s.ticketCost > 0 && "，"}{s.ticketCost > 0 && `门票约 ${yuan(s.ticketCost)}`}{s.lodgingCost + s.ticketCost === 0 && "无"}
      </p>
    </div>
  );
}
