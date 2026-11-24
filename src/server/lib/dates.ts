// The shop's business day is Asia/Manila (UTC+8, no daylight saving), the same zone the sales views use.

/** Today's date in Manila, YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    now,
  );
}

/** Start of a Manila calendar day as a timestamp PostgreSQL accepts. */
export function manilaDayStart(date: string): string {
  return `${date}T00:00:00+08:00`;
}

/** Start of the Manila day after `date` (exclusive upper bound for a "to" filter). */
export function manilaNextDayStart(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return manilaDayStart(next.toISOString().slice(0, 10));
}
