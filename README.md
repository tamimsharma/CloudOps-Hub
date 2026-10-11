# CloudOps Hub

Intelligent Cloud Operations Platform — a unified web platform for cloud engineering operations:
resource inventory, metrics monitoring, container & Kubernetes visibility, centralized logging,
incident detection, cost estimation, operational reports, AWS inventory and CI/CD insights.

**Stack:** React 18 + TypeScript + Vite · Node.js + Express + TypeScript · PostgreSQL (Prisma) ·
Redis · Docker · Kubernetes · Prometheus · Grafana · OpenSearch · AWS · GitHub Actions · Terraform-style IaC docs

---

## Quick start

### Option A — Docker (easiest way to run it on any laptop/PC)

Prerequisite: **Docker Desktop** only — no Node, no database setup.

| | |
| --- | --- |
| Windows | double-click **`START.bat`** |
| macOS / Linux | `bash start.sh` |
| or manually | `docker compose --profile app up --build` |

Then open **http://localhost:4000** — the API and the web UI are served by a single
container (`Dockerfile`), with PostgreSQL alongside it. The first build takes a few
minutes; later starts are seconds. Stop everything with
`docker compose --profile app down` — your data stays in the `postgres_data` volume.
If port 4000 is already taken (e.g. the dev API is running), the starters print the
port they actually used and retry automatically on **8080**.

Copy the whole project folder to another machine, start Docker, run the same command:
it behaves identically everywhere (Windows/macOS/Linux).

### Option B — from source (development)

Prerequisites: **Node ≥ 20**, **npm ≥ 10**, **Docker Desktop** (for Postgres/Redis/observability).

```bash
npm install                 # installs all workspaces
copy .env.example .env      # PowerShell (use: cp .env.example .env on bash/zsh)

npm run docker:up           # postgres + redis (+ prometheus, grafana, opensearch)
npm run db:generate         # prisma client
npm run db:push             # create schema
npm run db:seed             # resources, alerts, incidents, logs, costs + 3 demo role accounts

npm run dev                 # api (:4000) + web (:5173), concurrent
```

Open **http://localhost:5173** and sign in.

### One-click launch (Desktop shortcut)

`CloudOps Hub.lnk` on the Desktop runs `scripts\dev-launcher.ps1`, which does all of the above
for you and then opens the browser:

1. detects an already-running stack (and just opens the browser),
2. creates `.env` from `.env.example` and runs `npm install` if `node_modules` is missing,
3. starts `postgres` + `redis` via `docker compose` and waits for `:5432`,
4. creates/seeds the schema only when the database is empty (never overwrites demo data),
5. runs `npm run dev` in that window and opens http://localhost:5173 when it answers.

Stop the platform by closing the window (or Ctrl+C). Extra switches:

```powershell
.\scripts\dev-launcher.ps1 -FullStack   # also prometheus/grafana/opensearch
.\scripts\dev-launcher.ps1 -SkipDocker  # no containers at all
.\scripts\dev-launcher.ps1 -NoBrowser   # don't open the browser
```

> Only PostgreSQL is required to run the platform. Redis and the observability stack are optional;
> every external integration is behind an `ENABLE_*` flag (see below).

### Signing in — role cards

The sign-in screen leads with **one-click role cards** so it is always clear which role is
logging in. The cards sign into the demo accounts restored by `npm run db:seed`:

| Card | Credentials | Role | Can do |
| ---- | ----------- | ---- | ------ |
| **Administrator** | `admin@cloudops.local` / `Admin!2345` | ADMIN | everything: users, settings, destructive actions |
| **Engineer** | `engineer@cloudops.local` / `Engineer!2345` | ENGINEER | deployments, incidents, alerts, syncs |
| **Viewer** | `viewer@cloudops.local` / `Viewer!2345` | VIEWER | read-only dashboards, inventory, reports |

Underneath the cards, the normal **email + password** form signs into any account. Delete
the demo accounts from **Users** if you don't want them — the cards then report that the
account is unavailable (re-seed to restore them).

### Create your own account

Choose **Create one** on the sign-in screen:

