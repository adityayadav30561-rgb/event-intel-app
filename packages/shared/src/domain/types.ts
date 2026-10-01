/**
 * Core domain types (docs/DEVELOPMENT_PLAN.md §6). Independent of UI and storage.
 * The unit the app shows is an event *occurrence* (one edition with its own dates and venue);
 * in the app it is simply called an "event".
 *
 * There are intentionally no Lead, Contact, Customer, Opportunity or Pipeline types.
 */

export const EVENT_TYPES = [
  'conference',
  'expo',
  'exhibition',
  'trade_show',
  'summit',
  'seminar',
  'workshop',
  'meetup',
  'networking',
  'roundtable',
  'webinar',
  'hackathon',
  'training',
  'product_launch',
  'industry_forum',
  'business_forum',
  'technology_event',
  'government_event',
  'community_event',
  'convention',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  'upcoming',
  'ongoing',
  'completed',
  'cancelled',
  'postponed',
  'rescheduled',
  'registration_closed',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const VERIFICATION_STATUSES = ['needs_verification', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ATTENDANCE_MODES = ['in_person', 'online', 'hybrid'] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

/** Fields whose changes are tracked and shown to users (spec §66). */
export const CHANGE_FIELDS = [
  'date',
  'time',
  'venue',
  'organizer',
  'registration',
  'price',
  'status',
  'speakers',
  'exhibitors',
  'agenda',
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

export type ChangeSignificance = 'critical' | 'major' | 'minor';

/** Generated cover artwork, used when an event has no image of its own. */
export type Artwork = { palette: PaletteId; seed: number };

export const PALETTE_IDS = [
  'blue',
  'indigo',
  'violet',
  'teal',
  'green',
  'orange',
  'amber',
  'rose',
  'slate',
  'sky',
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export type Price = {
  /** Lowest price in rupees; 0 means free. */
  min?: number;
  max?: number;
  currency: 'INR';
  /** Free text such as "Free for trade visitors" or "Contact organizer". */
  note?: string;
};

export type OrganizerSummary = { id: string; name: string };

export type Organizer = OrganizerSummary & {
  website?: string;
  description?: string;
};

export type Venue = {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export type Speaker = {
  id: string;
  name: string;
  designation?: string;
  company?: string;
  topic?: string;
};

export type Exhibitor = {
  id: string;
  company: string;
  industry?: string;
  website?: string;
  booth?: string;
};

export type AgendaItem = {
  id: string;
  /** 1-based day of the event. */
  day: number;
  startsAt: string;
  endsAt?: string;
  title: string;
  description?: string;
  room?: string;
  speakerIds?: string[];
};

export type SourceKind = 'official_organizer' | 'official_event' | 'official_venue' | 'platform' | 'directory' | 'curated' | 'demo';

export type SourceRef = {
  name: string;
  kind: SourceKind;
  url?: string;
  lastCheckedAt: string;
};

export type EventChange = {
  id: string;
  field: ChangeField;
  significance: ChangeSignificance;
  previous?: string;
  current?: string;
  detectedAt: string;
};

/** What lists and cards need. Kept small so pages of results stay light. */
export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  eventType: EventType;
  /** ISO instants. */
  startAt: string;
  endAt: string;
  timezone: string;
  /** True when no specific start/end times are known. */
  allDay: boolean;
  cityId: string;
  city: string;
  state: string;
  venueName?: string;
  categoryIds: string[];
  technologyIds: string[];
  industryIds: string[];
  tags: string[];
  status: EventStatus;
  verificationStatus: VerificationStatus;
  attendanceMode: AttendanceMode;
  price?: Price;
  organizer?: OrganizerSummary;
  imageUrl?: string;
  artwork: Artwork;
  /** Most recent meaningful change, for "Recently updated". */
  lastChange?: Pick<EventChange, 'field' | 'detectedAt'>;
  createdAt: string;
  updatedAt: string;
  /** Synthetic sample data; never presented as a verified real-world event. */
  isDemo: boolean;
};

export type EventDetail = EventSummary & {
  summary?: string;
  description?: string;
  venue?: Venue;
  organizerDetail?: Organizer;
  audience: string[];
  speakers: Speaker[];
  exhibitors: Exhibitor[];
  agenda: AgendaItem[];
  registrationUrl?: string;
  officialWebsite?: string;
  sources: SourceRef[];
  changes: EventChange[];
  lastVerifiedAt?: string;
};
