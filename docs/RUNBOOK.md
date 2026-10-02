# Runbook

How to deploy, run and look after Event Intelligence India. Everything runs on free plans.

| Part | Where | Free-plan limits (checked 1 Oct 2026) |
|---|---|---|
| App (installable web app) | EAS Hosting, `event-intelligence-india.expo.app` | Ample for 4–5 users |
| API | Render free web service, region Singapore | 750 instance hours/month per workspace; sleeps after 15 min without traffic; about 1 min to wake |
| Database | Neon free, region AWS Singapore | 0.5 GB storage; 100 compute-hours/month; suspends after 5 idle minutes; no card needed |
| Scheduler | cron-job.org, every 10 minutes | Free |

**Why the scheduler matters:** the 10-minute ping keeps the free API awake, so the app never waits a minute for it to wake. The ping does **not** touch the database unless work is due (statuses hourly, sample data daily; the 12-hour sync from Phase 3). That keeps the database within its 100 compute-hours.

**Render hours:** one always-awake service uses about 744 of the 750 monthly hours, so this must be the only free Render service in that Render workspace.

---

## First-time deployment (about 20 minutes)

You create the accounts and paste the secrets yourself; they never go into the code or the chat.

### 1. Put the code on GitHub (private)
Render deploys from a Git repository.
1. Create a **private** repository on github.com, e.g. `event-intelligence-india`.
2. Push this project to it (Claude can do this once you share the repository URL and confirm).

### 2. Create the database (Neon)
1. Sign up at neon.com (free, no card).
2. Create a project: name `event-intelligence`, **region AWS Asia Pacific (Singapore)**, Postgres 17 or newer.
3. Copy the **connection string** (Dashboard → Connect → "Connection string", pooled is fine). It looks like `postgresql://…@…neon.tech/neondb?sslmode=require`. Keep it private.

### 3. Create the API (Render)
1. Sign up at render.com with your GitHub account.
2. **New → Blueprint**, pick the repository. Render reads `render.yaml` and proposes the `event-intel-api` service on the free plan.
3. When asked for `DATABASE_URL`, paste the Neon connection string.
4. Deploy. The first build takes a few minutes. The API migrates the database and loads the sample events on first start.
5. Note the service URL, e.g. `https://event-intel-api.onrender.com`. Check `https://<url>/health` shows `"status":"ok"`.
6. In the service's **Environment** tab, copy the generated `CRON_SECRET`.

### 4. Create the scheduler (cron-job.org)
1. Sign up at cron-job.org (free).
2. **Create cronjob**:
   - URL: `https://<your-api>.onrender.com/internal/tick`
   - Schedule: every 10 minutes
   - Advanced → Request method **POST**; add header `X-Cron-Secret` = the `CRON_SECRET` from Render.
3. Run it once; the response should be `{"status":"ok",…}`.

### 5. Point the app at the API
1. Create `apps/mobile/.env.production` (public values only):
   ```
   EXPO_PUBLIC_DATA_MODE=api
   EXPO_PUBLIC_API_URL=https://<your-api>.onrender.com/v1
   ```
2. `npm run deploy:web`. The installed app picks this up on next open; More → Event Data shows the server's status.

---

## Accounts (Phase 4)

There's no public sign-up. Everyone signs in with an account the admin creates.

