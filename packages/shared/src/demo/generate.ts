import { istMidnight, istParts } from '../dates';
import type {
  AgendaItem,
  ChangeField,
  ChangeSignificance,
  EventChange,
  EventDetail,
  EventStatus,
  Exhibitor,
  PaletteId,
  Price,
  Speaker,
} from '../domain/types';
import { getCity } from '../taxonomy/cities';
import { getCategory, getTechnology } from '../taxonomy/taxonomy';
import {
  DEMO_COMPANIES,
  DEMO_ORGANIZERS,
  DEMO_TEMPLATES,
  DEMO_VENUES,
  EXHIBITOR_PREFIX,
  EXHIBITOR_SUFFIX,
  SPEAKER_FIRST,
  SPEAKER_LAST,
  SPEAKER_ROLES,
  type EventTemplate,
} from './templates';

/**
 * Deterministic generator of synthetic sample events (spec §148).
 * Dates are laid out relative to `now`, so the sample data never goes stale: the same seed
 * always produces the same events, shifted to today's date.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FALLBACK_VENUE = { name: 'Civic Convention Hall', area: 'City Centre' };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof makeRng>;
function makeRng(seed: number) {
  const next = mulberry32(seed);
  const rng = {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    sample: <T>(items: readonly T[], count: number): T[] => {
      const copy = [...items];
      const out: T[] = [];
      while (out.length < count && copy.length) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0] as T);
      return out;
    },
  };
  return rng;
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** IST wall-clock time on a given calendar day → ISO instant. */
const istAt = (dayStart: Date, hour: number, minute = 0) => new Date(dayStart.getTime() + (hour * 60 + minute) * 60_000);

const daysText = (days: number) => (days === 1 ? 'one-day' : `${['', '', 'two', 'three', 'four'][days] ?? days}-day`);

type Placement = { templateKey: string; cityId: string; dayOffset: number; nameIndex?: number; days?: number };

/**
 * Hand-placed events so the demo journeys always work: SAP events in Delhi, something
 * happening this week, an ongoing event, a large multi-day expo.
 */
const ANCHORS: Placement[] = [
  { templateKey: 'mfg-expo', cityId: 'delhi', dayOffset: -1, nameIndex: 0, days: 4 },
  { templateKey: 'ai-summit', cityId: 'bengaluru', dayOffset: 0, nameIndex: 0, days: 2 },
  { templateKey: 'odoo-meetup', cityId: 'hyderabad', dayOffset: 1 },
  { templateKey: 'cyber', cityId: 'noida', dayOffset: 2, nameIndex: 0, days: 1 },
  { templateKey: 'sap-forum', cityId: 'delhi', dayOffset: 5, nameIndex: 0, days: 2 },
  { templateKey: 'erp-summit', cityId: 'mumbai', dayOffset: 6, nameIndex: 0 },
  { templateKey: 'odoo-workshop', cityId: 'goa', dayOffset: 9 },
  { templateKey: 'sap-forum', cityId: 'gurugram', dayOffset: 12, nameIndex: 1, days: 1 },
  { templateKey: 'sap-mfg', cityId: 'hyderabad', dayOffset: 17 },
  { templateKey: 'trade-packaging', cityId: 'mumbai', dayOffset: 24, nameIndex: 0, days: 4 },
  { templateKey: 'sap-forum', cityId: 'delhi', dayOffset: 48, nameIndex: 2, days: 1 },
  { templateKey: 'cio-summit', cityId: 'goa', dayOffset: 33, nameIndex: 0, days: 2 },
];

export type DemoOptions = { now?: Date; seed?: number; upcomingCount?: number; pastCount?: number };

