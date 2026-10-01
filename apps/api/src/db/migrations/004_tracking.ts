/** Phase 5: personal tracking — saves, follows, visit plans, notes and checklists — synced from phones. */
export const sql = /* sql */ `
create table user_event_tracking (
  user_id text not null references users(id) on delete cascade,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  saved boolean not null default false,
  following boolean not null default false,
  status text check (status in ('planning', 'confirmed', 'visiting', 'visited', 'not_visited')),
  visit_date date,
  travel_notes text,
  visited_at timestamptz,
  -- When each field last changed on a phone: the latest change wins, field by field.
  field_at jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, occurrence_id)
);
create index user_event_tracking_occurrence_idx on user_event_tracking (occurrence_id) where status is not null;

create table event_notes (
  user_id text not null references users(id) on delete cascade,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  body text not null,
  updated_at timestamptz not null,
  primary key (user_id, occurrence_id)
);

create table checklist_items (
  user_id text not null references users(id) on delete cascade,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  item_id text not null,
  label text not null,
  is_default boolean not null default false,
  done boolean not null default false,
  sort int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  primary key (user_id, occurrence_id, item_id)
);

-- Change ids already applied, so a phone resending its queue changes nothing (kept 30 days).
create table applied_changes (
  user_id text not null references users(id) on delete cascade,
  change_id text not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, change_id)
);
`;
