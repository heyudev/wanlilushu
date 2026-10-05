// Calendar helpers. Dates are plain "YYYY-MM-DD" strings handled in UTC so time zones never shift a day.

const DAY = 86_400_000;

export function parseDate(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  return formatDate(parseDate(s) + n * DAY);
}

export function monthOf(s: string): number {
  return Number(s.slice(5, 7));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function shortDate(s: string): string {
  const t = new Date(parseDate(s));
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()} 周${WEEKDAYS[t.getUTCDay()]}`;
}

/**
 * Approximate public-holiday windows when small passenger cars (7 seats or fewer) ride expressways free.
 * Qingming / Labour Day / National Day use their usual Gregorian windows; the exact days are published each year.
 */
export function holidayName(s: string): string | null {
  const m = monthOf(s);
  const d = Number(s.slice(8, 10));
  if (m === 4 && d >= 4 && d <= 6) return "清明";
  if (m === 5 && d >= 1 && d <= 5) return "劳动节";
  if (m === 10 && d >= 1 && d <= 7) return "国庆";
  return null;
}