export function generateDemoEvents(options: DemoOptions = {}): EventDetail[] {
  const now = options.now ?? new Date();
  const rng = makeRng(options.seed ?? 20261001);
  const upcomingCount = options.upcomingCount ?? 140;
  const pastCount = options.pastCount ?? 14;
  const today = istMidnight(istParts(now).year, istParts(now).month, istParts(now).day);
  const templates = new Map(DEMO_TEMPLATES.map((t) => [t.key, t]));
  const usedTitles = new Set<string>();

  const placements: Placement[] = [...ANCHORS];
  for (let i = placements.length; i < upcomingCount; i++) {
    const template = DEMO_TEMPLATES[i % DEMO_TEMPLATES.length] as EventTemplate;
    placements.push({ templateKey: template.key, cityId: rng.pick(template.cities), dayOffset: rng.int(3, 200) });
  }
  for (let i = 0; i < pastCount; i++) {
    const template = rng.pick(DEMO_TEMPLATES);
    placements.push({ templateKey: template.key, cityId: rng.pick(template.cities), dayOffset: -rng.int(8, 75) });
  }

  return placements.map((placement, index) => {
    const template = templates.get(placement.templateKey) as EventTemplate;
    return buildEvent({ template, placement, index, rng, now, today, usedTitles });
  });
}

