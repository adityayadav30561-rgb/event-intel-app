import { APP } from './app';

/**
 * Date logic in India time. India has no daylight saving, so IST is a fixed UTC+05:30 and
 * calendar maths can be done exactly without a timezone library.
 */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Calendar parts of an instant, as seen in India. Month is 1–12, weekday 0 = Sunday. */
export function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** The instant of midnight in India on the given calendar date (month 1–12; overflow allowed). */
export function istMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Midnight in India at the start of the day containing `date`, plus `addDays`. */
export function istStartOfDay(date: Date, addDays = 0): Date {
  const p = istParts(date);
  return istMidnight(p.year, p.month, p.day + addDays);
}

/** Hour of day (0–23) in India time, regardless of the device's timezone. */
export function istHour(date: Date = new Date()): number {
  return istParts(date).hour;
}

/** Whole calendar days from today to the day of `date` (0 = today, 1 = tomorrow, −1 = yesterday). */
export function istDayDiff(date: Date, now: Date = new Date()): number {
  return Math.round((istStartOfDay(date).getTime() - istStartOfDay(now).getTime()) / DAY_MS);
}

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

export function greetingFor(date: Date = new Date()): Greeting {
  const hour = istHour(date);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Date presets (spec §18) ────────────────────────────────────────────────

export const DATE_PRESETS = [
  'today',
  'tomorrow',
  'this_week',
  'this_weekend',
  'next_week',
  'this_month',
  'next_month',
  'next_3_months',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This Week',
  this_weekend: 'This Weekend',
  next_week: 'Next Week',
  this_month: 'This Month',
  next_month: 'Next Month',
  next_3_months: 'Next 3 Months',
};

/** Half-open range [from, to) of instants. */
export type DateRange = { from: Date; to: Date };

/** Weeks run Monday to Sunday, as on Indian calendars. */
export function datePresetRange(preset: DatePreset, now: Date = new Date()): DateRange {
  const p = istParts(now);
  const today = istMidnight(p.year, p.month, p.day);
  const day = (n: number) => istMidnight(p.year, p.month, p.day + n);
  const daysSinceMonday = (p.weekday + 6) % 7;
  switch (preset) {
    case 'today':
      return { from: today, to: day(1) };
    case 'tomorrow':
      return { from: day(1), to: day(2) };
    case 'this_week':
      return { from: today, to: day(7 - daysSinceMonday) };
    case 'this_weekend': {
      // Saturday and Sunday of this week; on Sunday, just today.
      const saturday = 5 - daysSinceMonday;
      return { from: saturday > 0 ? day(saturday) : today, to: day(7 - daysSinceMonday) };
    }
    case 'next_week':
      return { from: day(7 - daysSinceMonday), to: day(14 - daysSinceMonday) };
    case 'this_month':
      return { from: today, to: istMidnight(p.year, p.month + 1, 1) };
    case 'next_month':
      return { from: istMidnight(p.year, p.month + 1, 1), to: istMidnight(p.year, p.month + 2, 1) };
    case 'next_3_months':
      return { from: today, to: istMidnight(p.year, p.month + 3, p.day) };
  }
}

/** True when an event running [start, end] overlaps the range. */
export function overlapsRange(start: Date, end: Date, range: DateRange): boolean {
  return start < range.to && end >= range.from;
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** Newer ICU writes "Sept"; Apple and most Indian calendars use "Sep". */
const tidy = (text: string) => text.replace(/\bSept\b/g, 'Sep');

const fmt = (options: Intl.DateTimeFormatOptions) => {
  const f = new Intl.DateTimeFormat('en-IN', { timeZone: APP.timezone, ...options });
  return { format: (date: Date) => tidy(f.format(date)) };
};

const fDay = fmt({ day: 'numeric' });
const fDayMonth = fmt({ day: 'numeric', month: 'short' });
const fDayMonthYear = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const fWeekdayDayMonth = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const fWeekdayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fMonthShort = fmt({ month: 'short' });
const fMonthLongYear = fmt({ month: 'long', year: 'numeric' });
const fTime = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
const fDateTime = fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/** Intl in some engines writes "am"; Apple style is "AM". */
const upperMeridiem = (text: string) => text.replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());

/** e.g. "1 Oct 2026, 3:45 PM" in India time. */
export function formatDateTimeIST(date: Date): string {
  return upperMeridiem(fDateTime.format(date));
}

/** "10:00 AM" */
export function formatTime(date: Date): string {
  return upperMeridiem(fTime.format(date));
}

/** "10:00 AM – 6:00 PM" */
export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "OCT" — for calendar-style date tiles. */
export function formatMonthShort(date: Date): string {
  return fMonthShort.format(date).toUpperCase();
}

export function formatDayOfMonth(date: Date): string {
  return fDay.format(date);
}

/** "Thu, 18 Oct" */
export function formatWeekdayDate(date: Date): string {
  return fWeekdayDayMonth.format(date);
}

/** "Thursday, 18 October" */
export function formatLongDate(date: Date): string {
  return fWeekdayLong.format(date);
}

/** "October 2026" */
export function formatMonthYear(date: Date): string {
  return fMonthLongYear.format(date);
}

/**
 * Compact date range for cards:
 * same day "18 Oct 2026" · same month "18–20 Oct 2026" · across months "30 Sep – 2 Oct 2026".
 * The year is dropped when `withYear` is false.
 */
export function formatDateRange(start: Date, end: Date, withYear = true): string {
  const s = istParts(start);
  const e = istParts(end);
  const year = withYear ? ` ${e.year}` : '';
  if (s.year === e.year && s.month === e.month && s.day === e.day) {
    return withYear ? fDayMonthYear.format(start) : fDayMonth.format(start);
  }
  if (s.year === e.year && s.month === e.month) {
    return `${s.day}–${e.day} ${fMonthShort.format(end)}${year}`;
  }
  if (s.year === e.year) {
    return `${fDayMonth.format(start)} – ${fDayMonth.format(end)}${year}`;
  }
  return `${fDayMonthYear.format(start)} – ${fDayMonthYear.format(end)}`;
}

/** Number of calendar days an event spans in India time (1 for a single-day event). */
export function eventDayCount(start: Date, end: Date): number {
  return istDayDiff(end, start) + 1;
}

/** "just now" · "4 hours ago" · "yesterday" · "3 days ago" · "12 Sep" */
export function formatRelativePast(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && istDayDiff(date, now) === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = -istDayDiff(date, now);
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return fDayMonth.format(date);
}

/** Countdown for upcoming events (spec §54): "Happening now" · "Today" · "Tomorrow" · "In 12 days". */
export function formatCountdown(start: Date, end: Date, now: Date = new Date()): string | undefined {
  if (now >= start && now <= end) return 'Happening now';
  if (now > end) return undefined;
  const days = istDayDiff(start, now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 60) return `In ${days} days`;
  return undefined;
}

const isoDay = (d: Date) => {
  const p = istParts(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

/** The event's calendar days in India ("2026-11-12", …), at most `max` (for picking a visit day). */
export function istEventDays(start: Date, end: Date, max = 14): string[] {
  const days: string[] = [];
  for (let i = 0; i < Math.min(eventDayCount(start, end), max); i++) days.push(isoDay(istStartOfDay(start, i)));
  return days;
}

/** A calendar day ("2026-11-12") as "Thu, 12 Nov". */
export function formatIsoDay(day: string): string {
  return formatWeekdayDate(new Date(`${day}T12:00:00+05:30`));
}
