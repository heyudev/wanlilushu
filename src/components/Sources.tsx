import route from "../data/route.json";
import elevation from "../data/elevation.json";
import type { Dataset } from "../lib/types";

export function Sources({ data }: { data: Dataset }) {
  const conf = { high: 0, medium: 0, low: 0 };
  for (const a of data.attractions) conf[a.conf]++;
  const imgs = data.nodes.filter((n) => n.img);
  return (
    <div className="cols2">
      <div className="card">
        <h3>数据从哪来</h3>
        <ul>
          <li>里程、时长、高速里程：{route.legSource}。高速里程按道路编号（G1–G99、四位 G 编号、S1–S99）或名称含"高速"识别，是估算。</li>
          <li>海拔：{elevation.source}。</li>
          <li>路线页底图：高德地图（审图号见地图右下角）。</li>
          <li>景点门票、预约、宠物政策：2026-10-03 核查，共 {data.attractions.length} 条；官方来源 {conf.high} 条、OTA 或新闻 {conf.medium} 条、待核实 {conf.low} 条，每条都附原始链接。</li>
          <li>油价：各省 2026-09-24 调价后 92# 限价；充电价、过路费费率为区间估计，可在参数里改。</li>
          <li>美食人均、季节建议、住宿方式：经验估计，标注为 ≈，不是核查数据。</li>
        </ul>
        <p className="hint">景区票价、开放时间和边境政策经常调整，出发前用官方渠道再确认一遍。</p>
      </div>
      <div className="card">
        <h3>图片署名（Wikimedia Commons）</h3>
        <div className="credits">
          {imgs.map((n) => (
            <div key={n.id}>{n.n}：<a href={n.img!.page} target="_blank" rel="noreferrer">{n.img!.author || "佚名"}</a>，{n.img!.license}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