function buildEvent(ctx: {
  template: EventTemplate;
  placement: Placement;
  index: number;
  rng: Rng;
  now: Date;
  today: Date;
  usedTitles: Set<string>;
}): EventDetail {
  const { template: t, placement, index, rng, now, today, usedTitles } = ctx;
  const city = getCity(placement.cityId);
  if (!city) throw new Error(`Unknown demo city ${placement.cityId}`);

  // Dates: conferences prefer weekdays, meetups prefer Saturdays.
  let dayStart = new Date(today.getTime() + placement.dayOffset * DAY);
  if (placement.dayOffset > 2) {
    const weekday = istParts(dayStart).weekday;
    if (t.format === 'meetup' && weekday !== 6) dayStart = new Date(dayStart.getTime() + ((6 - weekday + 7) % 7) * DAY);
    if (t.format !== 'meetup' && (weekday === 0 || weekday === 6)) dayStart = new Date(dayStart.getTime() + (weekday === 0 ? 1 : 2) * DAY);
  }
  const days = placement.days ?? rng.int(t.days[0], t.days[1]);
  const lastDay = new Date(dayStart.getTime() + (days - 1) * DAY);
  const hours = {
    conference: [9, 30, 17, 30],
    expo: [10, 0, 18, 0],
    workshop: [10, 0, 16, 30],
    meetup: [18, 0, 20, 30],
    webinar: [16, 0, 17, 0],
  }[t.format] as [number, number, number, number];
  const startAt = istAt(dayStart, hours[0], hours[1]);
  const endAt = istAt(lastDay, hours[2], hours[3]);

  // Title: base name + city (+ year for larger events), unique across the set.
  const year = istParts(startAt).year;
  // Prefer another name variant over numbering editions, so titles read naturally.
  const cityLabel = city.name === 'New Delhi' ? 'Delhi' : city.name;
  const firstName = placement.nameIndex ?? rng.int(0, t.names.length - 1);
  const makeTitle = (name: string, suffix = '') => {
    const withCity = t.format === 'webinar' ? name : `${name} ${cityLabel}`;
    return (t.format === 'expo' || t.format === 'conference' ? `${withCity} ${year}` : withCity) + suffix;
  };
  const candidates = [...t.names.slice(firstName), ...t.names.slice(0, firstName)].map((name) => makeTitle(name));
  const month = istParts(startAt).month;
  const season = month >= 3 && month <= 5 ? 'Spring' : month >= 6 && month <= 8 ? 'Monsoon' : month >= 9 && month <= 11 ? 'Autumn' : 'Winter';
  let title = candidates.find((c) => !usedTitles.has(c)) ?? makeTitle(t.names[firstName] as string, ` · ${season} Edition`);
  for (let n = 2; usedTitles.has(title); n++) title = makeTitle(t.names[firstName] as string, ` · Edition ${n}`);
  usedTitles.add(title);
  const slug = slugify(title);
  const id = `evt_demo_${String(index + 1).padStart(3, '0')}`;

  const venueBase = rng.pick(DEMO_VENUES[city.id] ?? [FALLBACK_VENUE]);
  const venue =
    t.format === 'webinar'
      ? undefined
      : {
          name: venueBase.name,
          // The state is left out when the city already says it ("New Delhi, Delhi").
          address: [venueBase.area, city.name, city.name.includes(city.state) ? undefined : city.state].filter(Boolean).join(', '),
          latitude: round(city.latitude + (rng.next() - 0.5) * 0.08),
          longitude: round(city.longitude + (rng.next() - 0.5) * 0.08),
        };

  const organizerId = rng.pick(t.organizerIds);
  const organizerBase = DEMO_ORGANIZERS.find((o) => o.id === organizerId) ?? DEMO_ORGANIZERS[0]!;
  const organizer = { ...organizerBase, website: `https://example.com/organizers/${organizerBase.id.replace('org-', '')}` };

  const technologyIds = t.technologyIds.length ? [t.technologyIds[0]!, ...rng.sample(t.technologyIds.slice(1), rng.int(0, 2))] : [];
  const industryIds = rng.sample(t.industryIds, Math.min(t.industryIds.length, rng.int(1, 3)));
  const palette = paletteFor(t, technologyIds);

  // Timeline: when we "discovered" it and what changed since.
  const isPast = endAt < now;
  const recentAdd = index % 9 === 3 || index % 13 === 5;
  const createdAt = recentAdd
    ? new Date(now.getTime() - rng.int(1, 70) * HOUR)
    : new Date(Math.min(now.getTime() - 3 * DAY, startAt.getTime() - 5 * DAY) - rng.int(0, 40) * DAY);

  let status: EventStatus = isPast ? 'completed' : now >= startAt ? 'ongoing' : 'upcoming';
  const changes: EventChange[] = [];
  const addChange = (field: ChangeField, significance: ChangeSignificance, previous?: string, current?: string) =>
    changes.push({
      id: `${id}_chg_${changes.length + 1}`,
      field,
      significance,
      previous,
      current,
      detectedAt: new Date(Math.max(createdAt.getTime() + HOUR, now.getTime() - rng.int(2, 96) * HOUR)).toISOString(),
    });

  // Hand-placed anchor events stay as planned, so the demo journeys always find them open.
  if (!isPast && status === 'upcoming' && index >= ANCHORS.length) {
    const roll = index % 17;
    if (roll === 4) {
      status = 'postponed';
      addChange('status', 'critical', 'Upcoming', 'Postponed');
    } else if (roll === 9 && index > 20) {
      status = 'cancelled';
      addChange('status', 'critical', 'Upcoming', 'Cancelled');
    } else if (roll === 12) {
      status = 'registration_closed';
      addChange('registration', 'major', 'Open', 'Closed');
    } else if (roll === 1 || roll === 7) {
      const other = rng.pick((DEMO_VENUES[city.id] ?? [FALLBACK_VENUE]).filter((v) => v.name !== venueBase.name).concat(FALLBACK_VENUE));
      addChange('venue', 'major', other.name, venueBase.name);
    } else if (roll === 14) {
      addChange('time', 'major', '10:00 AM', formatHm(hours[0], hours[1]));
    } else if (roll === 15 && t.format === 'conference') {
      addChange('speakers', 'minor', undefined, `${rng.int(2, 5)} speakers added`);
    }
  }
  const lastChange = changes.at(-1);
  // Never in the future: recently discovered events can't have been edited later than now.
  const updatedAt = lastChange
    ? new Date(lastChange.detectedAt)
    : new Date(Math.min(now.getTime(), createdAt.getTime() + rng.int(1, 48) * HOUR));

  const speakers = makeSpeakers(t, rng, id);
  const exhibitors = makeExhibitors(t, rng, id);
  const agenda = makeAgenda(t, rng, id, dayStart, days, speakers);

  const daysWord = daysText(days);
  const summary = t.summary.replace('{days}', daysWord).replace('{city}', city.name);
  const description = [
    `${title} is a ${daysWord} ${t.format === 'expo' ? 'exhibition' : t.format === 'webinar' ? 'online session' : 'event'} organised by ${organizer.name}${venue ? ` at ${venue.name}, ${city.name}` : ''}.`,
    t.expect.join(' '),
    `It is aimed at ${joinList(t.audience.map((a) => a.toLowerCase()))}.`,
  ].join('\n\n');

  return {
    id,
    slug,
    title,
    eventType: t.eventType,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timezone: 'Asia/Kolkata',
    allDay: false,
    cityId: city.id,
    city: city.name,
    state: city.state,
    venueName: venue?.name,
    categoryIds: t.categoryIds,
    technologyIds,
    industryIds,
    tags: t.tags,
    status,
    // A few sample events wait for review; they are hidden from normal users (spec §65).
    verificationStatus: index % 41 === 40 ? 'needs_verification' : 'verified',
    attendanceMode: t.format === 'webinar' ? 'online' : rng.chance(0.15) ? 'hybrid' : 'in_person',
    price: makePrice(t, rng),
    organizer: { id: organizer.id, name: organizer.name },
    artwork: { palette, seed: rng.int(1, 1_000_000) },
    lastChange: lastChange ? { field: lastChange.field, detectedAt: lastChange.detectedAt } : undefined,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    isDemo: true,
    summary,
    description,
    venue,
    organizerDetail: organizer,
    audience: t.audience,
    speakers,
    exhibitors,
    agenda,
    registrationUrl: status === 'cancelled' || isPast ? undefined : `https://example.com/register/${slug}`,
    officialWebsite: rng.chance(0.85) ? `https://example.com/events/${slug}` : undefined,
    // Sources are re-checked by the 12-hour sync even when nothing changed.
    sources: [{ name: 'Sample data', kind: 'demo', lastCheckedAt: new Date(Math.max(updatedAt.getTime(), now.getTime() - rng.int(1, 11) * HOUR)).toISOString() }],
    changes,
    lastVerifiedAt: updatedAt.toISOString(),
  };
}

