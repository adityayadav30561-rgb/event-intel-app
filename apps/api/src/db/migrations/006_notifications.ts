/** Phase 7: push devices, reminders, the notification inbox and per-person alert settings. */
export const sql = /* sql */ `
create table push_subscriptions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- Reminders are an offset before the event's start, so they follow the event if its date moves.
create table reminders (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  occurrence_id text not null references event_occurrences(id) on delete cascade,
  offset_minutes int not null check (offset_minutes between 0 and 43200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, occurrence_id, offset_minutes)
);
create index reminders_pending_idx on reminders (occurrence_id) where sent_at is null;

-- Everything sent is kept here (the inbox). dedupe_key stops the same alert twice.
create table notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null check (type in ('change', 'saved_search', 'interests', 'reminder', 'starts_tomorrow')),
  title text not null,
  body text not null,
  url text not null,
  occurrence_id text references event_occurrences(id) on delete set null,
  critical boolean not null default false,
  dedupe_key text not null,
  pushed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table notification_settings (
  user_id text primary key references users(id) on delete cascade,
  -- Per type on/off; a missing type means on.
  types jsonb not null default '{}',
  -- Quiet hours in minutes after midnight, India time (default 21:00–08:00).
  quiet_start smallint not null default 1260,
  quiet_end smallint not null default 480,
  updated_at timestamptz not null default now()
);
`;
