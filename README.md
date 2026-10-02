# Event Intelligence India

An internal app for a team of 4–5 people to discover professional events across India (conferences, expos, summits, trade shows), decide which are worth attending, track them, and record visits.

**Scope:** Discover → Evaluate → Track → Remember → Visit. The app never handles leads, CRM, contacts or sales; lead capture stays in the team's existing Excel workflow.

- **Live app:** https://event-intelligence-india.expo.app
- **Plan:** [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) · **Deploying and operating:** [docs/RUNBOOK.md](docs/RUNBOOK.md)
- **Progress:** Phase 0 ✅ · Phase 1 ✅ · Phase 2 ✅ (API live at https://event-intel-api.onrender.com) · Phase 3 ✅ (live event sources) · Phase 4 ✅ (sign-in, interests, relevance) · Phase 5 ✅ (tracking and offline) · Phase 6 ✅ (discovery: natural search, zones, filters, map, saved searches) · Phase 7 ✅ (alerts, reminders, calendar, Event Day) · Phase 8 ✅ (admin tools)
- **Expo project:** `@mithford_again/event-intelligence-india`

## Install on a phone

| Phone | Steps |
|---|---|
| iPhone (iOS 16.4+) | Open the link in **Safari** → **Share** → **Add to Home Screen** → **Add**. Always open the app from the home-screen icon. |
| Android | Open the link in **Chrome** → **Install app** (or menu ⋮ → **Add to Home screen**). |

Updates arrive automatically the next time the app is opened; **More** shows the version and when it was built.

## Repository layout

```
apps/mobile      Expo + Expo Router + TypeScript app, exported to web (installable home-screen app)
apps/api         Node + Express + TypeScript API on PostgreSQL (embedded PGlite locally, Neon in production)
packages/shared  Domain types, API contracts (zod), taxonomy, Indian cities, IST dates, search rules, sample data
docs/            Development plan and runbook
render.yaml      API deployment (Render free plan)
```

## Develop

Requires Node 22+.

```bash
npm install
npm run dev:api        # API at http://localhost:4000 (embedded database, sample events)
npm run dev:web        # app at http://localhost:8081 (use a phone-sized window)
npm run typecheck
npm run lint
npm test --workspaces --if-present
```

The app uses bundled sample data unless `apps/mobile/.env.development.local` points it at an API (see the runbook).

## Release the app

```bash
npm run deploy:preview   # preview URL to review first
npm run deploy:web       # production (event-intelligence-india.expo.app)
```

Needs the Expo CLI logged in as `mithford_again` (`npx eas-cli login` if it ever expires).

## Configuration and secrets

- App: public settings only, in `apps/mobile/.env*` (`EXPO_PUBLIC_*` values are visible to anyone).
- API: `DATABASE_URL`, `CRON_SECRET` and other secrets live only in the Render dashboard (or a local, untracked `apps/api/.env`).
