# Deploying OptiFlow (Railway + Vercel)

This assumes the code changes in this update have already been extracted on
top of your local `optiflow` folder. It walks through: push to GitHub →
Railway (API + worker + Postgres + Redis) → Vercel (frontend) → wire them
together.

## 0. What changed for deployment

- `apps/web/src/lib/api.ts` now reads `VITE_API_URL` (falls back to the dev
  proxy's `/api` when unset), instead of always calling same-origin `/api`.
- `apps/web/vercel.json` — SPA rewrite so routes like `/bookings` don't 404
  on a hard refresh.
- `apps/api/src/index.ts` — `CORS_ORIGIN` now accepts a comma-separated list
  (e.g. your Vercel production URL + a preview URL + localhost).
- `apps/api/package.json` — `postinstall` now runs `prisma generate`,
  `start` now runs `prisma migrate deploy` before starting the server (safe
  to run on every boot - it's a no-op once migrations are applied), and a
  new `start:worker` script (`node dist/worker.js`) for the worker service.
- `.gitignore` at the repo root (this project wasn't in git yet).

## 1. Push to GitHub

From your local `optiflow` folder (not this sandbox):

```bash
cd optiflow
git init
git add .
git commit -m "OptiFlow: backend + frontend complete"
```

Create an empty repo on GitHub (github.com/new — don't initialize it with a
README), then:

```bash
git remote add origin https://github.com/<your-username>/optiflow.git
git branch -M main
git push -u origin main
```

## 2. Railway — Postgres, Redis, API, Worker

Railway will host: a Postgres database, a Redis instance, the API process,
and a separate worker process (BullMQ needs its own long-running process -
see `apps/api/src/worker.ts`'s own comment on why it's split out).

1. **New Project** on [railway.app](https://railway.app) → **Deploy from GitHub repo** → pick your `optiflow` repo.
2. **Add Postgres**: New → Database → Add PostgreSQL. Railway sets `DATABASE_URL` on it automatically.
3. **Add Redis**: New → Database → Add Redis. Railway sets `REDIS_URL` on it automatically.
4. **API service**: on the service Railway created from your repo (or New → GitHub Repo again if you added the databases first):
   - Settings → **Root Directory**: `apps/api`
   - Settings → **Variables** → click **Reference variable** to pull in `DATABASE_URL` from the Postgres service and `REDIS_URL` from the Redis service, then add these directly:
     ```
     NODE_ENV=production
     JWT_ACCESS_SECRET=<openssl rand -base64 48>
     JWT_REFRESH_SECRET=<a different one>
     CORS_ORIGIN=https://<your-vercel-app>.vercel.app
     WHATSAPP_PROVIDER=mock
     WHATSAPP_WEBHOOK_VERIFY_TOKEN=<pick a token>
     AI_PROVIDER=mock
     ```
     (Leave `PORT` unset - Railway injects it and `env.ts` already reads `process.env.PORT`. Swap `WHATSAPP_PROVIDER`/`AI_PROVIDER` to real providers plus their credentials once you have them - `apps/api/.env.example` lists exactly what each provider needs. `CORS_ORIGIN` can be updated after step 3 once you know the real Vercel URL - Railway redeploys on env var changes.)
   - Railway auto-detects Node via Nixpacks: `npm install` (which now also runs `prisma generate` via `postinstall`) → `npm run build` → `npm start` (which runs `prisma migrate deploy` first, then boots the server).
   - Once deployed, Settings → **Networking** → **Generate Domain** to get a public URL like `optiflow-api-production.up.railway.app`. That's your `VITE_API_URL` origin for step 3.
5. **Worker service**: New → GitHub Repo → same `optiflow` repo again.
   - Settings → **Root Directory**: `apps/api`
   - Settings → **Variables**: same as the API service (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, etc. - reference the same Postgres/Redis services). `CORS_ORIGIN` isn't used by the worker but doesn't hurt to include.
   - Settings → **Deploy** → **Custom Start Command**: `npm run start:worker`
   - No public domain needed for this one.
6. **Seed the database once** (permission catalogue, system role templates, and a super-admin login - `apps/api/prisma/seed.ts`). From your local `optiflow/apps/api` folder, with the Railway CLI installed and logged in (`npm i -g @railway/cli`, `railway login`):
   ```bash
   railway link          # pick the API service
   railway run npx tsx prisma/seed.ts
   ```
   This also creates a demo practice with sample data and a super-admin user at `superadmin@optiflow.test` / `SuperAdminPass123!` - **log in and change that password immediately**, or delete/adjust the demo rows it seeds if you don't want them in production. Open `apps/api/prisma/seed.ts` if you want to trim what it creates before running it.

## 3. Vercel — frontend

1. **Add New Project** on [vercel.com](https://vercel.com) → import the same `optiflow` GitHub repo.
2. **Root Directory**: `apps/web` (Vercel auto-detects the Vite framework preset once you set this).
3. **Environment Variables** → add:
   ```
   VITE_API_URL=https://<your-railway-api-domain>/api
   ```
   (the `/api` suffix matters - it's the base every frontend request is built on top of).
4. Deploy. Vercel gives you a URL like `optiflow.vercel.app`.

## 4. Wire them together

Go back to the **Railway API service** → Variables → set `CORS_ORIGIN` to your real Vercel URL(s), comma-separated if you want more than one:

```
CORS_ORIGIN=https://optiflow.vercel.app,https://optiflow-git-main-<you>.vercel.app
```

Railway redeploys the API automatically on variable changes. That's the full loop closed:

```
Browser → Vercel (static React app)
            │  VITE_API_URL
            ▼
        Railway API  ──▶  Railway Postgres
            │             Railway Redis
            ▼
        Railway Worker (campaign sends)
```

## 5. Verify

- Visit the Vercel URL, log in as the super-admin (or an invited practice user), confirm the dashboard loads real data.
- Check Railway's API service logs for the `OptiFlow API listening on port ...` line and no crash loops.
- Launch a test campaign and check the worker service's logs for `Campaign send job completed`.

## Notes on what's still `mock`

`WHATSAPP_PROVIDER=mock` and `AI_PROVIDER=mock` (the defaults above) simulate
sends/replies without calling a real WhatsApp Business API or Anthropic -
fine for a first deploy to confirm everything wires up, but customers won't
receive real WhatsApp messages until you switch these to real providers and
credentials (see `apps/api/.env.example` for exactly which vars each
provider needs).
