import { policy } from "../lib/data";
import type { Dataset, PolicyItem } from "../lib/types";

const CONF_LABEL = { high: "官方来源", medium: "OTA/新闻", low: "待核实" } as const;

function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "来源"; }
}

function PolicyRow({ p }: { p: PolicyItem }) {
  return (
    <div className="policy">
      {p.title && <b>{p.title}</b>}
      <div>{p.finding}</div>
      <div className="small" style={{ marginTop: 3 }}>
        <span className={`conf ${p.conf}`}>{CONF_LABEL[p.conf] ?? p.conf}</span>{" "}
        {p.checked && <span className="muted">核查于 {p.checked} · </span>}
        <span className="srcs">{p.src.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{host(u)}</a>)}</span>
      </div>
    </div>
  );
}

const GROUPS: { title: string; keys: (p: PolicyItem) => boolean }[] = [
  { title: "边境管理区通行证与进藏", keys: (p) => p.key.startsWith("tibet") || (p.key === "road" && /边防|边境|通行证/.test(p.topic ?? p.finding)) },
  { title: "道路与季节", keys: (p) => (p.key === "road" && !/边防|边境|通行证/.test(p.topic ?? p.finding)) || p.key.startsWith("g318") },
  { title: "油、电与过路费", keys: (p) => /fuel|charging|toll|holiday/.test(p.key) },
  { title: "新疆", keys: (p) => p.key.startsWith("xinjiang") },
  { title: "带狗相关法规", keys: (p) => /dog|beijing|service_area/.test(p.key) },
  { title: "海南轮渡（冬季扩展）", keys: (p) => p.key.startsWith("qiongzhou") },
];

export function PolicyGuide() {
  return (
    <div className="cols2">
      {GROUPS.map((g) => {
        const items = policy.filter(g.keys);
        if (!items.length) return null;
        return (
          <div className="card" key={g.title}>
            <h3>{g.title}</h3>
            {items.map((p, i) => <PolicyRow key={i} p={p} />)}
          </div>
        );
      })}
    </div>
  );
}

export function DogGuide({ data }: { data: Dataset }) {
  const banned = data.attractions.filter((a) => a.pets.includes("禁止"));
  return (
    <div className="cols2">
      <div className="card">
        <h3>出发前</h3>
        <ul>
          <li>带狗去宠物医院体检，补齐狂犬疫苗和体内外驱虫，拿到纸质免疫证明。</li>
          <li>在出发地申报《动物检疫合格证明》（规定和有效期见右侧法规，跨省运输犬只依法需要）。</li>
          <li>给狗戴写有手机号的狗牌，最好再加一个 GPS 定位器。</li>
          <li>先做两三次 300km 以上的短途自驾，看狗晕不晕车、能不能在车里安静睡觉。</li>
        </ul>
      </div>
      <div className="card">
        <h3>路上</h3>
        <ul>
          <li>不要把狗单独留在停着的车里，晴天车内温度会很快升高；吐鲁番、南疆夏天尤其危险。</li>
          <li>每 2 小时在服务区边缘空地遛一次，牵绳、捡便便。</li>
          <li>草原牧区一定牵绳：别让狗追牛羊，牧民的看家狗也可能冲过来。</li>
          <li>高原上狗也会高反：上升慢一点，减少奔跑，留意呼吸急促、呕吐、不吃东西，出现就往低处走。</li>
          <li>订酒店前确认"可携带宠物"，并写明狗的体型；很多酒店只收小型犬。露营和车宿最自由。</li>
        </ul>
      </div>
      <div className="card">
        <h3>景区</h3>
        <p className="small">大多数收费景区、国家公园和博物馆不允许带宠物入内。本次核查中有明确禁止条文的景区：</p>
        <p className="small">{banned.map((a) => a.name).join("、") || "暂无"}</p>
        <p className="hint">其余景区大多没查到明文规定，规划里按"不能带"估算。到景区可以问有没有宠物寄存，或两人轮流游览。</p>
      </div>
      <div className="card">
        <h3>法规原文摘录</h3>
        {policy.filter((p) => /dog|beijing|xinjiang_animal|service_area/.test(p.key)).map((p, i) => <PolicyRow key={i} p={p} />)}
      </div>
    </div>
  );
}

