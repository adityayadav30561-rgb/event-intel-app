/** Phase 9: indexes found in the query review. */
export const sql = /* sql */ `
-- Change alerts read the changes detected since the last run.
create index event_changes_detected_idx on event_changes (detected_at);
-- Who follows a changed event.
create index user_event_tracking_following_idx on user_event_tracking (occurrence_id) where following;
-- Merged events, looked up when a source brings the hidden copy back.
create index occ_merged_into on event_occurrences (merged_into) where merged_into is not null;
-- Clean-up of expired sign-ins.
create index refresh_tokens_expires_idx on refresh_tokens (expires_at);
`;
