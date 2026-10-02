import type { CalendarLinks, EventDetail } from '@eii/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { notFound, parse } from '../../lib/http';
import type { AuthService } from '../auth/service';
import type { EventService } from '../events/service';

const LINK_TTL_S = 24 * 3600;

const pad = (n: number) => String(n).padStart(2, '0');
/** 20261112T040000Z */
const utcStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
/** 20261112 in India (all-day events). */
const istDate = (d: Date, addDays = 0) => {
  const t = new Date(d.getTime() + 5.5 * 3600_000 + addDays * 86_400_000);
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
};

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line with a leading space (RFC 5545). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const place = (e: EventDetail) => (e.attendanceMode === 'online' ? 'Online' : [e.venue?.name, e.venue?.address ?? e.city].filter(Boolean).join(', '));

/** One event as an iCalendar file (§51): title, times, place, link and summary. */
export function eventIcs(e: EventDetail, now = new Date()): string {
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const description = [e.summary, e.officialWebsite ? `More: ${e.officialWebsite}` : undefined].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event Intelligence India//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@event-intelligence-india`,
    `DTSTAMP:${utcStamp(now)}`,
    ...(e.allDay ? [`DTSTART;VALUE=DATE:${istDate(start)}`, `DTEND;VALUE=DATE:${istDate(end, 1)}`] : [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`]),
    `SUMMARY:${escapeText(e.title)}`,
    `LOCATION:${escapeText(place(e))}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(e.officialWebsite ? [`URL:${e.officialWebsite}`] : []),
    e.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function googleCalendarUrl(e: EventDetail): string {
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const dates = e.allDay ? `${istDate(start)}/${istDate(end, 1)}` : `${utcStamp(start)}/${utcStamp(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates,
    location: place(e),
    details: [e.summary, e.officialWebsite].filter(Boolean).join('\n\n'),
    ctz: 'Asia/Kolkata',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

/** GET /v1/events/:id/calendar (signed in): the two "add to calendar" links. */
export function calendarLinkRoutes(auth: AuthService, events: EventService): Router {
  const router = Router();
  router.get('/events/:id/calendar', async (req, res) => {
    const id = parse(z.string().min(1).max(120), req.params.id);
    const event = await events.get(id);
    if (!event) throw notFound('Event');
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL_S;
    const sig = auth.signLink(`${id}:${exp}`);
    const links: CalendarLinks = { icsUrl: `${origin(req)}/calendar/${encodeURIComponent(id)}.ics?exp=${exp}&sig=${sig}`, googleUrl: googleCalendarUrl(event) };
    res.set('Cache-Control', 'no-store').json(links);
  });
  return router;
}

/** GET /calendar/:id.ics?exp&sig (public, signed): what the phone's calendar opens. */
export function publicCalendarRoutes(auth: AuthService, events: EventService): Router {
  const router = Router();
  router.get('/calendar/:file', async (req, res) => {
    const file = parse(z.string().regex(/^[^/]{1,120}\.ics$/), req.params.file);
    const { exp, sig } = parse(z.object({ exp: z.coerce.number().int(), sig: z.string().min(10).max(100) }), req.query);
    const id = file.slice(0, -4);
    if (exp < Date.now() / 1000 || !auth.verifyLink(`${id}:${exp}`, sig)) throw notFound('Calendar file');
    const event = await events.get(id);
    if (!event) throw notFound('Event');
    res
      .set('Content-Type', 'text/calendar; charset=utf-8')
      .set('Content-Disposition', `inline; filename="${event.slug || 'event'}.ics"`)
      .set('Cache-Control', 'private, max-age=300')
      .send(eventIcs(event));
  });
  return router;
}
