/** Phase 6: saved searches (§68). Match alerts use them from Phase 7. */
export const sql = /* sql */ `
create table saved_searches (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  query jsonb not null,
  notify boolean not null default true,
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_searches_user_idx on saved_searches (user_id);
`;
