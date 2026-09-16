import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAY_RATES,
  normalizePayRates,
  videoPay,
  bonusRate,
  bonusPay,
  nextBand,
  payPeriods,
  currentPeriod,
  nextPayoutDate,
} from "../payout-math";

const bands = DEFAULT_PAY_RATES.bonus_bands;
const d = (iso: string) => new Date(iso);

describe("flat video pay", () => {
  it("pays $65 per approved video, no tiers, no floor", () => {
    expect(videoPay(24, 65)).toBe(1560);
    expect(videoPay(1, 65)).toBe(65);
    expect(videoPay(0, 65)).toBe(0);
    expect(videoPay(35, 65)).toBe(2275); // not a $500 guarantee
  });
  it("uses the configured rate", () => {
    expect(videoPay(10, 70)).toBe(700);
  });
});

describe("bonus bands", () => {
  it("applies the band rate to the whole revenue", () => {
    expect(bonusRate(12000, bands)).toBe(4);
    expect(bonusPay(12000, bands)).toBe(480);
    expect(bonusPay(40000, bands)).toBe(1600);
  });
  it("switches at exactly the threshold", () => {
    expect(bonusRate(9999.99, bands)).toBe(3);
    expect(bonusRate(10000, bands)).toBe(4);
    expect(bonusRate(49999.99, bands)).toBe(4);
    expect(bonusRate(50000, bands)).toBe(5);
    expect(bonusPay(50000, bands)).toBe(2500);
  });
  it("handles zero and negative revenue as 3% of nothing", () => {
    expect(bonusRate(0, bands)).toBe(3);
    expect(bonusPay(0, bands)).toBe(0);
    expect(bonusPay(-5, bands)).toBe(0);
  });
  it("tells the creator how far the next band is", () => {
    expect(nextBand(12000, bands)).toEqual({ band: { min: 50000, rate: 5 }, remaining: 38000 });
    expect(nextBand(2500, bands)).toEqual({ band: { min: 10000, rate: 4 }, remaining: 7500 });
    expect(nextBand(80000, bands)).toBeNull();
  });
  it("normalizes a settings row and falls back to defaults", () => {
    expect(normalizePayRates(null)).toEqual(DEFAULT_PAY_RATES);
    const custom = normalizePayRates({ per_video: 70, bonus_bands: [{ min: 20000, rate: 6 }, { min: 0, rate: 2 }] });
    expect(custom.per_video).toBe(70);
    expect(custom.bonus_bands[0]).toEqual({ min: 0, rate: 2 });
    expect(bonusRate(25000, custom.bonus_bands)).toBe(6);
  });
});

describe("pay periods anchored on the first approved video", () => {
  const first = d("2026-08-17T15:42:00Z"); // first approval

  it("is 28 days long, inclusive on both ends", () => {
    const p = payPeriods(first, 28, d("2026-08-20T00:00:00Z"));
    expect(p).toHaveLength(1);
    expect(p[0].start.toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(p[0].end.toISOString().slice(0, 10)).toBe("2026-09-13");
    expect(p[0].complete).toBe(false);
  });

  it("completes the day after its last day", () => {
    expect(currentPeriod(first, 28, d("2026-09-13T23:59:00Z")).index).toBe(0);
    expect(currentPeriod(first, 28, d("2026-09-14T00:00:00Z")).index).toBe(1);
    expect(payPeriods(first, 28, d("2026-09-14T00:00:00Z"))[0].complete).toBe(true);
  });

  it("names the day the next payout opens", () => {
    expect(nextPayoutDate(first, 28, d("2026-08-20T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(nextPayoutDate(first, 28, d("2026-09-20T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("is unaffected by daylight saving changes", () => {
    // US DST ends 2026-11-01; a 28-day cycle straddling it stays 28 calendar days.
    const anchor = d("2026-10-20T12:00:00Z");
    const p = payPeriods(anchor, 28, d("2026-11-20T00:00:00Z"));
    expect(p[0].end.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(p[1].start.toISOString().slice(0, 10)).toBe("2026-11-17");
  });

  it("never shortens the cycle below a week", () => {
    expect(payPeriods(first, 1, d("2026-08-20T00:00:00Z"))[0].end.toISOString().slice(0, 10)).toBe("2026-08-23");
  });
});
