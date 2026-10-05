// Prints the data freshness report: npm run data:check -- [--days 90] [--today YYYY-MM-DD]
import { auditData, auditMarkdown } from "../src/lib/audit";
import { loadDataset, policy } from "../src/lib/data";
import { formatDate } from "../src/lib/dates";

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const today = opt("--today") ?? formatDate(Date.now());
const days = Number(opt("--days") ?? 90);
const data = loadDataset();
console.log(auditMarkdown(auditData(data.nodes, data.attractions, policy, today, days), today));
