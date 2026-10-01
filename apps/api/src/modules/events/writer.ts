import type { EventDetail } from '@eii/shared';
import type { Db } from '../../db/client';
import { searchDocument } from './searchDocument';

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/**
 * Saves a complete event occurrence with everything attached to it, replacing what was there.
 * Used by the sample-data seed now and by the ingestion pipeline (Phase 3) later.
 * Call inside a transaction.
 */
export async function upsertEvent(db: Db, event: EventDetail, sourceId: string): Promise<void> {
  const organizer = event.organizerDetail ?? event.organizer;
  if (organizer) {
    await db.query(
      `insert into organizers (id, name, website, description) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, website = excluded.website, description = excluded.description, updated_at = now()`,
      [organizer.id, organizer.name, 'website' in organizer ? (organizer.website ?? null) : null, 'description' in organizer ? (organizer.description ?? null) : null],
    );
  }

  let venueId: string | null = null;
  if (event.venue) {
    venueId = `ven_${slug(`${event.venue.name}-${event.cityId}`)}`;
    await db.query(
      `insert into venues (id, name, address, city_id, latitude, longitude) values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set name = excluded.name, address = excluded.address, latitude = excluded.latitude, longitude = excluded.longitude`,
      [venueId, event.venue.name, event.venue.address ?? null, event.cityId, event.venue.latitude ?? null, event.venue.longitude ?? null],
    );
  }

  const doc = searchDocument(event);
  await db.query(
    `insert into event_occurrences (
       id, slug, title, summary, description, event_type, start_at, end_at, timezone, all_day, city_id, venue_id, organizer_id,
       attendance_mode, registration_url, official_website, price_min, price_max, currency, price_note, status, verification_status,
       audience, tags, image_url, artwork_palette, artwork_seed, is_demo, search_vector, search_text,
       last_change_field, last_change_at, last_verified_at, last_synced_at, created_at, updated_at, deleted_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27, $28,
       setweight(to_tsvector('simple', $29), 'A') || setweight(to_tsvector('simple', $30), 'B') ||
       setweight(to_tsvector('simple', $31), 'C') || setweight(to_tsvector('simple', $32), 'D'),
       $33, $34, $35, $36, now(), $37, $38, null
     )
     on conflict (id) do update set
       slug = excluded.slug, title = excluded.title, summary = excluded.summary, description = excluded.description,
       event_type = excluded.event_type, start_at = excluded.start_at, end_at = excluded.end_at, timezone = excluded.timezone,
       all_day = excluded.all_day, city_id = excluded.city_id, venue_id = excluded.venue_id, organizer_id = excluded.organizer_id,
       attendance_mode = excluded.attendance_mode, registration_url = excluded.registration_url,
       official_website = excluded.official_website, price_min = excluded.price_min, price_max = excluded.price_max,
       currency = excluded.currency, price_note = excluded.price_note, status = excluded.status,
       verification_status = excluded.verification_status, audience = excluded.audience, tags = excluded.tags,
       image_url = excluded.image_url, artwork_palette = excluded.artwork_palette, artwork_seed = excluded.artwork_seed,
       is_demo = excluded.is_demo, search_vector = excluded.search_vector, search_text = excluded.search_text,
       last_change_field = excluded.last_change_field, last_change_at = excluded.last_change_at,
       last_verified_at = excluded.last_verified_at, last_synced_at = now(), updated_at = excluded.updated_at, deleted_at = null`,
    [
      event.id,
      event.slug,
      event.title,
      event.summary ?? null,
      event.description ?? null,
      event.eventType,
      event.startAt,
      event.endAt,
      event.timezone,
      event.allDay,
      event.cityId,
      venueId,
      organizer?.id ?? null,
      event.attendanceMode,
      event.registrationUrl ?? null,
      event.officialWebsite ?? null,
      event.price?.min ?? null,
      event.price?.max ?? null,
      event.price?.currency ?? 'INR',
      event.price?.note ?? null,
      event.status,
      event.verificationStatus,
      event.audience,
      event.tags,
      event.imageUrl ?? null,
      event.artwork.palette,
      event.artwork.seed,
      event.isDemo,
      doc.a,
      doc.b,
      doc.c,
      doc.d,
      doc.trigram,
      event.lastChange?.field ?? null,
      event.lastChange?.detectedAt ?? null,
      event.lastVerifiedAt ?? null,
      event.createdAt,
      event.updatedAt,
    ],
  );

  // Topics: replace the set, keeping their order (the first one decides the artwork colour).
  for (const [table, column, ids] of [
    ['occurrence_categories', 'category_id', event.categoryIds],
    ['occurrence_technologies', 'technology_id', event.technologyIds],
    ['occurrence_industries', 'industry_id', event.industryIds],
  ] as const) {
    await db.query(`delete from ${table} where occurrence_id = $1`, [event.id]);
    if (ids.length) {
      await db.query(
        `insert into ${table} (occurrence_id, ${column}, position) select $1, t.id, t.ord - 1 from unnest($2::text[]) with ordinality as t(id, ord)`,
        [event.id, ids],
      );
    }
  }

  await db.query('delete from occurrence_speakers where occurrence_id = $1', [event.id]);
  if (event.speakers.length) {
    const s = event.speakers;
    await db.query(
      `insert into speakers (id, name, designation, company)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
       on conflict (id) do update set name = excluded.name, designation = excluded.designation, company = excluded.company`,
      [s.map((x) => x.id), s.map((x) => x.name), s.map((x) => x.designation ?? null), s.map((x) => x.company ?? null)],
    );
    await db.query(
      `insert into occurrence_speakers (occurrence_id, speaker_id, topic, position)
       select $1, t.id, t.topic, t.ord - 1 from unnest($2::text[], $3::text[]) with ordinality as t(id, topic, ord)`,
      [event.id, s.map((x) => x.id), s.map((x) => x.topic ?? null)],
    );
  }

  await db.query('delete from occurrence_exhibitors where occurrence_id = $1', [event.id]);
  if (event.exhibitors.length) {
    const x = event.exhibitors;
    await db.query(
      `insert into exhibitors (id, company, industry, website)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
       on conflict (id) do update set company = excluded.company, industry = excluded.industry, website = excluded.website`,
      [x.map((e) => e.id), x.map((e) => e.company), x.map((e) => e.industry ?? null), x.map((e) => e.website ?? null)],
    );
    await db.query(
      `insert into occurrence_exhibitors (occurrence_id, exhibitor_id, booth)
       select $1, t.id, t.booth from unnest($2::text[], $3::text[]) as t(id, booth)`,
      [event.id, x.map((e) => e.id), x.map((e) => e.booth ?? null)],
    );
  }

  await db.query('delete from agenda_items where occurrence_id = $1', [event.id]);
  if (event.agenda.length) {
    const a = event.agenda;
    await db.query(
      `insert into agenda_items (id, occurrence_id, day, starts_at, ends_at, title, description, room, speaker_ids)
       select t.id, $1, t.day, t.starts_at, t.ends_at, t.title, t.description, t.room,
              coalesce(string_to_array(nullif(t.speakers, ''), ','), '{}')
       from unnest($2::text[], $3::int[], $4::timestamptz[], $5::timestamptz[], $6::text[], $7::text[], $8::text[], $9::text[])
         as t(id, day, starts_at, ends_at, title, description, room, speakers)`,
      [
        event.id,
        a.map((i) => i.id),
        a.map((i) => i.day),
        a.map((i) => i.startsAt),
        a.map((i) => i.endsAt ?? null),
        a.map((i) => i.title),
        a.map((i) => i.description ?? null),
        a.map((i) => i.room ?? null),
        a.map((i) => (i.speakerIds ?? []).join(',')),
      ],
    );
  }

  const checked = event.sources[0]?.lastCheckedAt ?? new Date().toISOString();
  await db.query(
    `insert into occurrence_sources (occurrence_id, source_id, source_url, last_checked_at) values ($1, $2, $3, $4)
     on conflict (occurrence_id, source_id) do update set source_url = excluded.source_url, last_checked_at = excluded.last_checked_at`,
    [event.id, sourceId, event.sources[0]?.url ?? null, checked],
  );

  for (const change of event.changes) {
    await db.query(
      `insert into event_changes (id, occurrence_id, field, significance, old_value, new_value, source_id, detected_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [change.id, event.id, change.field, change.significance, change.previous ?? null, change.current ?? null, sourceId, change.detectedAt],
    );
  }
}
