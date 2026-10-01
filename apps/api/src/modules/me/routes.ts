import {
  CATEGORIES,
  EMPTY_PREFERENCES,
  INDUSTRIES,
  preferencesSchema,
  rankByRelevance,
  TECHNOLOGIES,
  updateMeSchema,
  type EventType,
  type Preferences,
} from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { HttpError, parse } from '../../lib/http';
import type { AuthService } from '../auth/service';
import type { EventService } from '../events/service';

const known = {
  categoryIds: new Set(CATEGORIES.map((t) => t.id)),
  technologyIds: new Set(TECHNOLOGIES.map((t) => t.id)),
  industryIds: new Set(INDUSTRIES.map((t) => t.id)),
};

export async function loadPreferences(db: Db, userId: string): Promise<Preferences> {
  const [row] = await db.query<{ city_ids: string[]; category_ids: string[]; technology_ids: string[]; industry_ids: string[]; event_types: EventType[] }>(
    'select city_ids, category_ids, technology_ids, industry_ids, event_types from user_preferences where user_id = $1',
    [userId],
  );
  if (!row) return EMPTY_PREFERENCES;
  return { cityIds: row.city_ids, categoryIds: row.category_ids, technologyIds: row.technology_ids, industryIds: row.industry_ids, eventTypes: row.event_types };
}

/** The signed-in person's profile, interests and suggestions (docs/DEVELOPMENT_PLAN.md §7). */
export function meRoutes(db: Db, auth: AuthService, events: EventService): Router {
  const router = Router();

  router.get('/me', async (req, res) => {
    res.json(await auth.me(req.auth!.id));
  });

  router.patch('/me', async (req, res) => {
    const input = parse(updateMeSchema, req.body);
    res.json(await auth.setOnboarded(req.auth!.id, input.name));
  });

  router.get('/me/preferences', async (req, res) => {
    res.json(await loadPreferences(db, req.auth!.id));
  });

  router.put('/me/preferences', async (req, res) => {
    const prefs = parse(preferencesSchema, req.body);
    // Only ids the app knows about: a typo or a removed topic would silently never match.
    for (const field of ['categoryIds', 'technologyIds', 'industryIds'] as const) {
      const unknown = prefs[field].filter((id) => !known[field].has(id));
      if (unknown.length) throw new HttpError(400, 'invalid_request', 'Some interests are not recognised', { [field]: unknown });
    }
    if (prefs.cityIds.length) {
      const found = await db.query<{ id: string }>('select id from cities where id = any($1::text[])', [prefs.cityIds]);
      const unknown = prefs.cityIds.filter((id) => !found.some((c) => c.id === id));
      if (unknown.length) throw new HttpError(400, 'invalid_request', 'Some cities are not recognised', { cityIds: unknown });
    }
    const unique = <T>(list: T[]) => [...new Set(list)];
    await db.query(
      `insert into user_preferences (user_id, city_ids, category_ids, technology_ids, industry_ids, event_types, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (user_id) do update set city_ids = excluded.city_ids, category_ids = excluded.category_ids, technology_ids = excluded.technology_ids,
         industry_ids = excluded.industry_ids, event_types = excluded.event_types, updated_at = now()`,
      [req.auth!.id, unique(prefs.cityIds), unique(prefs.categoryIds), unique(prefs.technologyIds), unique(prefs.industryIds), unique(prefs.eventTypes)],
    );
    res.json(await loadPreferences(db, req.auth!.id));
  });

  /** "Events you may want to track": upcoming events ranked by the shared relevance rules. */
  router.get('/me/for-you', async (req, res) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) }), req.query);
    const prefs = await loadPreferences(db, req.auth!.id);
    const now = new Date();
    const candidates = await events.repo.select(
      (sql) => {
        sql.and(`o.status not in ('cancelled', 'completed')`);
        sql.and(`o.start_at < ${sql.param(new Date(now.getTime() + 365 * 86_400_000))}`);
      },
      'o.start_at asc, o.id asc',
      500,
      now,
    );
    res.json({ items: rankByRelevance(candidates, prefs).slice(0, limit) });
  });

  return router;
}
