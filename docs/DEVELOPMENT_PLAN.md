# Event Intelligence India — Detailed Development Plan

> An internal app for a team of 4–5 people to find professional events across India, decide which are worth attending, track them, get reminders and change alerts, and record visits.
>
> **Scope:** DISCOVER → EVALUATE → TRACK → REMEMBER → VISIT. It never handles leads, CRM, contacts, sales pipeline, ticketing or payments.

Plan date: 1 October 2026. Base spec: the "Event Intelligence India master prompt" (sections referenced as §1–§163).

---

## Contents

1. [Summary of decisions](#1-summary-of-decisions)
2. [How the app reaches your phones](#2-how-the-app-reaches-your-phones)
3. [Where this plan departs from the original spec, and why](#3-where-this-plan-departs-from-the-original-spec-and-why)
4. [Architecture](#4-architecture)
5. [Technology stack](#5-technology-stack)
6. [Data model](#6-data-model)
7. [API catalogue](#7-api-catalogue)
8. [Phase plan overview](#8-phase-plan-overview)
9. [Phase 0 to Phase 9 in detail](#9-phases-in-detail)
10. [Core rules: relevance, deduplication, change detection, notifications](#10-core-rules)
11. [Event data sources strategy](#11-event-data-sources-strategy)
12. [Environments, configuration and secrets](#12-environments-configuration-and-secrets)
13. [Release and update process](#13-release-and-update-process)
14. [Testing strategy](#14-testing-strategy)
15. [Running costs](#15-running-costs)
16. [Risks](#16-risks)
17. [Decisions](#17-decisions-recorded-1-october-2026)
18. [Out of scope (product boundary)](#18-out-of-scope-product-boundary)

---

## Progress

| Phase | Status | Notes |
|---|---|---|
| 0 Foundations | ✅ Done (1 Oct 2026) | Live at event-intelligence-india.expo.app |
| 1 App shell, design, sample data | ✅ Done (1 Oct 2026) | Apple-style design system; Home, Explore, Event Detail, Organizer, Agenda, Speakers, Exhibitors, Calendar agenda; 150+ sample events |
| 2 Backend and database | ✅ Done and deployed (1 Oct 2026) | API on Render (Singapore), Neon database, cron-job.org tick every 10 min; app reads live API |
| 3 Event data pipeline | ✅ Built and tested (1 Oct 2026) | Readers for calendar feeds, structured page data, sitemaps, open data, venue/association event cards (IICC Yashobhoomi, BIEC, NASSCOM) and a team sheet; cleanup, dedupe, change detection, 12-hour sync; 47 API tests; 69 real events from 10 sources in a trial. Sources are switched on in Render (docs/SOURCES.md) |
| 4 Sign-in, onboarding, interests, relevance | ✅ Built and tested (2 Oct 2026) | Team accounts (admin adds people with one-time passwords), rotating sessions, choose-your-password, onboarding, Interests, match badges with reasons, Home "For You"; 61 API + 36 shared tests |
| 5 Tracking and offline | ✅ Built and tested (2 Oct 2026) | Save, Follow, visit status (planning → visited), visit day, travel notes, one note and a checklist per event, My Events (Saved · Following · Planned · Visited · Past), "Did you visit?", team "Also going", offline event packs, offline app shell; changes queue on the phone and sync with ids and latest-wins per field; 72 API + 40 shared tests |
| 6–9 | Not started | |

### Pending (agreed 1 Oct 2026, picked up after the current phase)

**Event coverage by region: North, East, South, West.** The first live sync (1 Oct) gave 46 events, almost all in the North: New Delhi 15 (all from Yashobhoomi), Noida 15, South 6, Central 1, online 6, **West 0, East 0**. That is too few to browse, and Delhi's other big venue, Bharat Mandapam, blocks bots. The work:
- Source discovery region by region, with the same rules as before (robots.txt, terms, no bypassing): venues, chambers of commerce, industry associations and organisers in each zone.
  - **North:** Delhi NCR beyond Yashobhoomi (PHD Chamber, Delhi organisers, Gurugram and Noida venues), Chandigarh, Jaipur, Lucknow.
  - **West:** Mumbai (Jio World Centre, Bombay Exhibition Centre/NESCO), Pune (Auto Cluster), Ahmedabad (Mahatma Mandir, Helipad Exhibition Centre), Goa.
  - **South:** Hyderabad (HICC/HITEX, where HITEX needs written permission), Chennai Trade Centre, Kochi, Coimbatore (CODISSIA).
  - **East:** Kolkata (Biswa Bangla, Science City), Bhubaneswar, Guwahati.
- Target: a healthy number of upcoming events in every zone. Show the count per zone in the sync status.
- In the app: browse and filter by zone (North / East / South / West), next to cities, so each region's events are easy to look through.

**Sources waiting on a decision or on someone else** (details in docs/SOURCES.md):
- **Team Google Sheet:** template to be shared. Covers events from sites that block bots: SAP, Oracle, AWS, ServiceNow, Microsoft, FICCI, CII, ET, and BIEC and dev.events (below).
- **BIEC and dev.events:** readers are built, but both sites refuse our hosted server (HTTP 403). Switch back on if either site allows our bot; we could ask them.
- **Salesforce Trailblazer and Google Developer Groups:** their platform's (Bevy) terms forbid scraping. Needs a yes from you, ideally after asking them.
- **Meetup groups and Luma calendars:** need the list of groups and calendars to follow.
- **HITEX Hyderabad:** needs written permission.

### Changes made during the build

| Plan said | Built | Why |
|---|---|---|
| Inter font | The system font (San Francisco on iPhone) with Apple's text styles | The app should look and feel like an Apple app; also no font download at startup |
| FlashList | React Native FlatList (virtualised) | FlashList's web support isn't needed at this list size |
| PostGIS | Plain latitude/longitude with a bounding box + great-circle distance in SQL | Works identically on Neon and the embedded test database; fast enough for 100k events |
| Drizzle ORM | Plain parameterised SQL, embedded migrations, a thin `Db` interface | The heavy queries are full-text and trigram SQL an ORM wouldn't simplify; one code path for Neon and PGlite |
| Local Postgres for development | PGlite (real Postgres compiled to WebAssembly) | No install or credentials; tests run on a fresh database every time |
| All tables in Phase 2 | Event, taxonomy, provenance and sync tables now; user and tracking tables with their phases (4, 5) | Each phase adds its own migration |
| argon2 password hashing | scrypt (Node's built-in crypto), 64 MiB per hash | Memory-hard and OWASP-recommended like argon2, with no native add-on to build on the free host |
| `npm run user:create` for accounts; user management in Phase 8 | First admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` in Render; More → Team (add, reset password, remove access) now | The free host has no shell to run commands on, and adding a colleague shouldn't need one |
| Relevance computed on the server per request | The same shared rules run on the phone (badges, "Why it matches you") and on the server ("For You") | Works offline, re-ranks the moment interests change, and keeps event responses cacheable |
| Refresh token in an HttpOnly cookie | Refresh token in the app's storage, rotated on every use with reuse detection | App and API are on different sites, and iPhone Safari blocks cross-site cookies |
| LocalStore with one table per kind | One tracking store on the phone (IndexedDB): the last server copy plus a queue of unsent changes, replayed with the same pure function the tests cover | Simple to reason about: what you see is always the server copy with your unsent edits on top |
| Checklist defaults stored per event | The eight suggested items are shown for every event and stored only once ticked or removed | No rows for untouched checklists; suggested wording can improve without migrating data |
| /me/events, /me/events/:id/tracking, notes and checklist endpoints | GET /me/tracking and POST /me/sync (a batch of changes) plus GET /events/:id/visitors | One sync call carries everything an offline phone queued; fewer requests on the free tier |
| /health checks the database | /health is liveness only; `/health?db=1` for a deep check | Health checks and pings must not wake the free database (100 compute-hours/month) |

## 1. Summary of decisions

| Topic | Decision |
|---|---|
| Users | 4–5 internal team members. You are the only admin; you create everyone else's account. There's no public sign-up. |
| iPhone | **An installable web app** (Expo web export on EAS Hosting, added with **Add to Home Screen**). No Apple Developer account will ever be bought. |
| Android | Uses the same web link (Chrome → **Install app**). No separate Android app. |
| App code | One Expo + React Native + TypeScript codebase, exported to web. Native builds remain possible later because the code sits behind platform interfaces. |
| Backend | Node.js + Express + TypeScript + PostgreSQL (full-text and trigram search), on **free hosting only**. A free external cron service triggers scheduled jobs. |
| Cost | **USD 0 per month.** Nothing is paid without asking you first. |
| Event data | A pipeline that runs every 12 hours, with source adapters, normalization, deduplication, classification and change detection, plus a researcher workflow for adding and verifying events. |
| Notifications | Sent by the server as Web Push. All team iPhones are on iOS 16.4 or later, so everyone can receive them. |
| Expo account | Reuse `mithford_again` (already used for the Maharishi Ayurveda and Toys Cartel prototypes). |
| Delivery | A working link after every phase. Updates go live on next app open, with no reinstall. |

---

## 2. How the app reaches your phones

### 2.1 Installable web app (iPhone and Android)

This is how the Maharishi Ayurveda prototype (`D:\MAHARISHI APP`, live at `maharishi-ayurveda.expo.app`) was delivered and installed on your iPhone.

1. `expo export -p web` builds the Expo Router app for browsers.
2. A post-export script (copied from Maharishi's `scripts/postexport-web.mjs`) adds the web manifest, home-screen icons, full-screen metadata and the **service worker** (needed for offline use and push notifications).
3. `eas deploy` publishes to EAS Hosting:
   - `eas deploy` creates a **preview URL**, which you review before it goes live.
   - `eas deploy --prod` updates the **production URL**, for example `https://event-intelligence-india.expo.app`. The exact subdomain is picked in Phase 0.
4. On each phone: open the link in **Safari** (iPhone) or **Chrome** (Android) and choose **Share → Add to Home Screen** (or **Install app**). It gets its own icon and opens full-screen. An in-app banner shows the steps.
5. Updates: when a new version is deployed, the app picks it up the next time it's opened.

**iPhone notes:**
- A home-screen web app keeps its **own storage, separate from Safari**. Install it first, then sign in inside the installed app.
- Push notifications need **iOS 16.4 or later**, and permission can only be granted inside the installed app after tapping a button.
- WebKit doesn't apply its 7-day storage cleanup to home-screen web apps, but iOS can still clear data when the phone is very low on storage. The app asks for persistent storage, and everything important is also stored on the server.

### 2.2 Android phones

Android team members use the same link in Chrome and tap **Install app** (or menu → **Add to Home screen**). Push notifications, offline use and everything else work the same as on iPhone. No separate Android app is built. If one is ever wanted, it can be added later (free, via an EAS-built APK) without rewriting screens.

---

## 3. Where this plan departs from the original spec, and why

The spec assumes native iOS and Android apps and a paid always-on backend. The decisions not to buy an Apple Developer account, not to build a separate Android app, and to keep running costs at zero change how some features are implemented. Every change sits behind an interface, so a native implementation can be added later without touching screens.

| Spec item | This plan | Reason |
|---|---|---|
| §5 iOS dev / TestFlight / App Store builds | Not built. iPhone uses the installable web app. | No Apple account, by decision. |
| §5 Android preview APK / production AAB | Not built. Android uses the web app. | The team doesn't need a separate Android app. |
| §6 "no responsive website disguised as mobile" | The web app is the **same mobile-first Expo app** exported to web. It has no desktop layout, marketing site or SEO pages. | Only way to get a free installable app on iPhone. |
| §79 SQLite local database | IndexedDB. | SQLite isn't a reliable built-in option in Safari. |
| §49 Local scheduled reminders | Reminders are stored and **sent by the server**. | A closed web app can't schedule its own notifications. |
| §51 Expo Calendar | An `.ics` calendar file opens the phone's "Add event" screen. | No direct calendar access from the web. |
| §20 Native map | MapLibre GL JS web map. | react-native-maps doesn't run on the web. |
| §60 Background refresh | Refresh on open and when returning to the app. | Web apps can't run in the background on iOS. |
| §97, §105 Backend with its own 12-hour scheduler | Free API host + free external cron service calling a protected tick endpoint every 10 minutes; the tick sends due reminders and starts the sync when 12 hours have passed. | Zero-cost decision: free hosts sleep and don't offer reliable built-in schedulers. |
| §125 Expo Secure Store | Short-lived access token in memory; rotating refresh token in IndexedDB; strict Content-Security-Policy. | Safari blocks cross-site cookies (app on `expo.app`, API on another domain), so httpOnly cookies won't work. |
| §124 Email + password sign-up | Email + password, with **accounts created by an admin** (invite-only). | Internal app; open sign-up would let outsiders in. |

---

## 4. Architecture

### 4.1 System overview

```
 iPhone / Android                          Server side
┌──────────────────────────┐   HTTPS    ┌─────────────────────────────────────┐
│ Installable web app       │──────────▶│ REST API  (Express, /v1)            │
│ (Expo web export,         │           │   ├─ routes → services → repositories│
│  EAS Hosting)             │◀──────────│   └─ auth, RBAC, validation, limits │
│  + service worker         │  Web Push │                                     │
│  + IndexedDB              │           │ Tick endpoint  POST /internal/tick  │
└──────────────────────────┘           │   ├─ due reminders → Web Push       │
                                         │   ├─ 12 h passed → runEventSync()   │
 Free cron service ─── every 10 min ───▶│   └─ once a day: status updates     │
 (cron-job.org)                          │                                     │
                                         │ Ingestion pipeline                  │
                                         │   sources → normalize → classify →  │
                                         │   dedupe → merge → detect changes   │
                                         │                                     │
                                         │ PostgreSQL + pg_trgm + full-text    │
                                         └─────────────────────────────────────┘
```

### 4.2 Repository layout (npm workspaces monorepo)

```
event-tracker/
├── apps/
│   ├── mobile/                         Expo app (exported to web)
│   │   ├── app.config.ts  eas.json  package.json
│   │   ├── public/                     manifest.json, icons/, sw.js (service worker)
│   │   ├── scripts/                    postexport-web.mjs, generate-icons.mjs
│   │   └── src/
│   │       ├── app/                    Expo Router routes (thin; re-export screens)
│   │       │   ├── _layout.tsx
│   │       │   ├── (tabs)/             index (Home), explore, my-events, calendar, more
│   │       │   ├── event/[id]/         index, day, changes, agenda, speakers, exhibitors
│   │       │   ├── organizer/[id]  speaker/[id]  exhibitor/[id]
│   │       │   ├── city/[id]  category/[id]  collection/[id]
│   │       │   ├── search  saved-searches  saved-search/[id]
│   │       │   ├── notifications  reminders
│   │       │   ├── onboarding/  auth/
│   │       │   ├── settings/           preferences, notifications, offline, sync, about, privacy
│   │       │   └── admin/              review, duplicates, add-event, sync, sources, users, taxonomy
│   │       ├── screens/                one folder per area (home, explore, events, …, admin)
│   │       ├── components/             common/ event/ calendar/ map/ filters/ navigation/ admin/
│   │       ├── services/               events, search, tracking, notifications, calendar,
│   │       │                           location, share, sync, analytics, auth
│   │       ├── repositories/           types.ts (interfaces) · mock/ · api/
│   │       ├── platform/               *.web.ts / *.native.ts adapters (see 4.3)
│   │       ├── database/               LocalStore interface, IndexedDB + SQLite implementations, migrations
│   │       ├── api/                    HTTP client, token refresh, error mapping
│   │       ├── hooks/  store/  theme/  constants/  utils/  assets/
│   │       └── mock/                   generated synthetic events (flagged isDemo)
│   └── api/                            Backend
│       └── src/
│           ├── server.ts  jobs/        (HTTP server; tick endpoint + jobs)
│           ├── modules/                auth, users, me, events, search, taxonomy, organizers,
│           │                           speakers, exhibitors, tracking, notes, checklists,
│           │                           reminders, saved-searches, notifications, sync, admin
│           │   └── <module>/           routes.ts · service.ts · repository.ts · schemas.ts
│           ├── ingestion/
│           │   ├── orchestrator.ts     runEventSync()
│           │   ├── sources/            jsonld/ ics/ rss/ curated/ urlImport/ (one adapter each)
│           │   ├── normalize/  classify/  dedupe/  merge/  changes/
│           │   └── registry.ts         enabled sources + compliance notes
│           ├── notifications/          rules, fan-out, webPush, expoPush, digests
│           ├── db/                     drizzle schema, migrations/, seed/ (demo + taxonomy)
│           └── lib/                    config, logger, errors, auth, rateLimit, audit
├── packages/
│   └── shared/                         Used by app and API
│       ├── types/                      domain types (Event, Occurrence, …)
│       ├── schemas/                    zod schemas = API contracts
│       ├── taxonomy/                   categories, technologies, industries, event types,
│       │                               states, cities (+ aliases, coordinates, regions e.g. Delhi NCR)
│       ├── dates/                      Asia/Kolkata presets (Today … Next 3 months)
│       ├── query/                      natural search parser
│       └── relevance/                  scoring + reason text
└── docs/                               DEVELOPMENT_PLAN.md, API.md, SOURCES.md, RUNBOOK.md
```

### 4.3 Layers and platform adapters

```
Screen (thin) → Hook (TanStack Query / Zustand) → Service (business logic) → Repository → Mock | API | LocalStore
```

| Adapter interface | Web implementation (built) | Native implementation (only if a native app is ever built) |
|---|---|---|
| `LocalStore` | IndexedDB (`idb`) | expo-sqlite |
| `MapView` | MapLibre GL JS | react-native-maps |
| `CalendarService.addEvent` | Generate and open `.ics` file | expo-calendar |
| `PushService.register` | Service worker + Web Push subscription | expo-notifications + Expo push token |
| `TokenStore` | Memory (access) + IndexedDB (refresh) | expo-secure-store |
| `ShareService` | Web Share API (copy-link fallback) | expo-sharing / Share API |
| `LocationService` | Browser geolocation | expo-location |
| `BackgroundRefresh` | Refresh on open / on focus | expo-background-task |

Screens never import a platform module directly. Only the web implementations are built now; the interfaces keep a native app possible later without rewriting screens.

### 4.4 State separation (§116)

- **Server state** (TanStack Query, persisted to IndexedDB): events, organizers, speakers, exhibitors, taxonomy, cities, notifications.
- **Client state** (small Zustand stores): search text, filters, list/map mode, selected city, UI flags, session.
- **Local persistent state** (LocalStore): saved/followed/tracking, notes, checklists, event packs, saved searches, outbox of pending changes.

---

## 5. Technology stack

| Concern | Choice |
|---|---|
| App framework | Expo SDK 57 (same as the Maharishi prototype; upgraded when needed), React Native, React Native Web, TypeScript strict |
| Navigation | Expo Router (file-based; URLs double as deep links on web) |
| Server state | TanStack Query v5 with an IndexedDB persister |
| Client state | Zustand |
| Lists | FlatList (virtualised) |
| Bottom sheets | `@gorhom/bottom-sheet` (checked on web; falls back to a modal sheet) |
| Calendar UI | `react-native-calendars` (pure JS, works on web) |
| Map (web) | MapLibre GL JS with a free vector tile provider (OpenFreeMap or MapTiler free tier) |
| Images | expo-image (caching, placeholders) |
| Dates | `date-fns` + `date-fns-tz`; all date logic in `Asia/Kolkata`, event timezone kept |
| Validation | zod (shared between app and API) |
| API | Express, helmet, cors, express-rate-limit, pino logging |
| Database | PostgreSQL + `pg_trgm` + `unaccent` + full-text search (`tsvector`); distances computed in SQL |
| Data access | Parameterised SQL behind a small `Db` interface (node-postgres in production, PGlite in development and tests); migrations embedded in the server |
| Auth | argon2 password hashing; JWT access tokens (15 min); rotating refresh tokens (30 days, revocable) |
| Push | `web-push` (VAPID) |
| Scheduler | Free external cron service (cron-job.org) calls `POST /internal/tick` every 10 minutes with a secret header; Postgres advisory locks prevent overlapping runs. A GitHub Actions scheduled workflow is the backup trigger for the 12-hour sync. |
| Ingestion parsing | `cheerio` (HTML / JSON-LD), `node-ical` (ICS), `rss-parser` (RSS/Atom), `csv-parse` (curated sheets) |
| Testing | Vitest (shared + API), Supertest (API), Playwright on a mobile viewport (web end-to-end) |
| Hosting (all free tiers) | EAS Hosting (app); Render free web service (API); Neon free Postgres. Limits checked 1 Oct 2026 (docs/RUNBOOK.md), with Supabase free Postgres as the fallback database. |

---

## 6. Data model

There's one canonical model, in Postgres on the server; the phone keeps a cache plus the user's own data. There are **no** tables for leads, contacts, customers, opportunities, pipeline or sales activity.

### 6.1 Event content (server)

| Table | Key columns |
|---|---|
| `events` (series) | id, slug, title, description, summary, summary_is_generated, organizer_id, official_website, image_url, thumbnail_url, image_alt, created_at, updated_at |
| `event_occurrences` (edition; **the unit the app shows**) | id, event_id, title_override, start_at, end_at, timezone, all_day, venue_id, city_id, attendance_mode (in_person / online / hybrid), registration_url, price_min, price_max, currency, is_free, price_note, status (upcoming / ongoing / completed / cancelled / postponed / rescheduled / registration_closed), verification_status (needs_verification / verified / rejected), is_demo, search_vector, last_verified_at, last_synced_at, content_hash, created_at, updated_at |
| `venues` | id, name, address, city_id, latitude, longitude |
| `cities` / `states` | id, name, aliases[], state_id, region (e.g. `delhi_ncr`), geo |
| `organizers` | id, name, website, description, logo_url |
| `speakers` + `occurrence_speakers` | name, designation, company, session_title |
| `exhibitors` + `occurrence_exhibitors` | company, industry, website, booth |
| `agenda_items` | occurrence_id, day, starts_at, ends_at, title, description, room, speaker_ids[] |
| `categories`, `technologies`, `industries`, `event_types`, `tags` | id, slug, name, is_active, sort (all configurable) |
| `occurrence_categories` / `_technologies` / `_industries` / `_tags` | join tables with `source` (rule / manual / ai) |
| `collections` | id, name, description, filter_json, sort, is_active |

### 6.2 Provenance, sync and quality (server)

| Table | Key columns |
|---|---|
| `sources` | id, name, adapter, config_json, priority, enabled, compliance_note, last_success_at, last_failure_at, health |
| `source_records` (raw event) | id, source_id, source_event_id, source_url, raw_title, raw_description, raw_date, raw_venue, raw_organizer, raw_image, raw_payload (jsonb), content_hash, fetched_at, occurrence_id (link once matched) |
| `field_overrides` | occurrence_id, field, value, edited_by, edited_at (manual corrections that syncs won't overwrite) |
| `source_conflicts` | occurrence_id, field, values_json, resolved_by, resolved_at |
| `duplicate_candidates` | occurrence_a, occurrence_b, score, signals_json, status (open / merged / dismissed) |
| `event_changes` | occurrence_id, field, old_value, new_value, significance (critical / major / minor), source_id, detected_at |
| `sync_runs` | id, started_at, completed_at, status (success / partial_success / failed), sources_processed, fetched, created, updated, unchanged, cancelled, postponed, duplicates, errors_json |
| `sync_run_sources` | sync_run_id, source_id, status, fetched, error, attempts |

### 6.3 Users and personal tracking (server, mirrored on the phone)

| Table | Key columns |
|---|---|
| `users` | id, name, email, password_hash, role (admin / researcher / user), is_active, created_at |
| `refresh_tokens` | id, user_id, token_hash, device_label, expires_at, revoked_at |
| `user_preferences` | user_id, cities[], categories[], technologies[], industries[], event_types[], notification_prefs (jsonb), quiet_hours |
| `user_event_tracking` | user_id, occurrence_id, saved, following, status (saved / planning / confirmed / visiting / visited / not_visiting), visit_date, travel_notes, visited_at, updated_at |
| `event_notes` | id, user_id, occurrence_id, body, updated_at (event-level text only) |
| `checklist_items` | id, user_id, occurrence_id, label, is_default, done, sort, updated_at |
| `reminders` | id, user_id, occurrence_id, offset_minutes or remind_at, sent_at |
| `saved_searches` | id, user_id, name, query, filters_json, notify, last_matched_at |
| `push_subscriptions` | id, user_id, endpoint, keys_json, user_agent, created_at, last_used_at |
| `notifications` | id, user_id, type, title, body, route, occurrence_id, read_at, created_at |
| `audit_log` | id, actor_id, action, entity, entity_id, before_json, after_json, at |

### 6.4 On the phone (LocalStore)

`cached_occurrences`, `event_packs` (full offline copy of an event), `tracking`, `notes`, `checklist_items`, `saved_searches`, `outbox` (pending changes), `meta` (last sync time, schema version).

---

## 7. API catalogue

Base path `/v1`. JSON only. All responses go through zod-validated contracts in `packages/shared`. Errors use one envelope: `{ error: { code, message, details? } }`. List endpoints use cursor pagination with `limit` (default 25, max 50) and `cursor`. Normal users only ever see `verified` events.

**Auth**

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Email + password → access token + refresh token |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke current refresh token |
| POST | `/auth/change-password` | Change own password |

**Events and discovery**

| Method | Path | Purpose |
|---|---|---|
| GET | `/events` | Filters: `q, city, state, region, from, to, datePreset, category, technology, industry, type, organizer, mode, free, relevance, sort`; cursor pagination |
| GET | `/events/search` | Grouped results: events, organizers, speakers, exhibitors, cities, categories |
| GET | `/events/parse-query?q=` | Natural-language query → structured filters (for chips) |
| GET | `/events/:id` | Full occurrence detail with relevance and "why it matters" for the caller |
| GET | `/events/:id/related` | Same category / city / organizer / technology |
| GET | `/events/:id/sources` | Source attribution |
| GET | `/events/:id/changes` | Change history |
| GET | `/events/:id/planned-visitors` | Team members planning to attend (names only) |
| GET | `/events/:id/ics` | Calendar file for "Add to calendar" |
| GET | `/events/nearby` | `lat, lng, radiusKm` (10 / 25 / 50 / 100) |
| GET | `/events/map` | `bbox, zoom` + filters → server-side clusters or individual pins |
| GET | `/events/changes` | `since=` → new / updated / cancelled / deleted occurrences (incremental refresh) |
| GET | `/home` | One call for Home sections (upcoming, this week, new, updated, recommended) |
| GET | `/categories`, `/technologies`, `/industries`, `/event-types` | Taxonomy |
| GET | `/cities` | With upcoming event counts |
| GET | `/collections`, `/collections/:id` | Curated collections |
| GET | `/organizers/:id`, `/speakers/:id`, `/exhibitors/:id` | Profile + upcoming / past events |
| GET | `/sync/status` | Simple freshness ("Last updated …, Up to date") |

**Personal (`/me`)**

| Method | Path | Purpose |
|---|---|---|
| GET / PATCH | `/me`, `/me/preferences` | Profile and interests |
| GET | `/me/events?list=saved\|following\|planned\|visited\|past` | My Events lists |
| PUT | `/me/events/:id/tracking` | Save, follow, status, visit date, travel notes |
| GET / PUT / DELETE | `/me/events/:id/notes` | Event note |
| GET / POST / PATCH / DELETE | `/me/events/:id/checklist[/:itemId]` | Checklist items |
| GET / POST / DELETE | `/me/reminders[/:id]` | Reminders |
| GET / POST / PATCH / DELETE | `/me/saved-searches[/:id]` | Saved searches |
| POST / DELETE | `/me/push-subscriptions[/:id]` | Register a device for push |
| GET / PATCH | `/me/notifications[/:id]` | Inbox, mark read |
| POST | `/me/sync` | Batch apply the offline outbox (idempotent change IDs) |

**Internal**

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/tick` | Called by the cron service with a secret header: send due reminders, start the sync if 12 hours have passed, run daily status updates |

**Admin / researcher (`/admin`, role-checked)**

| Method | Path | Role |
|---|---|---|
| GET | `/admin/review` | Researcher+ (needs-verification queue) |
| POST | `/admin/events/:id/verify` / `/reject` | Researcher+ |
| PATCH | `/admin/events/:id` | Researcher+ (writes `field_overrides`) |
| POST | `/admin/events/import-url` | Researcher+ (paste an official event URL → pre-filled draft) |
| POST | `/admin/events` | Researcher+ (manual add) |
| GET / POST | `/admin/duplicates`, `/admin/duplicates/:id/merge` / `/dismiss` | Researcher+ |
| GET | `/admin/sync/runs`, `/admin/sync/runs/:id` | Admin |
| POST | `/admin/sync/run` | Admin (run now) |
| GET / PATCH | `/admin/sources[/:id]` | Admin (health, enable / disable) |
| CRUD | `/admin/users`, `/admin/taxonomy/*`, `/admin/collections` | Admin |

There are intentionally **no** `/leads`, `/contacts`, `/opportunities`, `/crm` or `/pipeline` routes.

---

## 8. Phase plan overview

| # | Phase | You can do on your phone at the end | Est. effort |
|---|---|---|---|
| 0 | Foundations and delivery pipeline | Install a branded placeholder app from the link | 2–3 days |
| 1 | App shell, design system, demo data | Browse Home, Explore and Event Detail with 100+ demo events | 2 weeks |
| 2 | Backend, database, deployment | Same app, now running on the live server with real search | 1.5 weeks |
| 3 | Event data pipeline and researcher intake | See real events with sources; 12-hour sync running | 2 weeks |
| 4 | Sign-in, onboarding, interests, relevance | Sign in; see "Why this event matches you" | 1 week |
| 5 | Tracking and offline | Save, follow, plan, notes, checklist, visited; works offline at the venue | 1.5 weeks |
| 6 | Discovery depth | Full filters, natural search, saved searches, map, near me, collections | 1.5 weeks |
| 7 | Calendar, reminders, notifications | Calendar views, add to calendar, reminders and change alerts as push notifications, Event Day Mode | 1.5 weeks |
| 8 | Admin and researcher tools | Review queue, duplicate merge, sync and source health, users | 1 week |
| 9 | Hardening and release | Final audited release on every team phone | 1 week |

**Total: about 13–14 weeks** of development effort. Calendar time also depends on how quickly each phase is reviewed on your phone. Phases 3 and 4 can overlap.

Every phase ends the same way: typecheck and tests pass → API deployed → `eas deploy` preview URL → you review on your phone → `eas deploy --prod` → the installed app updates on next open.

---

## 9. Phases in detail

### Phase 0 — Foundations and delivery pipeline (2–3 days)

**Goal:** prove on day one that code → build → link → home screen works on your iPhone.

**Setup**
- Initialize a git repository and the npm workspaces monorepo: `apps/mobile`, `apps/api`, `packages/shared`.
- TypeScript strict everywhere, ESLint, Prettier, path aliases, root scripts: `typecheck`, `lint`, `test`, `dev:app`, `dev:api`.
- Create the Expo app (SDK 57, Expo Router under `src/app`) with `app.config.ts`: app name "Event Intelligence India", slug `event-intelligence-india`, scheme `eventintel`, icons, splash, `web.output: "single"`.
- Link to a new EAS project on the `mithford_again` account, hosted at `event-intelligence-india.expo.app`.
- Copy and adapt the web-install layer from the Maharishi prototype:
  - `public/manifest.json`, home-screen icons, `scripts/generate-icons.mjs`
  - `scripts/postexport-web.mjs` (inject manifest, icons, Apple meta tags, theme colour)
  - `InstallPrompt.web.tsx` banner with iPhone step-by-step instructions
  - `npm run deploy:web` (export + post-process + `eas deploy --prod`) and `npm run deploy:preview`
- Empty service worker `public/sw.js` registered on web (filled in Phases 5 and 7).
- Environment variables: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DATA_MODE=mock|api`. No secrets in the app.
- Design tokens in `src/theme`: colours (light and dark), typography scale, spacing, radius, elevation.
- Placeholder screens for the 5 tabs; README with run, deploy and update commands.

**Deliverable:** the production web link, showing a branded splash and 5 empty tabs.

**Acceptance**
- The link opens in Safari on your iPhone, installs to the home screen with the correct icon and name, and opens full-screen. The same works from Chrome on an Android phone.
- A visible change deployed with `npm run deploy:web` appears after reopening the app, with no reinstall.
- `npm run typecheck` passes in all workspaces.

---

### Phase 1 — App shell, design system and demo data (2 weeks)

**Goal:** a navigable, professional-looking app that answers "what events are happening?" using clearly flagged demo data.

**Shared package**
- Domain types (§6) and zod schemas for every API contract.
- Taxonomy: event types (§22), categories (§23), technologies, industries, interest tags (§24); Indian states and cities with aliases (Gurgaon ⇄ Gurugram, Bangalore ⇄ Bengaluru, Bombay ⇄ Mumbai, …), coordinates and regions (Delhi NCR = Delhi, New Delhi, Noida, Greater Noida, Gurugram, Ghaziabad, Faridabad).
- Date helpers in `Asia/Kolkata`: Today, Tomorrow, This Week, This Weekend, Next Week, This Month, Next Month, Next 3 Months, custom range; countdown labels ("12 days to go", "Tomorrow", "Happening today").

**Demo data**
- A deterministic generator produces 120+ synthetic occurrences across 16+ cities (§148) and all categories:
  - realistic but clearly fictional titles and organizers
  - a mix of statuses (upcoming, ongoing, postponed, cancelled)
  - some with speakers, exhibitors and agenda, some without (to exercise hidden sections)
  - recent "added" and "updated" timestamps, plus change-history samples
- Every record has `isDemo: true`. The UI shows a small "Demo data" marker. The same generator later seeds the database.

**Repositories:** `EventRepository`, `TaxonomyRepository` interfaces. `MockEventRepository` adds simulated latency, filtering, sorting and cursor pagination so the app behaves like it will on the real API.

**Design system** (`components/common`, `components/event`):
- AppHeader, SearchBar, Button, Chip, CategoryChip, Badge, EventBadge (status with text + icon, never colour alone), DateBadge, LocationRow, RelevanceBadge (placeholder)
- EventCard variants: compact, standard, featured, calendar, map, today, saved
- SectionHeader, Skeleton (per card type), EmptyState, ErrorState (with recovery action), OfflineBanner, ReadMore, ImageWithFallback

**Screens**
- **Home:** greeting by time of day, selected city, notification and profile icons, search entry; sections Upcoming, This Week (compact chronological), Newly Discovered ("Added 4 hours ago"), Recently Updated ("Venue updated · 2 hours ago"), Popular Categories. A limited number of cards per section, each with "See all".
- **Explore (list):** search box, category chips, quick city and date chips, infinite scroll, result count, empty state with suggestions.
- **Event Detail:**
  - banner, title, date range, city, status badge
  - action row: Save, Follow, Add to Calendar, Share, Register (inactive until Phases 5–7, except Register and Share)
  - sections: Overview, Date & Time (multi-day breakdown), Venue & Location (Open in Maps), Organizer, Audience / Industries / Technologies, Speakers, Exhibitors (searchable), Agenda (day tabs), Tickets / Price ("Price information unavailable" when unknown), Registration (opens the official site externally), Related Events, Sources, Last Updated, Event Changes
  - every section is hidden when its data is missing; no fabricated content
- **Organizer:** profile and upcoming / past events.
- Tabs My Events, Calendar and More show designed empty states.

**Quality**
- Skeletons on every list and detail; no blank screens.
- FlashList and bottom sheet checked on web; fallbacks applied if needed.
- Images use thumbnails, lazy loading and caching.

**Deliverable:** updated link; demo journeys 1 and 2 (discover and evaluate) work on demo data.

**Acceptance**
- Scrolling 120+ events is smooth on your iPhone.
- Search "SAP" in Explore shows only SAP-tagged events; an event with no speakers shows no Speakers section.
- No screen anywhere mentions leads, contacts, CRM or pipeline.

---

### Phase 2 — Backend, database and deployment (1.5 weeks)

**Goal:** the app runs on a real hosted server and database.

**Database**
- SQL migrations for the tables in §6.1–6.2 (user tables arrive with Phases 4–5).
- Extensions: `postgis`, `pg_trgm`, `unaccent`.
- `search_vector` on occurrences, weighted: title (A); categories, technologies, tags, organizer, city (B); venue, speakers, exhibitors (C); description (D). Kept up to date by triggers.
- Indexes:
  - GIN on `search_vector`
  - trigram GIN on titles, organizer names, exhibitor and speaker names
  - B-tree on `(start_at)`, `(city_id, start_at)`, `(status, verification_status, start_at)`, `(updated_at)`
  - GiST on venue geography
- Seeds: taxonomy, states and cities (with coordinates and aliases), and the Phase 1 demo dataset (`is_demo = true`, development and preview only).

**API**
- Express app structure: routes → services → repositories; zod validation on every input; error envelope; request IDs; pino logging; helmet; CORS restricted to the EAS Hosting origins; rate limiting; `/health`.
- Endpoints in this phase: `/events` (all filters, sorting, cursor pagination), `/events/search`, `/events/:id`, `/related`, `/sources`, `/changes`, `/events/nearby`, `/events/changes?since=`, `/home`, taxonomy, `/cities` with counts, `/organizers/:id`, `/speakers/:id`, `/exhibitors/:id`, `/collections`, `/sync/status`.
- Search: full-text first (`websearch_to_tsquery`), trigram fallback for typos ("odo" → "Odoo", "hydrabad" → "Hyderabad").

**Deployment**
- Neon Postgres (pg_trgm and unaccent extensions).
- Before deploying, check the current free-tier limits of Render, Neon and cron-job.org against our usage and record them in `docs/RUNBOOK.md`.
- API on Render's free web service, with HTTPS and secrets only in the host's environment settings.
- Free cron service set up to call `/internal/tick` every 10 minutes. This also keeps the free API awake, so there's no slow first load.
- Separate `preview` and `production` databases (Neon branches) and API URLs, within the free tier.

**App**
- `ApiEventRepository` implementing the same interface as the mock; switch with `EXPO_PUBLIC_DATA_MODE=api`.
- TanStack Query persisted to IndexedDB: cached data shows instantly and refreshes in the background (§143).
- Offline banner and error states wired to real network failures.

**Tests:** API integration tests (Vitest + Supertest against a test database) for filters, pagination, search ranking and the verified-only rule.

**Deliverable:** the link now runs on the live API.

**Acceptance**
- On mobile data, away from the office network, Home loads from the server.
- Search "SAP" + city Delhi returns correct results with a server response time under 500 ms.
- Turning on airplane mode and reopening shows the last cached Home with an offline banner.

---

### Phase 3 — Event data pipeline and researcher intake (2 weeks)

**Goal:** replace demo data with real, sourced, de-duplicated events. Data quality is the top priority (§159).

**Pipeline**

```
Tick (every 10 min) → if EVENT_SYNC_INTERVAL_HOURS (12) have passed since the last run → runEventSync()
  1. take Postgres advisory lock (skip if a run is in progress); create sync_runs row
  2. for each enabled source, isolated (one failure never stops the run):
       fetch politely (robots.txt respected, rate-limited, ETag / If-Modified-Since, timeout)
       → parse into RawEvent records → store in source_records with content_hash
       → unchanged hash → count as "unchanged", stop here
  3. normalize  → title cleanup, dates to ISO + timezone (default Asia/Kolkata),
                  city/state via alias table, venue match, organizer match,
                  price parsing (₹, "onwards", "free"), event type, attendance mode
  4. classify   → keyword rules → categories, technologies, industries, tags, event type
  5. dedupe     → match against existing occurrences (rules in §10.2)
  6. merge      → combine fields by source priority, never overwriting field_overrides;
                  disagreements on important fields are written to source_conflicts
  7. detect changes → write event_changes with significance (§10.3)
  8. verification → trusted official sources: verified; everything else: needs_verification
  9. finish sync_runs: totals, per-source results, status success / partial_success / failed
 10. hand new events and changes to the notification fan-out (wired in Phase 7)
Failed sources: up to 3 attempts with backoff, then marked failed until the next run.
```

**Source adapters** (each implements one `SourceAdapter` interface: `fetch()`, `parse()`, plus config and compliance note):

| Adapter | What it reads |
|---|---|
| `jsonld` | schema.org `Event` data published on official event, expo, venue and organizer pages |
| `ics` | iCalendar feeds |
| `rss` | RSS / Atom event feeds |
| `curated` | A researcher-maintained Google Sheet (published as CSV) or uploaded CSV. This is the main high-quality starting source. |
| `urlImport` | Single official event URL pasted by a researcher; extracts JSON-LD, OpenGraph and page metadata into a draft |

**Researcher intake (minimum version in this phase; full tools in Phase 8)**
- Admin and researcher accounts can add an event by pasting its official URL: the app shows a pre-filled draft, the researcher completes it, and it's saved as verified.
- A command-line `npm run sync:run` and `npm run sync:dry-run` (show what would change without writing).

**Other jobs:** a daily status job (upcoming → ongoing → completed, using the event's timezone); image handling (store the original URL, thumbnail, alt text and source).

**Source discovery (there's no existing list, so this is the first task of the phase):**
- I research and propose 20–30 candidate sources in `docs/SOURCES.md`, grouped as:
  - convention and exhibition centre calendars in major cities
  - industry bodies and chambers that run conferences
  - technology vendors' India event pages (SAP, Odoo, Microsoft, Oracle, …)
  - trade-show organizers and conference series
- Each entry records what it covers, how it can be read (feed, structured data, page), its terms and robots rules, and a recommendation.
- You approve which ones to enable. Each is reviewed for compliance before it's switched on (see §11).
- "Add by URL" is your main everyday tool: when you hear about an event, paste its official link and it's added in under a minute.

**Tests:** unit tests for the normalizer (dates, cities, prices), classifier, dedupe scoring and change detection. Idempotency test: running the same sync twice creates and updates nothing.

**Deliverable:** production shows real events with "Source: …" and "Updated 3 hours ago"; demo data is removed from production (kept for development).

**Acceptance**
- Two consecutive runs on unchanged sources → 0 created, 0 updated.
- Changing a venue in the curated sheet → exactly one `venue changed` record, the event updated, the old value kept in history.
- One source deliberately broken → run finishes as `partial_success` and the other sources still update.

---

### Phase 4 — Sign-in, onboarding, interests and relevance (1 week)

**Goal:** the app knows who each person is and what matters to them, and explains its suggestions.

**Backend**
- `/auth/login`, `/auth/refresh` (rotation, with detection of reused refresh tokens), `/auth/logout`, `/auth/change-password`.
- argon2 hashing, login rate limiting, audit log of sign-ins.
- Role middleware: `admin`, `researcher`, `user` (§126).
- `npm run user:create` command to create your admin account and the team's user accounts. In-app user management comes in Phase 8.
- The researcher role exists for the future but nobody has it now; you, as admin, can do everything a researcher can.
- `/me`, `/me/preferences`.
- Relevance computed on the server for each request using the shared rules (§10.1); results include a level and reasons.

**App**
- Sign-in screen; session restore on launch; silent token refresh; "Session expired, sign in again" recovery.
- Onboarding (shown once, skippable):
  1. "Discover events across India"
  2. "Track the events that matter to you"
  3. "Never miss an important conference, expo or summit"
  4. "What are you interested in?" (SAP, ERP, Odoo, AI, Manufacturing, Cloud, CRM, HRMS, Cybersecurity, …)
  5. Preferred cities (optional)
  No location permission request during onboarding.
- Settings → Preferences: cities, categories, technologies, industries, event types.
- RelevanceBadge on cards (Strong match / Good match / Possible match; no percentages).
- Event Detail section "Why this event matches you" with plain bullet reasons.
- Home section "Events you may want to track" with explanations ("Because you selected Manufacturing").
- Startup sequence (§146): splash → session → preferences → cached data → background refresh → Home. Startup never waits on the network.

**Acceptance**
- Changing interests from SAP to Manufacturing changes the order of Home and the reasons shown.
- A `user` account can't open admin routes (API returns 403; the app hides the Admin menu).

---

### Phase 5 — Event tracking and offline (1.5 weeks)

**Goal:** save, follow, plan, attend and record visits, even with no network at the venue.

**Local-first data**
- LocalStore (IndexedDB) tables listed in §6.4.
- Every action (save, follow, status, note, checklist tick) is written locally first and added to the **outbox**, so the screen updates instantly.
- The outbox is sent to `/me/sync` when online, with retries and backoff. Each change has an ID, so resending is harmless. Conflicts are resolved by the latest `updated_at` per field.

**Service worker (offline app shell)**
- The post-export script generates a precache list of the built app files. The service worker caches them, so the installed app **opens with no network**.
- Event images in packs are cached by the service worker.
- `navigator.storage.persist()` is requested to protect offline data.

**Features**
- **Save vs Follow** (§43–44): Save keeps the event for reference; Follow subscribes to updates and reminders.
- **Tracking status** (§46, §135): Saved → Planning to visit → Confirmed → Visiting → Visited / Did not visit. Visited records the visit date and moves the event into history.
- **My Events tab:** Saved · Following · Planned · Attended · Past, with countdowns ("12 days to go", "Tomorrow", "Happening today").
- **Event notes** (§47, §83): one plain-text note per event; no people or company records.
- **Checklist** (§48, §82): defaults (registration, calendar, agenda, venue, directions, exhibitors, speakers, notes) plus custom items.
- **Visit planning** (§133): visit date, travel notes.
- **Team visitors** (§134): "Planned visitors: Aditya, Rahul" on Event Detail, so the team avoids duplicate trips.
- **Offline event pack** (§81): "Save offline" stores overview, venue, coordinates, agenda, speakers, exhibitors, note, checklist and thumbnail. Settings → Offline storage lists packs with sizes and a remove option.
- **Post-event prompt** (§56): after an event ends, "Did you visit?" → Visited / Did not visit. No other questions.

**Acceptance**
- In airplane mode: open the installed app → open a saved event → read the agenda → edit the note → tick checklist items → mark visited. After reconnecting, the server has all the changes.
- Two team members planning the same event see each other in "Planned visitors".

---

### Phase 6 — Discovery depth (1.5 weeks)

**Goal:** find exactly the right events quickly.

**Filters and sort**
- Filter sheet (§17): city, state, region, date presets and custom range (§18, Asia/Kolkata), category, event type, technology, industry, organizer, attendance mode, free/paid, relevance level. Reset and Apply. Active filters shown as removable chips.
- Sort sheet: date, relevance, recently added, recently updated, distance.

**Natural search** (§16, no AI)
- The parser in `packages/shared` turns typed text into structured filters. Examples:
  - "SAP events in Delhi next month" → q: SAP, city: Delhi, date: next month
  - "ERP conferences in Hyderabad" → technology: ERP, type: Conference, city: Hyderabad
  - "manufacturing expos" → industry: Manufacturing, type: Expo
- It recognizes cities and aliases, regions (Delhi NCR), taxonomy terms, event types and date phrases (today, this weekend, next 90 days, in December).
- Parsed parts appear as chips the user can remove.

**Global search** (§87): results grouped as Events (primary), Organizers, Speakers, Exhibitors, Cities, Categories. Recent searches are kept on the device.

**Saved searches** (§68, a first-class feature)
- "Save this search" from Explore (e.g. *SAP · Delhi NCR · Next 90 days*), with a name and a "Notify me about new matches" switch.
- Saved Searches list: open (re-runs the search), edit, delete. Stored on the server for match alerts in Phase 7.

**Map** (§20–21, §145)
- List ⇄ Map toggle in Explore. The map uses exactly the same filters.
- `/events/map?bbox&zoom` returns **server-side clusters** when zoomed out (city / venue counts) and individual pins when zoomed in, so the phone never draws thousands of markers.
- Tap a cluster to zoom in; tap a pin to see a preview card, then open the event.
- City list with upcoming event counts (no ranking implied).

**Location** (§85–86)
- "Use my location" only when tapped. Events Near You with 10 / 25 / 50 / 100 km radius and distance on cards. No continuous tracking. Manual city selection is always available.
- "Directions" opens Apple Maps or Google Maps with the venue.

**More discovery**
- Collections (§72): curated server-defined lists (SAP Events India, ERP Events India, Manufacturing Events, Delhi Events, Added This Week, …).
- Speaker, Exhibitor, City and Category pages.
- Share (§94): title, dates, city and official link through the phone's share sheet. Never includes notes.

**Acceptance**
- "ERP conferences in Hyderabad" shows the right chips and results.
- The map and list always show the same set of events for the same filters, and the map stays smooth with thousands of events in the database.

---

### Phase 7 — Calendar, reminders, notifications and Event Day Mode (1.5 weeks)

**Goal:** nobody misses an event, and every alert opens the right screen.

**Calendar tab** (§52–53)
- Month, Week and Agenda views; "Next 30 days" chronological list.
- Shows my saved / followed / planned events, with a switch for "all relevant events". Tapping an event opens Event Detail.

**Add to phone calendar** (§51)
- Only when the user taps it. `/events/:id/ics` provides a calendar file with title, start, end, venue, address, official URL and description.
- iPhone shows its own "Add event" screen. Tested on device; if the home-screen app can't open it reliably, a fallback link to add the event to Google Calendar is shown.

**Push notifications**
- The server holds VAPID keys and uses the `web-push` library. The service worker shows notifications and routes taps.
- **"Turn on alerts"** step in onboarding and in Settings → Notifications. iPhone requires iOS 16.4+ and the app opened from the home screen. The screen detects when either condition isn't met and explains what to do.
- Devices are registered through `/me/push-subscriptions`. Expired subscriptions are removed automatically.

**Reminders** (§49, §136)
- Choices: 7 days, 3 days, 1 day, 2 hours before, or a custom time.
- Stored on the server and sent by the tick that runs every 10 minutes, so they arrive even when the app is closed, within about 10 minutes of the chosen time.
- Reminder Center screen: "Tomorrow — SAP Conference, Hyderabad".

**Alerts after each sync** (rules in §10.4)
- Followed event changed: date, time, venue, registration link or status (cancelled / postponed / rescheduled), showing previous → new value.
- Saved search matched a new event.
- New events matching interests (one digest per sync, not one notification per event).
- Event starts tomorrow.

**Notification inbox and routing** (§91, §147)
- Inbox screen; per-type on/off switches; quiet hours.
- Routing: change alert → Event Detail (changes section); starts tomorrow / today → Event Day Mode; saved-search match → that search's results; new match → Event Detail.
- On the web, every screen has a real URL (`/event/123`, `/saved-search/7`, …), so notification taps and shared links open the exact screen (§93).

**Event Day Mode** (§55)
- Shown automatically on Home and My Events when a tracked event is today.
- Contents: event, venue, hours, Directions, Agenda, Exhibitors, Speakers, My Notes, Checklist. Works offline from the event pack.

**Freshness** (§95–96): "Updated today, 12:00 PM · Up to date" in Settings → Event data; freshness labels on events.

**Acceptance**
- Change the venue of a followed event in the curated sheet → run sync → the follower's iPhone shows a push notification within minutes → tapping it opens the change details.
- Saved search "SAP + Delhi NCR + Next 90 days" → a new matching event is added → push → opens the event.
- A 2-hours-before reminder arrives while the app is closed.

---

### Phase 8 — Admin and researcher tools (1 week)

**Goal:** keep data quality high from the phone, without a web dashboard (§127). Visible only to you (admin), under More → Admin.

- **Review queue** (§128): "18 events need review"; each shows event, source and confidence → Approve / Edit / Reject.
- **Edit event** with field-level overrides (§103): edited fields are stored with who and when, and future syncs won't overwrite them. Overridden fields show a small marker.
- **Add event** by URL or manually (expanded from Phase 3).
- **Possible duplicates** (§101–102): side-by-side comparison → choose the canonical title, date, venue and URL → merge. All source records are kept, and everyone's saves, follows, notes, checklists and reminders move to the surviving event.
- **Source conflicts:** list of fields where sources disagree; pick the correct value.
- **Sync** (§96, §107): last and next run, run now (admin), history with totals per run and per source, error details.
- **Source health** (§108): status (healthy / warning / failed), last success, last failure, events found, errors; enable or disable.
- **Taxonomy and collections:** add or rename categories, technologies, industries, event types and tags; edit collections.
- **Users** (admin): create a user, reset password, change role, deactivate.
- Every admin action is written to the audit log.

**Acceptance**
- A researcher verifies a new event and it appears for normal users on their next refresh.
- Merging two duplicates keeps all users' tracking data on the merged event.

---

### Phase 9 — Hardening, audits and release (1 week)

**Goal:** a dependable release on every team phone.

- **Engineering audit** (§160): TypeScript, navigation, state, repositories, services, API contracts, database design, normalization, dedupe, 12-hour and incremental sync, provenance, change detection, search, filters, map, calendar, notifications, offline, notes, checklists, auth, roles, security, performance, images, loading / empty / error states, deep links, analytics abstraction, build configuration.
- **Product boundary audit** (§161): search code and UI text for lead, contact, CRM, prospect, opportunity, pipeline, follow-up and sales. The result must be zero.
- **Error states** (§89), each with a recovery action: no internet, server unavailable, event unavailable, sync failed, location denied, notifications denied or unsupported (old iOS), session expired.
- **Accessibility** (§122): screen-reader labels, touch targets of at least 44 pt, contrast checks, large text, status shown with text and icon.
- **Performance** (§123): startup time, bundle size, list rendering, memoization, image sizes, database `EXPLAIN` review of the main queries, API caching for Home and taxonomy.
- **Security** (§125): rate limits, input validation, CORS, Content-Security-Policy, password policy, token revocation, dependency audit, and confirmation that the app bundle has no secrets.
- **Analytics abstraction** (§92): `AnalyticsService` with the spec's event names and a console / no-op provider.
- **Backups:** confirm the database provider's automatic backups and test one restore.
- **Docs:** README, `docs/API.md`, `docs/SOURCES.md`, `docs/RUNBOOK.md` (what to do if sync fails, how to add a source, how to add a user).
- **Release:** final `npm run deploy:web`; install on every team phone (iPhone and Android) using a written one-page guide.

**Definition of Done** (§162), checked on a real iPhone:
open app → see upcoming events → search "SAP" → filter Delhi → open an event → understand what, when, where, organizer, speakers and exhibitors → see why it matches → save → follow → add to calendar → set a reminder → prepare the checklist → event day → mark visited.

---

## 10. Core rules

### 10.1 Relevance (§27–28, §71)

Points per match between an event and the user's preferences:

| Signal | Points |
|---|---|
| Each matching technology (SAP, Odoo, …), max 2 counted | 3 |
| Each matching category, max 2 counted | 2 |
| Matching industry | 2 |
| Event in a preferred city or region | 2 |
| Preferred event type | 1 |
| Organizer of an event the user saved or followed before | 2 |
| Similar to the user's saved events (shared technology or category) | 1 |

Score 7 or more → **Strong match**. 4–6 → **Good match**. 1–3 → **Possible match**. 0 → no badge. The top four matched signals become the reason bullets ("SAP-focused", "Manufacturing audience", "In Hyderabad", "Enterprise technology conference"). Weights live in one config file and will be tuned with real use.

### 10.2 Deduplication (§63, §101)

1. **Exact:** same source + source event ID, or the same official URL after normalization (lowercase host, no tracking parameters, no trailing slash) → same event.
2. **Candidates:** same city (or region) and start dates within 3 days.
3. **Score** = 0.5 × title similarity (trigram) + 0.2 × same venue + 0.2 × same organizer + 0.1 × same start date.
4. Score ≥ 0.85 → attach as another source of the existing event. 0.60–0.85 → a "possible duplicate" for researcher review. Below 0.60 → new event.
5. Field priority when merging: official organizer > official event website > official venue > public event platform > directory. Manual overrides always win.

### 10.3 Change detection (§66, §104)

| Significance | Fields | Who is told |
|---|---|---|
| Critical | Status → cancelled / postponed / rescheduled; start date changed | Push to followers immediately (ignores quiet hours) |
| Major | Venue, start / end time, registration link, registration closed | Push to followers (respects quiet hours) |
| Minor | Description, price, new speakers / exhibitors, agenda changes | Change history and "Recently updated" only |

### 10.4 Notifications (§70, §137)

- Only these types exist: event change, saved-search match, new interest match (digest), reminder, starts tomorrow. No promotional messages.
- At most 3 non-critical push notifications per person per day; extra ones go to the inbox only.
- Quiet hours by default 21:00–08:00 IST (user-adjustable). Critical changes and user-set reminders ignore quiet hours.
- The same event never triggers the same alert twice.
- Everything sent is also stored in the inbox.

---

## 11. Event data sources strategy

- **Prefer, in order:** official APIs → ICS / RSS feeds → schema.org structured data on official pages → official pages read politely → researcher-curated entries.
- **Never:** bypass CAPTCHA, logins, paywalls, anti-bot systems, rate limits or robots.txt rules (§58, §139). A source that can't be used that way stays disabled. Many large event directory sites don't allow automated collection; those are used only if they offer an official API or feed.
- **Every source** has a compliance note in `docs/SOURCES.md`: terms checked, robots rules, fetch frequency, contact if any.
- **Starting point:** there's no existing list, so Phase 3 begins with source discovery (20–30 researched candidates for you to approve), plus "Add by URL" for events you hear about.
- **Optional later:** AI help for tagging, summaries and duplicate suggestions (§110), never for dates, venues, organizers, speakers, exhibitors or prices. Not part of this plan's scope or cost.

---

## 12. Environments, configuration and secrets

| Environment | App URL | API | Database | Data |
|---|---|---|---|---|
| Local | `localhost:8081` | `localhost:4000` | Local Postgres or Neon branch | Demo |
| Preview | `eas deploy` preview URL | Preview API | Preview database | Demo + test sources |
| Production | `*.expo.app` production URL | Production API | Production database | Real only |

**App variables (public, safe to ship):** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_DATA_MODE`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, `EXPO_PUBLIC_MAP_STYLE_URL`.

**Server secrets (host environment only, never in the app or git):** `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_PEPPER`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` (checked on `/internal/tick`), `EVENT_SYNC_INTERVAL_HOURS=12`, `CORS_ORIGINS`, source-specific keys if any.

---

## 13. Release and update process

```bash
# app: preview for review, then production
npm run deploy:preview      # expo export -p web + post-process + eas deploy
npm run deploy:web          # same, with --prod

# backend
npm run db:migrate          # apply migrations (run by the host on deploy)
npm run sync:run            # manual sync
npm run user:create         # create an account
```

Per phase: typecheck + tests → deploy API (migrations run automatically) → preview link → you check it on your phone → production deploy → app updates on next open.

---

## 14. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Shared logic | Vitest | Date presets, query parser, relevance, city aliases |
| Ingestion | Vitest + fixture files | Each adapter's parsing, normalizer, classifier, dedupe scores, change detection, idempotency |
| API | Vitest + Supertest + test database | Every endpoint, filters, pagination, roles, verified-only rule |
| App flows | Playwright (iPhone viewport) on the web build | Definition-of-Done journey, offline journey, saved-search journey |
| Real device | Your iPhone each phase | Install, push, calendar file, offline at a "venue" (airplane mode) |

---

## 15. Running costs

| Item | Cost |
|---|---|
| EAS Hosting (app), `mithford_again` account | Free tier is sufficient for 4–5 users |
| Postgres (Neon or Supabase) | Free tier is sufficient at this size |
| API (Render free web service) | Free. The 10-minute tick keeps it awake, which uses most of the free monthly hours, so this should be the only free Render service on the account. |
| Scheduler (cron-job.org) | Free |
| Map tiles | Free (OpenFreeMap or MapTiler free tier) |
| Web Push | Free |
| Apple Developer / Google Play | **Not needed** |

**Expected total: USD 0 per month.** Free-tier limits change over time; they're checked at the start of Phase 2 and recorded in the runbook. If a limit is ever about to be exceeded, you'll be told before anything costs money.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Few Indian B2B event sources can be legitimately automated | Curated sheet + "add by URL" from Phase 3; add automated sources one at a time with compliance notes |
| Push only works when the app was opened from the home screen | Install guide and in-app checks explain it; the inbox always has every alert |
| iOS may clear web app storage when the phone is low on space | Persistent storage request; everything important lives on the server and re-downloads |
| `.ics` handling inside the home-screen app | Tested on device in Phase 7; Google Calendar link as fallback |
| Free hosting: sleeping servers, monthly limits, services changing their free plans | 10-minute tick keeps the API awake; the app shows cached data instantly; all hosting is standard (Node + Postgres), so moving to another free host is a configuration change; limits checked in Phase 2 |
| Free cron service misses a tick | Reminders go out on the next tick (at most ~20 minutes late); GitHub Actions is a backup trigger for the 12-hour sync |
| No existing source list | Source discovery at the start of Phase 3; "Add by URL" for anything missed |
| Expo SDK changes | Stay on SDK 57 for the project; upgrade deliberately between phases if needed |
| Scope creep toward CRM / leads | Boundary audit in Phase 9; any such request is out of scope (§18) |

---

## 17. Decisions (recorded 1 October 2026)

| # | Question | Answer | Effect on the plan |
|---|---|---|---|
| D1 | Separate Android app? | No. Android team members use the web app. | No APK, no native code paths built |
| D2 | All team iPhones on iOS 16.4 or later? | Yes | Web Push works for everyone |
| D3 | Admin and researcher users? | Only you (admin) | Everyone else is a normal user; researcher role unused for now |
| D4 | Paid always-on server? | No, everything free for now | Free hosting + free cron service (§5, §15) |
| D5 | Existing list of events, organizers or websites? | No | Phase 3 starts with source discovery; "Add by URL" is the main manual tool |
| D6 | App name and link | "Event Intelligence India", `event-intelligence-india.expo.app` | Set in Phase 0 |

## 18. Out of scope (product boundary)

**In scope:** event discovery, search, filters, map, details, sources, relevance, save, follow, visit planning, checklist, notes, reminders, calendar, notifications, history, 12-hour sync, deduplication, change detection, admin data-quality tools.

**Never built in this app (§2, §132, §161):** lead capture, lead forms, business-card or QR scanning, OCR for leads, CRM integration, contacts, customers, prospects, opportunities, pipeline, follow-ups, sales notes, WhatsApp or email lead actions, sales or lead analytics, ticket sales or payments, event organizer management, public website, SEO pages, desktop dashboard.

Lead capture continues in the team's existing Excel workflow, outside this app.
