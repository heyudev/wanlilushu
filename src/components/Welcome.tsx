import type { Dataset, PlanInput } from "../lib/types";
import { useState } from "react";
import { MealsChoice, StartFields, type SetInput } from "./TripSettings";
import { RhythmPicker } from "./RhythmPicker";
import { int } from "../lib/format";

// a few places from along the loop: north, west, plateau, south, east
const GALLERY = ["kanas", "lasa", "dali", "dunhuang", "yangshuo", "huangshan"];

function Gallery({ data }: { data: Dataset }) {
  const nodes = GALLERY.map((id) => data.nodes.find((n) => n.id === id)).filter((n) => n?.img);
  return (
    <div className="gallery" aria-label="沿途风景">
      {nodes.map((n) => (
        <figure key={n!.id}>
          <img src={n!.img!.src} alt={n!.n} loading="eager" width={640} height={480} />
          <figcaption><b>{n!.n.split(" · ")[0]}</b><span>{n!.img!.author || "Wikimedia Commons"} · {n!.img!.license}</span></figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Welcome({ input, set, setAll, data, today, onStart }: {
  input: PlanInput; set: SetInput; setAll: (next: PlanInput) => void; data: Dataset; today: string; onStart: () => void;
}) {
  const loopKm = data.legs.reduce((s, l) => s + l.km, 0);
  const [askHotel, setAskHotel] = useState(false);
  const submit = () => {
    if (input.hotelPerRoom == null && !askHotel) { setAskHotel(true); return; }
    onStart();
  };
  const provinces = new Set(data.nodes.flatMap((n) => n.p.split("/"))).size;
  return (
    <div className="welcome">
      <Gallery data={data} />
      <div className="welcome-card">
        <div className="eyebrow">wanlilushu.cn</div>
        <h1>万里路书</h1>
        <p className="lede">一条约 {int(Math.round(loopKm / 1000) * 1000)} 公里、经过 {provinces} 个省区市、{data.nodes.length} 个城镇村落与风景地的全国自驾环线，{data.roads.length} 条风景道串在其中。可以几个月走完，也可以慢慢走一两年，在舒服的地方住下来生活一段。</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
      </div>
    </div>
  );
}
