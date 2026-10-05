---
name: refresh-data
description: 核查并更新万里路书的景点门票、宠物政策、油价、边境政策等数据（data/research/）。参数是要核查的范围，如“到了复核日期的条目”“黄山 宏村”“policy 油价”。
---

# 核查并更新路书数据

范围：$ARGUMENTS（为空时，先运行 `npm run data:check` 取「到了复核日期」和「超过有效期未复核」两类）。

## 规则

- 只改 `data/research/*.json`，必要时改 `data/route.json` 的 `tip`、`dog` 文案；不改代码。
- 每个数值必须有来源：优先景区官网、官方公众号公告、政府网站，其次 OTA、近一年新闻。只写实际打开过的链接。
- 查不到就保持 `null` 并在 `note` 写明，不用估计值填。
- 可信度：官方原文 `high`，OTA 或新闻 `medium`，只有搜索摘要、过期或互相矛盾的 `low`，冲突口径写进 `note`。
- 每条改过或复核过的条目把 `checked` 设为今天；已知会再变的写 `review_by` 和 `review_note`；到期已处理的删掉 `review_by`。
- 文案写客观陈述，不写“我查到”“本次”之类过程描述。

## 步骤

1. 列出要核查的条目（文件、`node`、`name`）。
2. 逐条核查并编辑 JSON，保持文件为合法 UTF-8 JSON（2 空格或 1 空格缩进与原文件一致）。
3. 运行 `npm run data && npm test && npm run build`，全部通过。
4. 汇报：改了哪些条目、旧值和新值、来源链接；没查到的列出来。不要自行提交。