function paletteFor(t: EventTemplate, technologyIds: string[]): PaletteId {
  const tech = technologyIds[0] ? getTechnology(technologyIds[0]) : undefined;
  if (tech && !['erp-generic', 'crm-generic'].includes(tech.id)) return tech.palette;
  return getCategory(t.categoryIds[0] ?? '')?.palette ?? 'blue';
}

function makePrice(t: EventTemplate, rng: Rng): Price | undefined {
  if (rng.chance(0.15)) return undefined; // unknown: shown as "Price information unavailable"
  switch (t.format) {
    case 'expo':
      return { min: 0, currency: 'INR', note: 'Free for registered trade visitors' };
    case 'meetup':
    case 'webinar':
      return { min: 0, currency: 'INR' };
    case 'workshop':
      return { min: rng.pick([1499, 2499, 3999, 4999]), currency: 'INR' };
    default:
      if (rng.chance(0.12)) return { currency: 'INR', note: 'Contact organizer' };
      return { min: rng.pick([1999, 2999, 4999, 7999, 9999, 14999]), currency: 'INR' };
  }
}

function makeSpeakers(t: EventTemplate, rng: Rng, id: string): Speaker[] {
  if (t.format === 'expo' || t.format === 'webinar' ? rng.chance(0.7) : rng.chance(0.2)) return [];
  const count = t.format === 'conference' ? rng.int(4, 12) : rng.int(2, 4);
  const names = new Set<string>();
  const speakers: Speaker[] = [];
  while (speakers.length < count) {
    const name = `${rng.pick(SPEAKER_FIRST)} ${rng.pick(SPEAKER_LAST)}`;
    if (names.has(name)) continue;
    names.add(name);
    speakers.push({
      id: `${id}_spk_${speakers.length + 1}`,
      name,
      designation: rng.pick(SPEAKER_ROLES),
      company: rng.pick(DEMO_COMPANIES),
      topic: rng.chance(0.6) ? rng.pick(t.sessions) : undefined,
    });
  }
  return speakers;
}

