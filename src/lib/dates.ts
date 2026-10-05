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

/**
 * 正月初一 by year, from the Hong Kong Observatory's Gregorian–Lunar calendar conversion tables
 * (https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T2027c.txt and the files for the other years,
 * read 2026-10-05). Computed lunar calendars, such as Intl's chinese calendar, are a day off in some years
 * (2027, 2030), so the dates are listed rather than calculated.
 */
export const SPRING_FESTIVAL: Record<number, string> = {
  2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26", 2029: "2029-02-13", 2030: "2030-02-03",
  2031: "2031-01-23", 2032: "2032-02-11", 2033: "2033-01-31", 2034: "2034-02-19", 2035: "2035-02-08",
};

/** going home for the Spring Festival: leave three days before New Year's Eve */
export const NEW_YEAR_LEAVE_BEFORE_EVE = 3;

/** Day offsets from `start` of each Spring Festival trip home, from the first one on or after `start`. */
export function newYearLeaveDays(start: string): number[] {
  return Object.values(SPRING_FESTIVAL)
    .map((d) => daysBetween(start, d) - 1 - NEW_YEAR_LEAVE_BEFORE_EVE)
    .filter((d) => d >= 0);
}

/** shortDate, with the year in front when it is not `year` (trips often run past a year end) */
export function shortDateFrom(s: string, year: string): string {
  return s.slice(0, 4) === year ? shortDate(s) : `${s.slice(0, 4)} 年 ${shortDate(s)}`;
}

/** "4/1–11/20" within a year, "2027/4/1–2028/4/3" across years */
export function dateRange(a: string, b: string): string {
  const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  return a.slice(0, 4) === b.slice(0, 4) ? `${md(a)}–${md(b)}` : `${a.slice(0, 4)}/${md(a)}–${b.slice(0, 4)}/${md(b)}`;
}
