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

## Free-plan watch list
Re-check these if the providers change their plans; nothing is paid without your approval:
- Render: free instance hours, spin-down time.
- Neon: compute-hours per month and storage (0.5 GB holds far more events than this app needs).
- cron-job.org: job frequency and custom headers.