| Step | What happens |
| ---- | ------------ |
| Register | `POST /api/auth/register` stores your email, name and a **bcrypt hash** of your password |
| First account | the first one **you register** becomes **ADMIN** (seeded demo accounts don't count); every account after starts as **VIEWER** |
| Later accounts | an ADMIN promotes them from **Users** (ADMIN / ENGINEER / VIEWER) |
| Sign in | email + password (`Remember me` extends the refresh-token lifetime) |
| Change password | **Profile** → *Change password* (requires the current password, signs out other sessions) |

Demo operational data (resources, metrics, logs, alerts, incidents, costs) is seeded by
`npm run db:seed`, and re-seeding never deletes registered accounts.

### Ports

| Service        | Port |
| -------------- | ---- |
| Web (Vite)     | 5173 |
| API (Express)  | 4000 |
| PostgreSQL     | 5432 |
| Redis          | 6379 |
| Prometheus     | 9090 |
| Grafana        | 3000 |
| OpenSearch     | 9200 |
| OpenSearch Dashboards | 5601 |

The dev web server proxies `/api` and `/health` (JSON fetches) to `http://localhost:4000`;
browser navigations to SPA routes such as `/health` always render the app.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Build shared packages, then run API + web with hot reload |
| `npm run build` | Build packages, API (tsc) and web (vite) for production |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run test` | Vitest (21 unit tests: cost engine, metrics simulator) |
| `npm run lint` | ESLint across every workspace |
| `npm run db:push` / `db:migrate` / `db:seed` / `db:reset` / `db:studio` | Prisma database lifecycle |
| `npm run docker:up` / `docker:down` / `docker:logs` | Observability + database containers |
| `npm run docker:app` | Build + start the single-container app package (same as `START.bat`) |
| `scripts/smoke-test.ps1` (or `.sh`) | End-to-end API smoke test against a running server |

---

## Repository layout

```
apps/
  api/          Express + Prisma API (modules: auth, resources, monitoring, containers,
                kubernetes, deployments, logs, alerts, incidents, costs, reports, cicd,
                aws, health, users) — 4-file module pattern (routes/service/types/index)
  web/          React SPA — 16 lazy-loaded pages, auth + RBAC guards, charts, tables
packages/
  shared/       Shared utils: config loader, crypto (bcrypt), envelope, logger, health
  types/        Shared TypeScript types
  config/       ESLint / TS base configurations
docs/           architecture.md · api.md · deployment.md · runbook.md · security.md
Dockerfile      single-image build (API + built web UI) used by `docker compose --profile app`
docker/         entrypoint.sh — schema push, first-run seed, then starts the API
docker-compose.yml  postgres, redis, app (profile "app") · prometheus, grafana,
                opensearch (profile "full")
START.bat · start.sh  one-command Docker starters for Windows / macOS-Linux
.github/workflows/  ci.yml (lint/typecheck/test/build) · deploy.yml
scripts/        setup, dev-launcher, smoke-test, bootstrap (Docker first-run seed), db init
```

Every API route responds with a consistent envelope:
`{ success, data, pagination?, message? }` or `{ success: false, error: { code, message, requestId } }`.

---

## Feature flags / integrations

External systems are **optional** and disabled by default so the app runs standalone with
deterministic simulated data (metrics, logs, containers, deployments, CI runs, AWS inventory):

```
ENABLE_AWS_INTEGRATION=false
ENABLE_KUBERNETES_INTEGRATION=false
ENABLE_PROMETHEUS_INTEGRATION=false
ENABLE_GRAFANA_INTEGRATION=false
ENABLE_OPENSEARCH_INTEGRATION=false
ENABLE_DOCKER_INTEGRATION=false
ENABLE_GITHUB_INTEGRATION=false
```

Set a flag to `true` and fill the matching credentials (`.env.example`) to use the real
integration. The **Health → Integration flags** page shows every switch and its endpoint.

---

## Security

- Passwords are bcrypt-hashed; JWT access tokens expire in 15 min with refresh rotation.
- Roles: **ADMIN** (full control), **ENGINEER** (operate), **VIEWER** (read-only) — enforced
  server-side by `requireRole` and mirrored in the UI.
- **Never commit secrets:** `.env`, AWS keys, JWT secrets and passwords are git-ignored.
  `.env.example` documents every variable with safe placeholder values.
- Rate limiting, CORS allow-listing and request-id error logging are enabled — see
  [docs/security.md](docs/security.md).

---

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design, data flow, module map
- [docs/api.md](docs/api.md) — full REST API reference with examples
- [docs/deployment.md](docs/deployment.md) — Docker, Kubernetes, GitHub Actions, infrastructure
- [docs/runbook.md](docs/runbook.md) — day-2 operations, alert response, troubleshooting
- [docs/security.md](docs/security.md) — hardening, secrets, access control
