# 万里路书

全国自驾环线规划：https://wanlilushu.cn

内置一条约 3.6 万公里的全国自驾环线，经过 30 个省级行政区、157 个城镇村落与风景地，19 条风景道串在其中。选择出发城市、出发日期、同行的人（是否带狗、狗的体型）和旅行节奏后，生成每日行程、花费和出发前需要知道的事。可以几个月走完，也可以慢慢走一两年，在气候舒服的地方住下来。

## 功能

- **节奏**：打卡、慢游、深度慢游、慢游 + 旅居四档，可自定义每个地方住多久、舒服的地方多住几晚、隔多久旅居一次。进西藏、新疆、川西、东北极北等有季节窗口的区域前，季节不对时可在前一个旅居地多住等待。
- **改路线**：跳过某一站，某一段只途经不停留，修改某站住几晚，在任意一站后加入自己想去的地方（高德地点搜索与驾车路线），在任意一站后插入回家。
- **地图**：高德地图，标准图与卫星图；起终点、站点类型、行驶方向、风景道、高海拔山口、单日往返，可分图层开关；每站可直接打开高德导航。
- **行程**：按站点或按月查看；每站有历史文化介绍、景点门票与预约方式、当地美食、逐月气候、带狗的便利程度（附近可带宠物的酒店、宠物餐厅、宠物医院数量）。
- **旅居**：36 个适合长住的地方按月比较气候舒适度和带狗便利程度。
- **费用**：餐饮按每天几顿和各地真实餐厅人均计算，或按自己填的每顿花费；住宿按自己填的均价，可按各地物价折算；油费、充电、过路费、门票、狗、回家往返；可设总预算并查看省钱选项。
- **出发准备**：边境管理区通行证、季节性道路、长途驾驶、高海拔、带狗法规等提醒，装备清单。
- **分享与导出**：分享链接（方案编码在网址里），导出 Markdown 笔记、GPX 轨迹。

## 运行

需要 Node.js 22（`.node-version`）。复制 `.env.example` 为 `.env` 并填入高德开放平台的 Key：

| 变量 | 高德控制台的服务平台 | 用途 |
|---|---|---|
| `VITE_AMAP_JS_KEY`、`VITE_AMAP_JS_SECURITY_CODE` | Web端（JS API） | 网页上的地图、地点搜索和驾车路线；会打包进网页，需在控制台设置域名白名单 |
| `AMAP_WEB_KEY`、`AMAP_WEB_SECRET` | Web服务 | 只给 `scripts/` 里的数据脚本用，不打包进网页 |

不配置 Key 时，除地图和加入地点外的功能都能使用。

```bash
npm install
npm run dev        # http://localhost:5180
npm test           # 单元测试
npm run build      # 类型检查并打包到 dist/
```

## 部署

打包结果是静态文件。线上站点部署在 Cloudflare Pages：

```bash
npx wrangler login      # 首次使用
npm run deploy:cf       # 测试、打包（读取本地 .env）、上传到 Pages 项目 wanlilushu
```

`public/_headers` 设置静态资源缓存。高德 Web端 Key 的域名白名单需包含站点域名。

## 数据

### 文件

| 位置 | 内容 | 维护方式 |
|---|---|---|
| `data/route.json` | 分段、过夜点、住几晚、最佳月份、美食、历史文化介绍、带狗说明 | 人工编辑 |
| `data/roads.json` | 风景道 | 人工编辑 |
| `data/research/` | 景点门票、预约、宠物政策、油价、过路费、边境政策等核查结果，每条带来源链接、可信度和核查日期 | 人工或 Claude Code 核查后编辑 |
| `data/generated/` | 路段里程与路线、海拔、出发城市接入、逐月气候、餐厅价格统计、带狗便利程度统计、图片署名 | 脚本生成 |
| `src/data/` | 合并后的应用数据 | `npm run data` 生成，勿手改 |

### 数据管线

