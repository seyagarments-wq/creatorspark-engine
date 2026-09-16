/**
 * Pure pay math, shared by the edge functions and the frontend. No Deno or browser imports so
 * vitest can run it. The database has the same rules in SQL (pay_rate_per_video,
 * bonus_rate_for, open_due_payouts); these mirror them for display and dry runs.
 */

export interface BonusBand {
  /** revenue at or above which this rate applies, in dollars */
  min: number;
  /** percent, e.g. 4 for 4% */
  rate: number;
}

export interface PayRates {
  per_video: number;
  bonus_bands: BonusBand[];
}

export const DEFAULT_PAY_RATES: PayRates = {
  per_video: 65,
  bonus_bands: [
    { min: 0, rate: 3 },
    { min: 10000, rate: 4 },
    { min: 50000, rate: 5 },
  ],
};

export function normalizePayRates(value: unknown): PayRates {
  const v = (value ?? {}) as Partial<PayRates>;
  const perVideo = typeof v.per_video === "number" && v.per_video >= 0 ? v.per_video : DEFAULT_PAY_RATES.per_video;
  const bands = Array.isArray(v.bonus_bands)
    ? v.bonus_bands
        .filter((b): b is BonusBand => !!b && typeof b.min === "number" && typeof b.rate === "number")
        .sort((a, b) => a.min - b.min)
    : DEFAULT_PAY_RATES.bonus_bands;
  return { per_video: perVideo, bonus_bands: bands.length ? bands : DEFAULT_PAY_RATES.bonus_bands };
}

/** Flat pay for a number of approved, non-bounty videos. */
export function videoPay(approvedCount: number, perVideo: number): number {
  return round2(Math.max(0, Math.floor(approvedCount)) * perVideo);
}

/** The band whose `min` is the largest one at or below `revenue`. */
export function bonusBandFor(revenue: number, bands: BonusBand[]): BonusBand {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  let current = sorted[0];
  for (const b of sorted) if (revenue >= b.min) current = b;
  return current;
}

export function bonusRate(revenue: number, bands: BonusBand[]): number {
  return bonusBandFor(Math.max(0, revenue), bands).rate;
}

/** Bonus in dollars: the band rate applied to the WHOLE revenue, not just the part above the threshold. */
export function bonusPay(revenue: number, bands: BonusBand[]): number {
  const r = Math.max(0, revenue);
  return round2((r * bonusRate(r, bands)) / 100);
}

/** The next band above the current one, and how much more revenue reaches it. Null at the top band. */
export function nextBand(revenue: number, bands: BonusBand[]): { band: BonusBand; remaining: number } | null {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  const current = bonusBandFor(Math.max(0, revenue), sorted);
  const idx = sorted.findIndex((b) => b.min === current.min && b.rate === current.rate);
  const next = sorted[idx + 1];
  if (!next) return null;
  return { band: next, remaining: round2(next.min - Math.max(0, revenue)) };
}

export interface PayPeriod {
  index: number;
  start: Date; // inclusive, UTC midnight
  end: Date; // inclusive, UTC midnight of the last day
  complete: boolean;
}

/** UTC calendar day of a timestamp. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Pay periods anchored on the creator's first approved video: [anchor, anchor+cycle-1],
 * [anchor+cycle, anchor+2*cycle-1], ... A period is complete once `today` is past its end.
 * Mirrors open_due_payouts() in SQL.
 */
export function payPeriods(firstVideoAt: Date, cycleDays: number, today: Date, maxPeriods = 60): PayPeriod[] {
  const anchor = utcDay(firstVideoAt);
  const cycle = Math.max(7, Math.floor(cycleDays || 28));
  const t = utcDay(today);
  const out: PayPeriod[] = [];
  for (let n = 0; n < maxPeriods; n++) {
    const start = addDays(anchor, n * cycle);
    const end = addDays(start, cycle - 1);
    const complete = end.getTime() < t.getTime();
    out.push({ index: n, start, end, complete });
    if (!complete) break;
  }
  return out;
}

/** The period that contains `today`, or the first one if today is before the anchor. */
export function currentPeriod(firstVideoAt: Date, cycleDays: number, today: Date): PayPeriod {
  const periods = payPeriods(firstVideoAt, cycleDays, today);
  return periods[periods.length - 1];
}

/** The day the current period's payout opens: the day after the period ends. */
export function nextPayoutDate(firstVideoAt: Date, cycleDays: number, today: Date): Date {
  return addDays(currentPeriod(firstVideoAt, cycleDays, today).end, 1);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
