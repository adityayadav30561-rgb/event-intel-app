/** Phase 8: admin tools — source switches that survive restarts, merges, and the team's own edits. */
export const sql = /* sql */ `
-- Set from the app (More → Admin → Sources); when null, SOURCES_ENABLED decides.
alter table sources add column admin_enabled boolean;

-- A merged duplicate points at the event it was merged into (it stays, hidden, for history).
alter table event_occurrences add column merged_into text references event_occurrences(id);

-- One open conflict per event and field.
create unique index source_conflicts_open_idx on source_conflicts (occurrence_id, field) where resolved_at is null;

-- Edits, additions and merges by the team are recorded against this source.
insert into sources (id, name, adapter, kind, priority, enabled, trusted, compliance_note)
values ('manual', 'Added by the team', 'manual', 'curated', 95, false, true, 'Events added or corrected in the app by the team.')
on conflict (id) do nothing;
`;