- **Your admin account:** in Render → event-intel-api → Environment, set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` (you type the password there; it never goes in git or chat). On start the API creates the account if that email has none. It never changes an existing account, so after your first sign-in you can delete `ADMIN_PASSWORD`.
- **Team members:** in the app, More → Team → Add Member. The app shows a one-time temporary password and a Share button for the sign-in details. On first sign-in they choose their own password.
- **Forgotten password:** More → Team → the person → Reset Password (a new temporary password; they're signed out everywhere).
- **Someone leaves:** More → Team → Remove Access. Their sessions end at once; the account is kept and can be restored.
- **Sessions:** access tokens last 15 minutes and refresh silently; a phone that isn't opened for 60 days signs in again. A refresh token used twice ends that sign-in everywhere.
- **Signing secret:** generated once and kept in the database. Setting `JWT_SECRET` (32+ characters) overrides it; changing either signs everyone out.
- **Locally:** `apps/api/.env` (gitignored) holds a test admin for the embedded database; see `apps/api/.env.example`.

## Alerts (Phase 7)

- **Keys:** the Web Push key pair is generated on the first start and kept in the database. Setting `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` overrides it; changing keys means everyone turns alerts on again.
- **iPhone:** alerts work only in the installed app (opened from the Home Screen, iOS 16.4+), after tapping **Turn On Alerts** (onboarding or More → Notifications). **Send a Test** there confirms the device receives them.
- **When alerts go out:** changes and new matches right after each sync (every 12 hours); reminders within about 10 minutes of their time; "starts tomorrow" once each evening after 6 PM IST.
- **Rules:** everything goes to the inbox; at most 3 non-critical pushes per person per day; quiet hours (default 9 PM–8 AM) hold non-critical ones; cancellations, postponements, date changes and reminders always come through; the same alert is never sent twice.
- **Calendar files:** "Add to Calendar" opens a signed link to `/calendar/<event>.ics` on the API (valid for a day), so the phone's calendar can read it without signing in.

## Backups (Phase 9)

Two layers, both free:

1. **Neon's own history.** Neon can restore the database to an earlier moment (Dashboard → your project → **Restore**). The free plan keeps only a short window (hours, not weeks), so this is for "something went wrong today".
2. **The team backup file.** More → Admin → **Download Backup** (admin only) saves one JSON file: accounts (never passwords), interests, saves, follows, visit plans, notes, checklists, reminders, saved searches, alert settings, events added by hand, edited fields, review and merge decisions, and source on/off choices. Events from sources aren't in it; a sync brings them back. On iPhone choose **Save to Files**. **Do this monthly and after big edits**, and keep the file private (it contains everyone's notes).

**Restoring the file** (onto a new or emptied Neon database), from this computer:
1. Put the Neon connection string in `apps/api/.env` as `DATABASE_URL=…` (that file is gitignored; remove the line afterwards).
2. `npm run cli -w @eii/api -- sync` to bring the events back.
3. `npm run cli -w @eii/api -- restore path/to/eii-backup-YYYY-MM-DD.json`.
4. The report lists accounts it had to create: give each one a password in More → Team → **Reset Password**. If it says rows were skipped, a source hasn't returned that event yet: run the sync again later and restore again (restoring twice never duplicates or overwrites anything).

`npm run cli -w @eii/api -- backup` makes the same file from this computer.

**Housekeeping:** after each sync the API deletes sign-ins that expired over a week ago and notifications older than six months.

## Adding a source

1. Check it's allowed: robots.txt permits it and there's no login, paywall or bot protection (see [SOURCES.md](SOURCES.md) for the rules and the current list).
2. Add its definition in `apps/api/src/ingestion/registry.ts` (using an existing reader: JSON-LD pages, iCal, RSS, sitemaps, event listing cards, confs.tech, or the team sheet).
3. Try it without saving: `npm run cli -w @eii/api -- try-source <id>`.
4. Deploy, then add the id to `SOURCES_ENABLED` in Render → Environment (or turn it on in More → Admin → Sync & Sources). The next sync picks it up; **Run Sync Now** starts one immediately.

## Everyday commands

```bash
npm run dev:api          # API on http://localhost:4000 with an embedded database (.data/pglite)
npm run dev:web          # app on http://localhost:8081
npm test --workspaces --if-present
npm run typecheck
npm run deploy:preview   # app preview URL
npm run deploy:web       # app production
```

To run the local app against the local API, `apps/mobile/.env.development.local` contains:
```
EXPO_PUBLIC_DATA_MODE=api
EXPO_PUBLIC_API_URL=http://localhost:4000/v1
```
Delete it to use the bundled sample data instead. (Use the `.development.local` name: Expo also reads plain `.env.local` during production builds.)

## When something goes wrong

| Symptom | Check | Fix |
|---|---|---|
| App shows "Couldn't Load" for everything | `https://<api>/health` | If it doesn't answer, open the Render dashboard → Logs. Redeploy if needed. |
| First load is slow (about a minute) | cron-job.org history | The ping stopped, so the API went to sleep. Re-enable the cron job. |
| `/health?db=1` fails | Neon dashboard | Database suspended or over its monthly compute; check Neon usage. |
| Tick returns 401 | Header name and value | Must be `X-Cron-Secret` with the exact `CRON_SECRET` value from Render. |
| Render says hours exhausted | Render billing page | Another free service in the same workspace is using hours; suspend it. |
| A source shows "failing" in Sync & Sources | Its last error there | 403/429: the site now blocks automated reading; turn the source off and use Add by URL or the team sheet (never work around blocks). 404 or "no events": the site changed its pages; try `try-source <id>` locally and update the definition. |
| No sync for over a day | Sync & Sources → last run; cron-job.org history | The tick starts syncs: re-enable the cron job, then **Run Sync Now**. |
| Events look wrong after a sync | Admin → Source Conflicts | Pick the right value; or edit the event (edited fields are kept by later syncs). |
| Someone can't sign in | More → Team | Reset Password gives a new temporary password; check the account wasn't removed. |
| The map is blank | Browser console on the web app | Its tile worker comes from `/maplibre/` on the app site; redeploy with `npm run deploy:web` (it copies the worker in). |

## Security notes (Phase 9 review)

- **Secrets** live only in Render's Environment tab and the local, gitignored `apps/api/.env`. The app contains no secrets (checked in the built files); `EXPO_PUBLIC_*` values are public by design.
- **Web app:** a Content-Security-Policy allows scripts only from the app's own site, data over HTTPS, and nothing embedded from elsewhere. The API adds Helmet's security headers and allows calls only from the app's address.
- **Passwords** are hashed with scrypt; sign-in is rate-limited; refresh tokens are stored hashed and a reused one ends that sign-in everywhere. Every admin action is in the audit log.
- **`npm audit` (2 Oct 2026):** the API's production packages have **no** known issues. The remaining findings are in Expo's build tooling (`@expo/cli`, `node-forge`, `@expo/config-plugins` → `uuid`), which runs only on the computer that builds the app and never ships to phones. One reaches the app: `decode-uri-component` (via Expo Router), a moderate slowdown on a deliberately malformed link opened on your own phone; its fix is a newer format Expo Router can't load yet. Re-check after Expo updates (`npm audit`) and apply fixes that don't need `--force`.

## Free-plan watch list
Re-check these if the providers change their plans; nothing is paid without your approval:
- Render: free instance hours, spin-down time.
- Neon: compute-hours per month and storage (0.5 GB holds far more events than this app needs).
- cron-job.org: job frequency and custom headers.
