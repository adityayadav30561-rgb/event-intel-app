/** Phase 4: team accounts, sessions, interests and a sign-in audit trail. */
export const sql = /* sql */ `
create table users (
  id text primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'researcher', 'user')),
  is_active boolean not null default true,
  -- Accounts start with a temporary password the admin hands over; the owner replaces it on first sign-in.
  must_change_password boolean not null default true,
  onboarded_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Refresh tokens are stored hashed. Each refresh replaces the token; presenting a replaced token
-- again means it was copied, so the whole family (one sign-in on one device) is revoked.
create table refresh_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  family_id text not null,
  token_hash text not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by text
);
create index refresh_tokens_user_idx on refresh_tokens (user_id);
create index refresh_tokens_family_idx on refresh_tokens (family_id);

create table user_preferences (
  user_id text primary key references users(id) on delete cascade,
  city_ids text[] not null default '{}',
  category_ids text[] not null default '{}',
  technology_ids text[] not null default '{}',
  industry_ids text[] not null default '{}',
  event_types text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id text references users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  ip text,
  at timestamptz not null default now()
);
create index audit_log_at_idx on audit_log (at desc);
`;
