# 万里路书 · 仓库约定

纯前端：Vite + React 19 + TypeScript，没有后端。地图只用高德 JS API 2.0（`src/components/AmapView.tsx`，加载器 `amapLoader.ts`），未配置 Key 时显示文字提示。不要自绘中国地图（行政区划数据没有审图号）。界面文案中文，代码标识符与注释英文。

## 命令

```bash
npm run dev          # http://localhost:5180
npm test             # vitest，规划逻辑都在 src/lib，改逻辑必须补测试
npm run typecheck
npm run build
npm run data         # data/ → src/data/（改了 data/route.json 或 data/research/ 之后）
npm run data:check   # 待更新数据清单（复核到期、过期、缺价、低可信）
npm run fonts        # 宋体子集（思源宋体）：新增了界面文字或数据里的新字后重跑，否则 fonts.test.ts 会失败
```

## 密钥

- `.env` 不提交（`.gitignore` 已忽略）。只有 `VITE_` 开头的变量会打包进网页：只能是高德 JS API 的 Key 和安全密钥。
- 高德 Web服务的 Key（`AMAP_WEB_KEY`、`AMAP_WEB_SECRET`）只在 `scripts/` 里读取，任何时候都不能加 `VITE_` 前缀，也不能写进 `src/`。
- 数据是 WGS84；交给高德前一律经过 `src/lib/coords.ts` 的 `wgsToGcj`。

## 数据规则

- `src/data/` 是生成物，不手改；改 `data/route.json`、`data/research/*.json`，再跑 `npm run data`。
- 价格、政策、开放时间只能来自 `data/research/`，每条带 `src` 链接和 `confidence`。查不到就留 `null`，不填估计值。
- 经验估计（美食人均、最佳月份、充电便利度 `CHARGE_AVAIL`）在界面上必须标明是估计。
- 里程只用 OSRM 计算值（`scripts/fetch_legs.py`），不手填。公共 OSRM 限速每秒 1 次请求，脚本已缓存到 `data/generated/.osrm_cache.json`。
- 图片只用开放授权的 Wikimedia Commons 图片，署名写进 `data/generated/images.json`；不是该地点本身的图片标 `generic`。

## 结构

- `src/lib/plan.ts`：核心。`buildPlan(data, input)` 旋转环线、按节奏取舍、排日期、算费用、出提醒；`bestStartDates` 扫描一年找季节最顺的出发日。
- `src/lib/costs.ts`：费用规则（能耗、住宿、门票、狗）。
- `src/lib/profile.ts`：把顺时针存储的海拔采样按计划的行驶顺序重排。
- `src/lib/audit.ts`：数据新鲜度检查，`scripts/check-data.ts` 和每月工作流调用它。
- `src/lib/custom.ts`：把用户加入的地点（`input.custom`）插进环线；`legs.ts` 记录每段对应的原始路段。
- `src/lib/share.ts`：分享链接，`?plan=` 里是与默认值的差异（deflate + base64url）。`gpx.ts`、`markdown.ts`：导出。
- `src/lib/budget.ts`：总预算与省钱选项。
- `src/lib/fixture.ts`：测试用的 4 点小环线。
- 界面：`App.tsx`（首页 → 五个页签：路线、行程、旅居、费用、出发准备），站点详情、加入地点和条件设置都在 `Drawer` 里打开。设置存在 localStorage `wanlilushu.input.v2`，改 `PlanInput` 时给旧数据留默认值。
- 高德 Web服务的数据只存统计数字（数量、价格分位数），不存 POI 名称；页面上要看具体店铺就给高德搜索链接。

## 部署

`npm run deploy:cf` 部署到 Cloudflare Pages 项目 `wanlilushu`（wanlilushu.cn）。推送和部署前先问。
- 数据更新流程见 `docs/数据维护.md`；核查数据用项目技能 `refresh-data`。