```bash
python3 scripts/fetch_legs.py           # 路段里程、时长、高速里程（OSRM，有本地缓存）
python3 scripts/fetch_full_geom.py      # 完整精度路线，按分段写入 public/route/
python3 scripts/fetch_elevation.py      # 海拔与各段最高点（OpenTopoData SRTM 90m）
python3 scripts/fetch_starts.py         # 出发城市到环线最近点
python3 scripts/fetch_climate.py        # 逐月气候（Open-Meteo）
python3 scripts/fetch_prices.py         # 各地餐厅人均分布（高德 Web服务）
python3 scripts/fetch_pet_friendly.py   # 可带宠物的酒店、宠物餐厅、宠物医院数量（高德 Web服务）
python3 scripts/fetch_images.py         # 图片与署名（Wikimedia Commons，只取开放授权）
python3 scripts/fetch_hero.py           # 首页大图（同一批 Commons 照片的大尺寸版本）
python3 scripts/make_og.py              # 分享卡片 public/og.png
python3 scripts/build_fonts.py          # 宋体子集：按全站用到的字截取思源宋体，改了数据或界面文字后重跑
npm run data                            # 合并到 src/data/
```

### 更新

门票、开放时间、宠物政策、油价、边境政策会变，更新流程见 [docs/数据维护.md](docs/数据维护.md)：

- `npm run data:check` 列出到了复核日期、超过 90 天未核查、票价未查到、来源可信度低、宠物政策未查到、政策待确认的条目。
- `.github/workflows/data-check.yml` 每月 1 日运行上述检查，结果写进带 `data-refresh` 标签的 Issue。
- 页面上每个景点都有“告诉我们”链接，用于提交价格和规定的变化。

### 来源与可信度

| 数据 | 来源 | 性质 |
|---|---|---|
| 路段里程、驾驶时长、路线 | OSRM，OpenStreetMap 路网 | 计算值；时长为纯驾驶时间 |
| 高速里程 | OSRM 路段的道路编号 | 估算 |
| 海拔、山口高度 | OpenTopoData SRTM 90m，每 12 km 采样 | 计算值，山口高度略低于实际 |
| 逐月气候 | Open-Meteo 历史气象，47 处为 2016–2025 年、其余为 2022–2025 年 | 计算值 |
| 餐厅人均、带狗便利程度 | 高德 Web服务检索，只保存统计数字 | 用于各地比较 |
| 景点门票、预约、宠物政策 | 景区公告、政府网站、OTA、新闻 | 每条标“官方 / OTA·新闻 / 待核实”并附链接；未核实的票价不计入总价 |
| 油价、充电价、过路费 | 各省调价公告与公开报道 | 默认值可改 |
| 最佳月份、住宿方式、各分段充电便利度 | 经验估计 | 页面上注明是估计 |
| 地图 | 高德开放平台 JS API 2.0 | 底图自带审图号 |

页面只使用高德地图展示中国地图。高德开放平台对非商业用途的个人认证开发者提供免费月配额（地图加载 150 万次/月），商用需购买技术服务许可，见 [高德开放平台配额说明](https://lbs.amap.com/upgrade)（2026-10-03 读取）。

## 进度

已完成：上面“功能”所列内容；规划逻辑的单元测试；数据核查与每月检查。

未完成：

- 部分景点票价和大多数景点的宠物政策未核实，页面已标出。
- “跳过一段”只是不停留，路线仍经过该区域；绕开整个大区需要重新设计环线。
- 没有账号和云端保存，方案保存在浏览器本地，可用分享链接在设备间转移。
- 没有离线使用。
- 服务器在境外，中国大陆访问速度不稳定；部署到大陆需要 ICP 备案。

## 许可

代码和本项目整理的数据（`data/route.json`、`data/roads.json`、`data/research/`、文档）以 [MIT 许可证](LICENSE) 发布。以下第三方数据保留各自的许可：

| 内容 | 位置 | 来源与许可 |
|---|---|---|
| 过夜点图片、首页大图 | `public/img/`、`public/hero/` | Wikimedia Commons，各图许可（CC BY、CC BY-SA、公有领域等）与作者见 `data/generated/images.json` 和页面“数据来源” |
| 路段里程、路线几何 | `data/generated/legs.json`、`public/route/` | 由 OSRM 基于 OpenStreetMap 计算，© OpenStreetMap contributors，ODbL |
| 海拔 | `data/generated/elevation.json` | OpenTopoData，SRTM 90m |
| 逐月气候 | `data/generated/climate.json` | Open-Meteo，CC BY 4.0 |
| 宋体字体子集 | `public/fonts/` | Noto Serif CJK SC（思源宋体），SIL Open Font License 1.1，见 `public/fonts/OFL.txt` |
| 餐厅人均与带狗便利程度统计 | `data/generated/prices.json`、`data/generated/pet_friendly.json` | 基于高德开放平台检索结果的统计，受其服务条款约束 |
