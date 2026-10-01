import type { AttendanceMode, ChangeField, EventStatus, EventSummary, EventType, PaletteId, VerificationStatus } from '@eii/shared';

/** Columns every event list returns (one row per occurrence). */
export const SUMMARY_COLUMNS = /* sql */ `
  o.id, o.slug, o.title, o.event_type, o.start_at, o.end_at, o.timezone, o.all_day, o.city_id,
  c.name as city, c.state, v.name as venue_name,
  array(select x.category_id from occurrence_categories x where x.occurrence_id = o.id order by x.position) as category_ids,
  array(select x.technology_id from occurrence_technologies x where x.occurrence_id = o.id order by x.position) as technology_ids,
  array(select x.industry_id from occurrence_industries x where x.occurrence_id = o.id order by x.position) as industry_ids,
  o.tags, o.status, o.verification_status, o.attendance_mode, o.price_min, o.price_max, o.currency, o.price_note,
  o.organizer_id, org.name as organizer_name, o.image_url, o.artwork_palette, o.artwork_seed,
  o.last_change_field, o.last_change_at, o.created_at, o.updated_at, o.is_demo`;

export const SUMMARY_FROM = /* sql */ `
  from event_occurrences o
  join cities c on c.id = o.city_id
  left join venues v on v.id = o.venue_id
  left join organizers org on org.id = o.organizer_id`;

export type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  start_at: Date | string;
  end_at: Date | string;
  timezone: string;
  all_day: boolean;
  city_id: string;
  city: string;
  state: string;
  venue_name: string | null;
  category_ids: string[];
  technology_ids: string[];
  industry_ids: string[];
  tags: string[];
  status: EventStatus;
  verification_status: VerificationStatus;
  attendance_mode: AttendanceMode;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  price_note: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
  image_url: string | null;
  artwork_palette: PaletteId;
  artwork_seed: number;
  last_change_field: ChangeField | null;
  last_change_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  is_demo: boolean;
  distance_km?: number | null;
};

export const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();
export const isoOrUndefined = (value: Date | string | null | undefined) => (value ? iso(value) : undefined);
const orUndefined = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);

export function toSummary(row: SummaryRow): EventSummary & { distanceKm?: number } {
  const hasPrice = row.price_min !== null || row.price_max !== null || row.price_note !== null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    eventType: row.event_type,
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    timezone: row.timezone,
    allDay: row.all_day,
    cityId: row.city_id,
    city: row.city,
    state: row.state,
    venueName: orUndefined(row.venue_name),
    categoryIds: row.category_ids ?? [],
    technologyIds: row.technology_ids ?? [],
    industryIds: row.industry_ids ?? [],
    tags: row.tags ?? [],
    status: row.status,
    verificationStatus: row.verification_status,
    attendanceMode: row.attendance_mode,
    price: hasPrice
      ? { min: orUndefined(row.price_min), max: orUndefined(row.price_max), currency: 'INR', note: orUndefined(row.price_note) }
      : undefined,
    organizer: row.organizer_id && row.organizer_name ? { id: row.organizer_id, name: row.organizer_name } : undefined,
    imageUrl: orUndefined(row.image_url),
    artwork: { palette: row.artwork_palette, seed: row.artwork_seed },
    lastChange: row.last_change_field && row.last_change_at ? { field: row.last_change_field, detectedAt: iso(row.last_change_at) } : undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    isDemo: row.is_demo,
    ...(row.distance_km !== undefined && row.distance_km !== null ? { distanceKm: Math.round(row.distance_km * 10) / 10 } : {}),
  };
}
