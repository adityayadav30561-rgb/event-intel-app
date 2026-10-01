/** Phase 3: ingestion bookkeeping — source trust and health, primary source per event, skip counts. */
export const sql = /* sql */ `
alter table sources add column trusted boolean not null default false;
alter table sources add column last_error text;
alter table sources add column events_found int not null default 0;

alter table event_occurrences add column primary_source_id text references sources(id);

alter table sync_runs add column skipped int not null default 0;
alter table sync_runs add column skip_reasons jsonb not null default '{}';

-- Online events from Indian organisers have no city; they live under this pseudo-city.
insert into cities (id, name, state, aliases, popular) values ('online', 'Online', 'India', '{}', false)
  on conflict (id) do nothing;
`;
