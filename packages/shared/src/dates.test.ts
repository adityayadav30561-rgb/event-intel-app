import { describe, expect, it } from 'vitest';
import {
  datePresetRange,
  formatCountdown,
  formatDateRange,
  formatRelativePast,
  greetingFor,
  istDayDiff,
  istParts,
} from './dates';

// Thursday 1 October 2026, 10:30 AM IST (05:00 UTC).
const now = new Date('2026-10-01T05:00:00Z');
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('India time', () => {
  it('reads calendar parts in IST regardless of device timezone', () => {
    expect(istParts(new Date('2026-09-30T20:00:00Z'))).toMatchObject({ year: 2026, month: 10, day: 1, hour: 1, minute: 30 });
  });

  it('greets by IST hour', () => {
    expect(greetingFor(ist('2026-10-01T09:00:00'))).toBe('Good morning');
    expect(greetingFor(ist('2026-10-01T13:00:00'))).toBe('Good afternoon');
    expect(greetingFor(ist('2026-10-01T19:00:00'))).toBe('Good evening');
  });

  it('counts calendar days, not 24-hour periods', () => {
    expect(istDayDiff(ist('2026-10-02T00:30:00'), ist('2026-10-01T23:30:00'))).toBe(1);
    expect(istDayDiff(ist('2026-10-01T23:59:00'), ist('2026-10-01T00:01:00'))).toBe(0);
  });
});

describe('date presets', () => {
  const range = (preset: Parameters<typeof datePresetRange>[0]) => {
    const r = datePresetRange(preset, now);
    return [r.from.toISOString(), r.to.toISOString()];
  };

  it('today and tomorrow', () => {
    expect(range('today')).toEqual([ist('2026-10-01T00:00:00').toISOString(), ist('2026-10-02T00:00:00').toISOString()]);
    expect(range('tomorrow')).toEqual([ist('2026-10-02T00:00:00').toISOString(), ist('2026-10-03T00:00:00').toISOString()]);
  });

  it('this week runs from today to the end of Sunday', () => {
    expect(range('this_week')).toEqual([ist('2026-10-01T00:00:00').toISOString(), ist('2026-10-05T00:00:00').toISOString()]);
  });

  it('this weekend is Saturday and Sunday', () => {
    expect(range('this_weekend')).toEqual([ist('2026-10-03T00:00:00').toISOString(), ist('2026-10-05T00:00:00').toISOString()]);
  });

  it('next week is the following Monday to Sunday', () => {
    expect(range('next_week')).toEqual([ist('2026-10-05T00:00:00').toISOString(), ist('2026-10-12T00:00:00').toISOString()]);
  });

  it('months roll over the year end', () => {
    const december = new Date('2026-12-15T05:00:00Z');
    const r = datePresetRange('next_month', december);
    expect([r.from.toISOString(), r.to.toISOString()]).toEqual([
      ist('2027-01-01T00:00:00').toISOString(),
      ist('2027-02-01T00:00:00').toISOString(),
    ]);
  });
});

describe('formatting', () => {
  it('formats date ranges compactly', () => {
    expect(formatDateRange(ist('2026-10-18T09:30:00'), ist('2026-10-18T17:30:00'))).toBe('18 Oct 2026');
    expect(formatDateRange(ist('2026-10-18T09:30:00'), ist('2026-10-20T17:30:00'))).toBe('18–20 Oct 2026');
    expect(formatDateRange(ist('2026-09-30T09:30:00'), ist('2026-10-02T17:30:00'))).toBe('30 Sep – 2 Oct 2026');
    expect(formatDateRange(ist('2026-12-30T09:30:00'), ist('2027-01-02T17:30:00'))).toMatch(/^30 Dec 2026 – 2 Jan 2027$/);
  });

  it('describes recency', () => {
    expect(formatRelativePast(new Date(now.getTime() - 4 * 3_600_000), now)).toBe('4 hours ago');
    expect(formatRelativePast(ist('2026-09-30T18:00:00'), now)).toBe('yesterday');
    expect(formatRelativePast(ist('2026-09-28T18:00:00'), now)).toBe('3 days ago');
  });

  it('counts down to upcoming events', () => {
    expect(formatCountdown(ist('2026-10-01T18:00:00'), ist('2026-10-01T20:00:00'), now)).toBe('Today');
    expect(formatCountdown(ist('2026-10-02T09:00:00'), ist('2026-10-02T17:00:00'), now)).toBe('Tomorrow');
    expect(formatCountdown(ist('2026-10-13T09:00:00'), ist('2026-10-13T17:00:00'), now)).toBe('In 12 days');
    expect(formatCountdown(ist('2026-09-30T09:00:00'), ist('2026-10-02T17:00:00'), now)).toBe('Happening now');
  });
});
