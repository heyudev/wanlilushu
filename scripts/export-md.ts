// Write a plan as Markdown: npm run export:md -- <out.md> [overrides.json]
// overrides.json holds any PlanInput fields, e.g. {"start": "成都", "startDate": "2027-04-07"}.
import { readFileSync, writeFileSync } from "node:fs";
import { loadDataset } from "../src/lib/data";
import { DEFAULT_INPUT } from "../src/lib/defaults";
import { planToMarkdown } from "../src/lib/markdown";
import { buildPlan } from "../src/lib/plan";

const [out, overrides] = process.argv.slice(2);
if (!out) {
  console.error("usage: npm run export:md -- <out.md> [overrides.json]");
  process.exit(1);
}
const input = { ...DEFAULT_INPUT, ...(overrides ? JSON.parse(readFileSync(overrides, "utf8")) : {}) };
const data = loadDataset();
writeFileSync(out, planToMarkdown(buildPlan(data, input), data));
console.log("wrote", out);
