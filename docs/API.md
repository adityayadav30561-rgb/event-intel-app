# API

The app's only backend: `https://event-intel-api.onrender.com`. Request and response shapes are the zod schemas and types in `packages/shared/src/contracts/`; the routes are in `apps/api/src/modules/*/routes.ts`.

## Conventions

- **Base path:** `/v1`. JSON in and out, request bodies up to 100 KB.
- **Sign-in:** every `/v1` route except `/v1/auth/*` needs `Authorization: Bearer <access token>`. Access tokens last 15 minutes; refresh tokens rotate on every use.
- **Temporary passwords:** a session signed in with one can only change its password until it does.
- **Roles:** `user` (everyone), `researcher` (admin data tools), `admin` (also Team and Backup).
- **Errors:** `{ "error": { "code": "…", "message": "…" } }` with 400 `invalid_request`, 401, 403, 404, 409, 422 or 429.
- **Rate limits:** 300 requests a minute per person; sign-in and password changes are limited further.
- **Lists:** cursor pagination: pass `cursor` from the previous page's `nextCursor`.
- **Caching:** responses carry an `ETag` (unchanged data answers 304); event data adds a short `Cache-Control: private` lifetime; the inbox, reminders and admin data are `no-store`.

## Public (no sign-in)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` (`?db=1` also checks the database) | Uptime check |
| GET | `/calendar/:file.ics?sig=…` | Signed calendar file for one event (valid a day) |
| POST | `/internal/tick` | Scheduler ping; needs `X-Cron-Secret` |

## Sign-in — `/v1/auth`

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Email and password → access and refresh tokens |
| POST | `/auth/refresh` | New token pair (the old refresh token stops working) |
| POST | `/auth/logout` | Ends this sign-in |
| POST | `/auth/change-password` | Replaces a temporary or current password |

## Events

| Method | Path | Purpose |
|---|---|---|
| GET | `/home` | Home sections (Today, Coming Up, For You…) |
| GET | `/events` | List with filters (`q`, cities, zones, categories, technologies, dates, mode, price, `lat`/`lng`/`radiusKm`, `minMatch`) and `sort` |
| GET | `/events/search` | Natural-language search ("SAP events in Delhi next month") |
| GET | `/events/map` | Clustered map points for the same filters |
| GET | `/events/nearby` | Events near a point |
| GET | `/events/changes` | Recent changes across events |
| GET | `/events/:id` | Full detail (agenda, speakers, exhibitors, venue) |
| GET | `/events/:id/related` · `/sources` · `/changes` · `/visitors` · `/calendar` | Related events, where it came from, change history, who from the team is going, calendar link |
| GET | `/organizers/:id` · `/speakers/:id` · `/exhibitors/:id` | Profile pages |
| GET | `/collections` · `/collections/:id` | Curated collections |
| GET | `/cities` · `/categories` · `/technologies` · `/industries` · `/event-types` | Taxonomy |
| GET | `/sync/status` | When events were last refreshed |

## Me

| Method | Path | Purpose |
|---|---|---|
| GET · PATCH | `/me` | Profile, onboarding |
| GET · PUT | `/me/preferences` | Interests and cities |
| GET | `/me/for-you` | Events ranked by relevance, with reasons |
| GET | `/me/tracking` | Saves, follows, plans, notes and checklists |
| POST | `/me/sync` | Offline changes from the phone (idempotent, latest change wins per field) |
| GET · POST · PATCH · DELETE | `/me/saved-searches[/:id]` | Saved searches and their alerts |
| GET · POST · DELETE | `/me/reminders[/:id]` | Event reminders |
| GET · POST | `/me/notifications`, `/me/notifications/read` | Inbox |
| GET · PUT | `/me/notification-settings` | Alert types and quiet hours |
| GET | `/push/key` | Web Push public key |
| POST | `/me/push-subscriptions`, `/me/push-subscriptions/remove`, `/me/push-test` | This device's alerts |

## Admin — `/v1/admin`

Researchers and admins, except where marked.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview` | Counts for the Admin screen |
| GET | `/admin/review` | Events waiting for a decision |
| POST | `/admin/events/:id/verify` · `/reject` | Approve or hide an event |
| POST | `/admin/import` | Draft from an event page ("Add by URL") |
| POST | `/admin/events` | Add an event by hand |
| GET · PATCH | `/admin/events/:id` | Read or correct an event (edited fields are protected from syncs) |
| DELETE | `/admin/events/:id/overrides/:field` | Let syncs update a field again |
| GET | `/admin/duplicates` | Possible duplicates |
| POST | `/admin/duplicates/:id/merge` · `/dismiss` | Merge (moves everyone's tracking) or dismiss |
| GET | `/admin/conflicts` | Sources disagreeing about a field |
| POST | `/admin/conflicts/:id/resolve` | Pick the right value |
| GET | `/admin/sync` | Sync history and sources |
| POST | `/admin/sync/run` | Run a sync now (409 if one is running) |
| PATCH | `/admin/sources/:id` | Turn a source on or off (`null` returns to the server setting) |
| GET | `/admin/backup` | **Admin only.** The team's data as a JSON file (see the runbook) |
| GET · POST · PATCH | `/admin/users[/:id]` | **Admin only.** Team: add, change role, reset password, remove access |
