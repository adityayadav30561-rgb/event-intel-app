/**
 * Initial schema (docs/DEVELOPMENT_PLAN.md §6.1–6.2): event content, taxonomy, provenance and sync.
 * User accounts and personal tracking tables arrive with sign-in (Phase 4) and tracking (Phase 5).
 * There are intentionally no lead, contact, customer, opportunity or pipeline tables.
 */
export const sql = /* sql */ `
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ── Taxonomy and places (configurable) ─────────────────────────────────────
create table regions (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}'
);

create table cities (
  id text primary key,
  name text not null,
  state text not null,
  region_id text references regions(id),
  aliases text[] not null default '{}',
  latitude double precision,
  longitude double precision,
  popular boolean not null default false
);

create table categories (
  id text primary key,
  name text not null,
  keywords text[] not null default '{}',
  palette text not null default 'blue',
  icon text not null default 'pricetag',
  sort int not null default 0,
  is_active boolean not null default true
);
create table technologies (like categories including all);
create table industries (like categories including all);

create table event_types (
  id text primary key,
  name text not null,
  sort int not null default 0,
  is_active boolean not null default true
);

-- ── Organizers, venues, people ─────────────────────────────────────────────
create table organizers (
  id text primary key,
  name text not null,
  website text,
  description text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizers_name_trgm on organizers using gin (name gin_trgm_ops);

create table venues (
  id text primary key,
  name text not null,
  address text,
  city_id text references cities(id),
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table speakers (
  id text primary key,
  name text not null,
  designation text,
  company text
);
create index speakers_name_trgm on speakers using gin (name gin_trgm_ops);

create table exhibitors (
  id text primary key,
  company text not null,
  industry text,
  website text
);
create index exhibitors_company_trgm on exhibitors using gin (company gin_trgm_ops);

-- ── Events: a series has editions (occurrences); the app shows occurrences ──
create table event_series (
  id text primary key,
  name text not null,
  organizer_id text references organizers(id),
  website text,
  created_at timestamptz not null default now()
);

create table event_occurrences (
  id text primary key,
  series_id text references event_series(id),
  slug text not null,
  title text not null,
  summary text,
  summary_is_generated boolean not null default false,
  description text,
  event_type text not null references event_types(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  all_day boolean not null default false,
  city_id text not null references cities(id),
  venue_id text references venues(id),
  organizer_id text references organizers(id),
  attendance_mode text not null default 'in_person' check (attendance_mode in ('in_person', 'online', 'hybrid')),
  registration_url text,
  official_website text,
  price_min int,
  price_max int,
  currency text not null default 'INR',
  price_note text,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'ongoing', 'completed', 'cancelled', 'postponed', 'rescheduled', 'registration_closed')),
  verification_status text not null default 'needs_verification'
    check (verification_status in ('needs_verification', 'verified', 'rejected')),
  audience text[] not null default '{}',
  tags text[] not null default '{}',
  image_url text,
  thumbnail_url text,
  image_alt text,
  artwork_palette text not null default 'blue',
  artwork_seed int not null default 1,
  is_demo boolean not null default false,
  content_hash text,
  search_vector tsvector,
  /** Plain text for typo-tolerant (trigram) matching. */
  search_text text not null default '',
  last_change_field text,
  last_change_at timestamptz,
  last_verified_at timestamptz,
  last_synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at >= start_at)
);

create index occ_visible_start on event_occurrences (start_at, id) where verification_status = 'verified' and deleted_at is null;
create index occ_city_start on event_occurrences (city_id, start_at);
create index occ_end on event_occurrences (end_at);
create index occ_created on event_occurrences (created_at desc, id);
create index occ_updated on event_occurrences (updated_at desc, id);
create index occ_last_change on event_occurrences (last_change_at desc) where last_change_at is not null;
create index occ_organizer on event_occurrences (organizer_id);
create index occ_search on event_occurrences using gin (search_vector);
create index occ_search_trgm on event_occurrences using gin (search_text gin_trgm_ops);

create table occurrence_categories (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  category_id text not null references categories(id),
  position int not null default 0,
  source text not null default 'rule',
  primary key (occurrence_id, category_id)
);
create index occ_categories_by_category on occurrence_categories (category_id);

create table occurrence_technologies (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  technology_id text not null references technologies(id),
  position int not null default 0,
  source text not null default 'rule',
  primary key (occurrence_id, technology_id)
);
create index occ_technologies_by_technology on occurrence_technologies (technology_id);

create table occurrence_industries (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  industry_id text not null references industries(id),
  position int not null default 0,
  source text not null default 'rule',
  primary key (occurrence_id, industry_id)
);
create index occ_industries_by_industry on occurrence_industries (industry_id);

create table occurrence_speakers (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  speaker_id text not null references speakers(id),
  topic text,
  position int not null default 0,
  primary key (occurrence_id, speaker_id)
);
create index occ_speakers_by_speaker on occurrence_speakers (speaker_id);

create table occurrence_exhibitors (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  exhibitor_id text not null references exhibitors(id),
  booth text,
  primary key (occurrence_id, exhibitor_id)
);
create index occ_exhibitors_by_exhibitor on occurrence_exhibitors (exhibitor_id);

create table agenda_items (
  id text primary key,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  day int not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null,
  description text,
  room text,
  speaker_ids text[] not null default '{}'
);
create index agenda_by_occurrence on agenda_items (occurrence_id, starts_at);

create table collections (
  id text primary key,
  name text not null,
  description text,
  filter jsonb not null default '{}',
  sort int not null default 0,
  is_active boolean not null default true
);

-- ── Provenance, quality and sync ───────────────────────────────────────────
create table sources (
  id text primary key,
  name text not null,
  adapter text not null,
  kind text not null,
  config jsonb not null default '{}',
  priority int not null default 50,
  enabled boolean not null default false,
  compliance_note text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  health text not null default 'unknown' check (health in ('unknown', 'healthy', 'warning', 'failed'))
);

create table occurrence_sources (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  source_id text not null references sources(id),
  source_url text,
  last_checked_at timestamptz not null default now(),
  primary key (occurrence_id, source_id)
);

create table source_records (
  id text primary key,
  source_id text not null references sources(id),
  source_event_id text,
  source_url text,
  raw_title text,
  raw_description text,
  raw_date text,
  raw_venue text,
  raw_organizer text,
  raw_image text,
  raw_payload jsonb,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  occurrence_id text references event_occurrences(id) on delete set null,
  unique (source_id, source_event_id)
);

create table field_overrides (
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  field text not null,
  value jsonb,
  edited_by text,
  edited_at timestamptz not null default now(),
  primary key (occurrence_id, field)
);

create table source_conflicts (
  id text primary key,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  field text not null,
  values_json jsonb not null,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table duplicate_candidates (
  id text primary key,
  occurrence_a text not null references event_occurrences(id) on delete cascade,
  occurrence_b text not null references event_occurrences(id) on delete cascade,
  score real not null,
  signals jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'merged', 'dismissed')),
  created_at timestamptz not null default now()
);

create table event_changes (
  id text primary key,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  field text not null,
  significance text not null check (significance in ('critical', 'major', 'minor')),
  old_value text,
  new_value text,
  source_id text references sources(id),
  detected_at timestamptz not null default now()
);
create index event_changes_by_occurrence on event_changes (occurrence_id, detected_at desc);

create table sync_runs (
  id text primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial_success', 'failed')),
  sources_processed int not null default 0,
  fetched int not null default 0,
  created int not null default 0,
  updated int not null default 0,
  unchanged int not null default 0,
  cancelled int not null default 0,
  postponed int not null default 0,
  duplicates int not null default 0,
  errors jsonb not null default '[]'
);

create table sync_run_sources (
  sync_run_id text not null references sync_runs(id) on delete cascade,
  source_id text not null references sources(id),
  status text not null,
  fetched int not null default 0,
  attempts int not null default 1,
  error text,
  primary key (sync_run_id, source_id)
);

-- Small key-value store for job bookkeeping (e.g. last demo refresh).
create table app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
`;
