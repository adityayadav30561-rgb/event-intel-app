import { savedSearchSchema, type SavedSearch } from '@eii/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../../db/client';
import { HttpError, notFound, parse } from '../../lib/http';
import { newId } from '../auth/crypto';

type Row = { id: string; name: string; query: SavedSearch['query']; notify: boolean; created_at: Date; updated_at: Date };
const toSaved = (r: Row): SavedSearch => ({
  id: r.id,
  name: r.name,
  query: r.query,
  notify: r.notify,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
});

/** A person keeps up to this many searches. */
const MAX_SAVED = 50;

/** Saved searches (§68): GET / POST /me/saved-searches, PATCH / DELETE /me/saved-searches/:id. */
export function savedSearchRoutes(db: Db): Router {
  const router = Router();
  const id = z.string().min(1).max(60);

  router.get('/me/saved-searches', async (req, res) => {
    const rows = await db.query<Row>('select * from saved_searches where user_id = $1 order by created_at desc', [req.auth!.id]);
    res.json({ items: rows.map(toSaved) });
  });

  router.post('/me/saved-searches', async (req, res) => {
    const input = parse(savedSearchSchema, req.body);
    const [{ n }] = (await db.query<{ n: number }>('select count(*)::int as n from saved_searches where user_id = $1', [req.auth!.id])) as [{ n: number }];
    if (n >= MAX_SAVED) throw new HttpError(400, 'too_many', `You can keep up to ${MAX_SAVED} saved searches. Delete one first.`);
    const [row] = await db.query<Row>('insert into saved_searches (id, user_id, name, query, notify) values ($1, $2, $3, $4, $5) returning *', [
      newId('ss'),
      req.auth!.id,
      input.name,
      JSON.stringify(input.query),
      input.notify,
    ]);
    res.status(201).json(toSaved(row!));
  });

  router.patch('/me/saved-searches/:id', async (req, res) => {
    const input = parse(savedSearchSchema.partial(), req.body);
    const [row] = await db.query<Row>(
      `update saved_searches set name = coalesce($3, name), query = coalesce($4, query), notify = coalesce($5, notify), updated_at = now()
       where id = $1 and user_id = $2 returning *`,
      [parse(id, req.params.id), req.auth!.id, input.name ?? null, input.query ? JSON.stringify(input.query) : null, input.notify ?? null],
    );
    if (!row) throw notFound('Saved search');
    res.json(toSaved(row));
  });

  router.delete('/me/saved-searches/:id', async (req, res) => {
    await db.query('delete from saved_searches where id = $1 and user_id = $2', [parse(id, req.params.id), req.auth!.id]);
    res.status(204).end();
  });

  return router;
}
