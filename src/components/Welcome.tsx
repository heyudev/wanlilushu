import type { Dataset, PlanInput, RouteNode as Node } from "../lib/types";
import { useEffect, useState } from "react";
import { MealsChoice, StartFields, type SetInput } from "./TripSettings";
import { RhythmPicker } from "./RhythmPicker";
import { int } from "../lib/format";

// large photos in public/hero/, fetched by scripts/fetch_hero.py (keep the two lists in sync)
const HERO = ["xinduqiao", "yuanyang", "luoping", "zhangye", "nalati", "dingri"];
// one photo per segment, picked by hand for the photo itself rather than the place's rank
const SEG_COVER: Record<string, string> = {
  A: "wuyuan", B: "tulou", C: "yangshuo", D: "yuanyang", E: "linzhi", F: "dingri", G: "taqin", H: "taxian", I: "nalati",
  J: "zhangye", K: "wuwei", L: "hailaer", M: "jingpohu", N: "beijing", O: "hukou", P: "xinduqiao", Q: "zhangjiajie",
};
const SLIDE_MS = 7000;

const CN = "零一二三四五六七八九";
/** 17 → 十七, 23 → 二十三 (titles only, n < 100) */
const cnNum = (n: number) => n < 10 ? CN[n] : `${n >= 20 ? CN[Math.floor(n / 10)] : ""}十${n % 10 ? CN[n % 10] : ""}`;

const placeName = (n: Node) => n.n.split(" · ")[0];
/** "贡嘎山 · 新都桥": what the photo shows, then the stop, unless they are the same */
const photoCaption = (n: Node) => {
  const t = n.img?.title?.replace(/(县|市)$/, "");
  return t && !n.n.includes(t) ? `${t} · ${placeName(n)}` : placeName(n);
};

function Hero({ data, onPlan }: { data: Dataset; onPlan: () => void }) {
  const slides = HERO.map((id) => data.nodes.find((n) => n.id === id)).filter((n): n is Node => !!n?.img);
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setI((x) => (x + 1) % slides.length); }, SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);
  const loopKm = data.legs.reduce((s, l) => s + l.km, 0);
  const provinces = new Set(data.nodes.flatMap((n) => n.p.split("/"))).size;
  const cur = slides[i];
  return (
    <section className="w-hero" aria-label="万里路书">
      <div className="hero-slides">
        {slides.map((n, k) => (
          <img key={n.id} className={k === i ? "on" : undefined} alt={k === i ? photoCaption(n) : ""}
            src={`hero/${n.id}-1920.webp`} srcSet={`hero/${n.id}-960.webp 960w, hero/${n.id}-1920.webp 1920w`} sizes="100vw"
            loading={k === 0 ? "eager" : "lazy"} fetchPriority={k === 0 ? "high" : "low"} />
        ))}
      </div>
      <div className="hero-text">
        <p className="hero-verse">读万卷书 · 行万里路</p>
        <h1>万里路书</h1>
        <p className="hero-lede">
          一条环线，走过{provinces}个省区市的山河、古镇与人间烟火。可以几个月走完，也可以慢慢走一两年，在喜欢的地方住下来。
        </p>
        <dl className="hero-stats">
          <div><dt>公里</dt><dd>{int(Math.round(loopKm / 1000) * 1000)}</dd></div>
          <div><dt>城镇村落与风景</dt><dd>{data.nodes.length}</dd></div>
          <div><dt>风景道</dt><dd>{data.roads.length}</dd></div>
        </dl>
        <button type="button" className="btn hero-cta" onClick={onPlan}>规划我的旅程</button>
      </div>
      {cur && (
        <div className="hero-foot">
          <div className="hero-dots" role="group" aria-label="切换照片">
            {slides.map((n, k) => (
              <button key={n.id} type="button" aria-label={photoCaption(n)} aria-pressed={k === i} onClick={() => setI(k)} />
            ))}
          </div>
          <p className="hero-credit">
            <b>{photoCaption(cur)}</b>
            <a href={cur.img!.page} target="_blank" rel="noreferrer">{cur.img!.author || "Wikimedia Commons"} · {cur.img!.license}</a>
          </p>
        </div>
      )}
    </section>
  );
}

function Segments({ data }: { data: Dataset }) {
  return (
    <section className="w-segs" aria-labelledby="w-segs-title">
      <header className="w-head">
        <h2 id="w-segs-title">一路{cnNum(data.segs.length)}段</h2>
        <p>从江南水乡出发，经闽粤山海、云贵高原、雪域西藏、天山南北、河西走廊、林海雪原，再回到中原古都。</p>
      </header>
      <ol className="seg-strip">
        {data.segs.map((s) => {
          const n = data.nodes.find((x) => x.id === SEG_COVER[s.k]) ?? data.nodes.find((x) => x.seg === s.k && x.img);
          return (
            <li key={s.k}>
              {n?.img && <img src={n.img.src} alt={photoCaption(n)} title={`${photoCaption(n)}　${n.img.author || "Wikimedia Commons"} · ${n.img.license}`} loading="lazy" width={640} height={427} />}
              <div className="seg-card-text">
                <span className="seg-card-k">{s.k}</span>
                <b>{s.name}</b>
                <span>{s.range}</span>
                <small>{s.season}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Welcome({ input, set, setAll, data, today, onStart }: {
  input: PlanInput; set: SetInput; setAll: (next: PlanInput) => void; data: Dataset; today: string; onStart: () => void;
}) {
  const [askHotel, setAskHotel] = useState(false);
  const submit = () => {
    if (input.hotelPerRoom == null && !askHotel) { setAskHotel(true); return; }
    onStart();
  };
  const toPlan = () => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" });
  return (
    <div className="welcome">
      <Hero data={data} onPlan={toPlan} />
      <Segments data={data} />
      <section id="plan" className="w-plan" aria-labelledby="w-plan-title">
        <header className="w-head">
          <h2 id="w-plan-title">启程</h2>
          <p>从哪里出发、什么时候走、和谁一起、走多慢。路书会排好每一天，算好每一笔。</p>
        </header>
        <form className="w-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <StartFields input={input} set={set} data={data} today={today} />
          <RhythmPicker input={input} data={data} onPick={setAll} />
          <MealsChoice input={input} set={set} />
          <div className="field">
            <label htmlFor="w-hotel">住酒店民宿，一间一晚大概多少钱</label>
            <input id="w-hotel" type="number" inputMode="numeric" step={50} min={0} placeholder="按物价中等的地方填，用来估算各地住宿费"
              value={input.hotelPerRoom ?? ""} onChange={(e) => set("hotelPerRoom", e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
          </div>
          {askHotel && input.hotelPerRoom == null && (
            <p className="ask-hotel">没有可靠的公开房价可查，不填的话总花费里不含住宿。可以先填一个大概的数，之后在“费用”页随时修改。</p>
          )}
          <button type="submit" className="btn big">{askHotel && input.hotelPerRoom == null ? "先不填，生成路书" : "生成我的路书"}</button>
        </form>
      </section>
      <footer className="w-foot">
        照片来自 Wikimedia Commons，作者与许可见每张照片；地图由高德地图提供。
        <a href="https://github.com/heyudev/wanlilushu" target="_blank" rel="noreferrer">开源代码</a>
      </footer>
    </div>
  );
}
