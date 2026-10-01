import { EMPTY_PREFERENCES, type EventType, type Preferences } from '@eii/shared';
import type { Db } from '../../db/client';

/** A person's interests (empty when they haven't chosen any). */
export async function loadPreferences(db: Db, userId: string): Promise<Preferences> {
  const [row] = await db.query<{ city_ids: string[]; category_ids: string[]; technology_ids: string[]; industry_ids: string[]; event_types: EventType[] }>(
    'select city_ids, category_ids, technology_ids, industry_ids, event_types from user_preferences where user_id = $1',
    [userId],
  );
  if (!row) return EMPTY_PREFERENCES;
  return { cityIds: row.city_ids, categoryIds: row.category_ids, technologyIds: row.technology_ids, industryIds: row.industry_ids, eventTypes: row.event_types };
}