function makeExhibitors(t: EventTemplate, rng: Rng, id: string): Exhibitor[] {
  const isExpo = t.format === 'expo';
  if (!isExpo && (t.format !== 'conference' || rng.chance(0.6))) return [];
  const count = isExpo ? rng.int(18, 60) : rng.int(4, 10);
  const pool = t.categoryIds.some((c) => ['manufacturing', 'automation', 'industry-4', 'logistics', 'business'].includes(c))
    ? EXHIBITOR_SUFFIX.industrial!
    : EXHIBITOR_SUFFIX.tech!;
  const used = new Set<string>();
  const exhibitors: Exhibitor[] = [];
  let guard = 0;
  while (exhibitors.length < count && guard++ < 500) {
    const company = `${rng.pick(EXHIBITOR_PREFIX)} ${rng.pick(pool)}`;
    if (used.has(company)) continue;
    used.add(company);
    exhibitors.push({
      id: `${id}_exh_${exhibitors.length + 1}`,
      company,
      industry: pool === EXHIBITOR_SUFFIX.industrial ? 'Industrial equipment' : 'Enterprise software',
      booth: isExpo ? `Hall ${rng.int(1, 4)} · ${String.fromCharCode(65 + rng.int(0, 7))}${rng.int(1, 40)}` : `Stand ${rng.int(1, 20)}`,
    });
  }
  return exhibitors.sort((a, b) => a.company.localeCompare(b.company));
}

function makeAgenda(t: EventTemplate, rng: Rng, id: string, firstDay: Date, days: number, speakers: Speaker[]): AgendaItem[] {
  if (t.format === 'webinar' || rng.chance(0.25)) return [];
  const slots: Record<EventTemplate['format'], [number, number, number][]> = {
    conference: [[9, 30, 30], [10, 0, 45], [11, 0, 60], [12, 15, 45], [13, 0, 60], [14, 0, 45], [15, 0, 45], [16, 0, 60], [17, 0, 30]],
    expo: [[10, 0, 60], [11, 30, 60], [14, 0, 60], [16, 0, 90]],
    workshop: [[10, 0, 90], [11, 45, 75], [13, 0, 45], [13, 45, 90], [15, 30, 60]],
    meetup: [[18, 0, 30], [18, 30, 30], [19, 0, 30], [19, 30, 60]],
    webinar: [],
  };
  const items: AgendaItem[] = [];
  for (let day = 1; day <= days; day++) {
    const dayStart = new Date(firstDay.getTime() + (day - 1) * DAY);
    const sessions = [...t.sessions];
    for (const [hour, minute, length] of slots[t.format]) {
      let title: string;
      if (t.format === 'conference' && hour === 9) title = day === 1 ? 'Registration and welcome coffee' : 'Welcome coffee';
      else if (t.format === 'conference' && hour === 13) title = 'Lunch and networking';
      else if (t.format === 'conference' && hour === 17) title = day === days ? 'Closing remarks' : 'End of day';
      else if (t.format === 'workshop' && hour === 13 && minute === 0) title = 'Lunch';
      // The first talk of the event is the opening session; the rest follow in any order.
      else if (day === 1 && sessions.length === t.sessions.length) title = sessions.shift() as string;
      else title = sessions.length ? (sessions.splice(rng.int(0, sessions.length - 1), 1)[0] as string) : rng.pick(t.sessions);
      const start = istAt(dayStart, hour, minute);
      const speaker = speakers.length && !/coffee|lunch|registration|closing|end of day/i.test(title) ? rng.pick(speakers) : undefined;
      items.push({
        id: `${id}_agd_${items.length + 1}`,
        day,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + length * 60_000).toISOString(),
        title,
        room: t.format === 'conference' ? rng.pick(['Main Hall', 'Main Hall', 'Hall B', 'Room 3']) : t.format === 'expo' ? 'Seminar Hall' : undefined,
        speakerIds: speaker ? [speaker.id] : undefined,
      });
    }
  }
  return items;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const formatHm = (h: number, m: number) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
const joinList = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