export function VehicleGuide() {
  return (
    <div className="cols2">
      <div className="card">
        <h3>混动车怎么补能</h3>
        <ul>
          <li>东部、中部、成渝：每晚尽量住带充电桩的酒店或用目的地慢充，白天先用电。</li>
          <li>西藏、阿里、南疆、青海腹地：充电桩少，低温还会掉电，按燃油车来开，油量保持在一半以上，见站就加。</li>
          <li>新藏线叶城—狮泉河之间补给点很少，在叶城、狮泉河务必加满。</li>
          <li>新疆加油通常要刷身份证、人脸识别，司机本人到场，排队时间算进行程。</li>
        </ul>
      </div>
      <div className="card">
        <h3>高原与山路</h3>
        <ul>
          <li>海拔升高后发动机功率下降，超车多留距离。</li>
          <li>长下坡（怒江 72 拐、二郎山、巴朗山）挂低挡、用动能回收，不要一路踩刹车。</li>
          <li>每天早上冷车检查胎压，海拔和昼夜温差会让胎压变化明显。</li>
          <li>很多混动车只配补胎液，不带全尺寸备胎；走新藏线、阿里前考虑加一条备胎。</li>
          <li>低温时 12V 小电瓶容易亏电，随车带应急启动电源。</li>
        </ul>
      </div>
      <div className="card">
        <h3>保养节奏</h3>
        <ul>
          <li>出发前做全车保养：机油、三滤、刹车片、轮胎、冷却液、玻璃水换防冻型。</li>
          <li>行程里每 1 万公里左右保养一次，正好落在昆明、拉萨、乌鲁木齐、哈尔滨、西安、成都这些大城市。</li>
          <li>进藏前在昆明或成都再做一次刹车和底盘检查。</li>
        </ul>
      </div>
      <div className="card">
        <h3>中途离开怎么办</h3>
        <ul>
          <li>假期不够可以分段走：把车停在机场长期停车场，飞回家，下次飞回来接着开。</li>
          <li>每一段都从大城市开始和结束（上海、广州、昆明、拉萨、乌鲁木齐、西宁、哈尔滨、北京、西安、成都），方便航班衔接。</li>
        </ul>
      </div>
    </div>
  );
}

const WINTER: [string, string, string][] = [
  ["海南环岛", "11–3 月", "从广州经徐闻港坐琼州海峡轮渡带车上岛；三亚、万宁、文昌。"],
  ["西双版纳", "11–3 月", "从昆明到景洪约 534km（OSRM），热带雨林与傣族村寨。"],
  ["元阳梯田", "12–3 月", "灌水季日出最好，从昆明约 281km（OSRM）。"],
  ["罗平油菜花", "2–3 月", "从昆明约 221km（OSRM），九龙瀑布同游。"],
  ["哈尔滨冰雪与雪乡", "12–2 月", "冰雪大世界、雪乡；冬季东北需雪地胎。"],
  ["额济纳胡杨林", "10 月上中旬", "金色胡杨只有两三周，从张掖约 569km（OSRM）。"],
  ["林芝桃花", "3–4 月", "可以和滇藏线反向衔接。"],
  ["婺源、篁岭晒秋", "10–11 月", "秋季版江南。"],
];

export function WinterList() {
  return (
    <div className="tablewrap card">
      <table className="t">
        <thead><tr><th>目的地</th><th>季节</th><th>怎么接</th></tr></thead>
        <tbody>{WINTER.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table>
      <p className="hint">这些地方的季节窗口和主环线冲突，单独作为冬季或秋季短线；里程为 OSRM 单程估算，票价未核查。</p>
    </div>
  );
}
