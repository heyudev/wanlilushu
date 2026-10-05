const nf = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

export const yuan = (n: number) => `¥${nf.format(Math.round(n))}`;

/** Large sums as 万元 with one decimal, small ones in full. */
export const yuanShort = (n: number) => (Math.abs(n) >= 10_000 ? `¥${(n / 10_000).toFixed(1)} 万` : yuan(n));

export const km = (n: number) => `${nf.format(Math.round(n))} km`;

export const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} 分钟` : `${h.toFixed(1)} 小时`);

export const int = (n: number) => nf.format(Math.round(n));

/** Trip length in human terms: 45 天 / 8 个月 / 1 年 3 个月. */
export function duration(days: number): string {
  if (days < 60) return `${days} 天`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} 个月`;
  const y = Math.floor(months / 12), m = months % 12;
  return m ? `${y} 年 ${m} 个月` : `${y} 年`;
}
