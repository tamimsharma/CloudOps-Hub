# Deployment Guide

This document covers the four ways to run CloudOps Hub: local development,
docker-compose, Kubernetes and AWS with Terraform, plus the GitHub Actions
pipelines that automate CI and CD.

## Prerequisites

| Tool | Version | Required for |
| --- | --- | --- |
| Node.js | >= 20 | local dev, CI |
| npm | >= 10 | local dev, CI |
| Docker + Compose | recent | containerized stack |
| kubectl | >= 1.28 | Kubernetes deployment |
| Terraform | >= 1.5 | AWS infrastructure |
| AWS CLI | latest | AWS credentials/verification |
| PowerShell | 5.1+ (Windows) or pwsh | `scripts/setup.ps1`, `scripts/smoke-test.ps1` |

## Local development

### Windows (PowerShell)

```powershell
.\scripts\setup.ps1
npm run dev
.\scripts\smoke-test.ps1
```

One-click alternative: double-click **`CloudOps Hub.lnk`** on the Desktop (or run
`.\scripts\dev-launcher.ps1`). It prepares `.env`/dependencies, starts `postgres` + `redis`,
creates and seeds the schema only when the database is empty, runs `npm run dev` in that
console window and opens the browser once `:5173` answers. Flags: `-FullStack`,
`-SkipDocker`, `-NoBrowser`. Close the window to stop the stack.

### macOS / Linux (bash)

```bash
./scripts/setup.sh
npm run dev
./scripts/smoke-test.sh
```

Both setup scripts:

1. verify `node` (>= 20), `npm` and `docker`;
2. copy `.env.example` to `.env` if `.env` does not exist;
3. run `npm install` for all workspaces;
4. run `npm run db:generate`, `npm run db:push` and `npm run db:seed`.

Flags: `-SkipDb` / `--skip-db` skips database steps, `-SkipDocker` /
`--skip-docker` skips the Docker check.

Manual equivalent:

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Services after `npm run dev`:

- API: <http://localhost:4000> (`/health`, `/ready`, `/api`)
- Web: <http://localhost:5173>

## docker-compose

The compose file is grouped by **profiles** so a laptop install stays light:

| Profile | Command | Starts |
| --- | --- | --- |
| *(default)* | `docker compose up -d postgres redis` | database + cache (dev) |
| `app` | `docker compose --profile app up --build` | postgres, redis, **app** — API + web UI in one container |
| `full` | `docker compose --profile full up -d` | postgres, redis, prometheus, grafana, opensearch |

### Packaged app (recommended for other machines)

```bash
# Windows: START.bat      macOS/Linux: bash start.sh
docker compose --profile app up --build   # first run builds the image (a few minutes)
# open http://localhost:4000
docker compose --profile app logs -f      # tail the app
docker compose --profile app down         # stop (volumes are kept)
docker compose --profile app down -v      # stop and delete data volumes
```

Overrides: `APP_PORT` (host port, default `4000`) and `APP_URL` (origin used for CORS), e.g.

```bash
APP_PORT=8080 APP_URL=http://localhost:8080 docker compose --profile app up --build
```

`START.bat` / `start.sh` do that retry for you: if port 4000 is busy they start the
app on 8080 and print the port they used.

`JWT_SECRET` / `JWT_REFRESH_SECRET` are read from `.env` when present; otherwise the
compose defaults are used (fine locally — set real secrets before any internet-facing deploy).

On first start `docker/entrypoint.sh`:

1. waits for PostgreSQL and runs `prisma db push` (idempotent),
2. seeds demo data + the three demo role accounts **only when the database is empty**
   (`scripts/bootstrap.mjs`), never wiping existing rows,
3. starts the API, which serves the built web bundle (`apps/web/dist`) — one URL for
   the whole platform.

Stack contents (see `docker-compose.yml`):

| Service | Image | Host port | Profile | Notes |
| --- | --- | --- | --- | --- |
| postgres | postgres:16-alpine | 5432 | — | runs `scripts/init-db.sql` on first start |
| redis | redis:7-alpine | 6379 | — | healthcheck via `redis-cli ping` |
| app | built from `Dockerfile` | 4000 (`APP_PORT`) | `app` | API + web UI, `HEALTHCHECK` on `/health` |
| prometheus | prom/prometheus:v2.48.0 | 9090 | `full` | mounts `infrastructure/prometheus/prometheus.yml` |
| grafana | grafana/grafana:10.2.2 | 3000 | `full` | admin/admin, provisioned datasource + dashboards |
| opensearch | opensearchproject/opensearch:2.11.0 | 9200 | `full` | single-node, security disabled for dev |
| opensearch-dashboards | opensearchproject/opensearch-dashboards:2.11.0 | 5601 | `full` | optional |

Notes:

- `scripts/init-db.sql` is idempotent (role + database + grants) and only runs
  on an empty data volume.
- Prometheus alert rules live in
  `infrastructure/prometheus/alerts/cloudops-alerts.yml`. To load them in
  docker-compose, add this mount to the `prometheus` service:
  ```yaml
  - ./infrastructure/prometheus/alerts:/etc/prometheus/alerts:ro
  ```
- Grafana dashboards are provisioned from
  `infrastructure/grafana/dashboards/cloudops-overview.json`; the provider file
  `dashboards.yml` points at `/etc/grafana/provisioning/dashboards` because
  docker-compose bind-mounts that folder there.
- OpenSearch retention: create an ISM policy on first use (security is disabled
  in dev, so no credentials are required):
  ```bash
  curl -X POST http://localhost:9200/_plugins/_ism/policies/cloudops-logs \
    -H 'Content-Type: application/json' -d '{
      "policy": {
        "description": "Delete log indices after 14 days",
        "default_state": "hot",
        "states": [
          {"name": "hot", "actions": [], "transitions": [{"state_name": "delete", "conditions": {"min_index_age": "14d"}}]},
          {"name": "delete", "actions": [{"delete": {}}], "transitions": []}
        ],
        "ism_template": [{"index_patterns": ["logs-*"], "priority": 0}]
      }
    }'
  ```

## Kubernetes

Manifests live in `infrastructure/kubernetes/`:

```
namespace/cloudops.yaml
configmaps/api-config.yaml
deployments/{api,web,postgres,prometheus,grafana,opensearch}.yaml
services/{api,web,postgres,prometheus,grafana,opensearch}.yaml
ingress/cloudops.yaml
```

Apply order:

```bash
kubectl apply -f infrastructure/kubernetes/namespace/
kubectl apply -f infrastructure/kubernetes/configmaps/
kubectl apply -f infrastructure/kubernetes/deployments/
kubectl apply -f infrastructure/kubernetes/services/
kubectl apply -f infrastructure/kubernetes/ingress/

kubectl -n cloudops get pods -w
```

With the [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller
installed:

```bash
echo "127.0.0.1 cloudops.local" | sudo tee -a /etc/hosts
curl http://cloudops.local/            # -> web:5173
curl http://cloudops.local/api/health  # -> api:4000
```

Notes:

- All resources carry `app.kubernetes.io/*` labels; deployments use
  `envFrom: configMapRef: api-config`.
- Images default to `ghcr.io/<org>/cloudops-{api,web}:latest` - replace `<org>`
  with your GitHub organization/user (lowercase) and set `imagePullPolicy`
  accordingly, or `kubectl set image deployment/api api=ghcr.io/you/cloudops-hub-app:<sha>`
  (the repository's single `Dockerfile` builds that app image; it serves the API
  *and* the built UI on port 4000, so the separate `web` deployment is only needed
  when you split the UI into its own pod).
- `api-config` holds plaintext dev credentials. For production create a Secret
  (see `docs/security.md`) and switch the deployments to `secretKeyRef`.
- The OpenSearch deployment uses a privileged init container to set
  `vm.max_map_count=262144`; remove it on clusters where that sysctl is already
  set node-wide.
- Persist data with the included PVCs (`postgres-data`, `opensearch-data`);
  Prometheus/Grafana use `emptyDir` - attach PVCs for durability.

## AWS with Terraform

Structure:

```
infrastructure/terraform/
  modules/{vpc,ec2,s3,iam,monitoring}/
  environments/{development,staging,production}/
    main.tf  variables.tf  terraform.tfvars
```

Each environment wires the same five modules:

- `vpc` - VPC, two public subnets, IGW, route table, security group (22/80/443)
- `ec2` - Amazon Linux 2023 instance, key pair, user data installs Docker
- `s3` - versioned, encrypted, public-access-blocked bucket with lifecycle rules
- `iam` - EC2 role/policy for S3 + CloudWatch, instance profile
- `monitoring` - CloudWatch alarms (CPU, status check, disk) + SNS topic

### One-time state backend

```bash
aws s3 mb s3://cloudops-terraform-state
aws dynamodb create-table \
  --table-name cloudops-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Then uncomment the `backend "s3"` block in the environment `main.tf` and run
`terraform init -reconfigure`.

### Plan and apply

```bash
cd infrastructure/terraform/environments/development
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Same commands in `environments/staging` and `environments/production`.
Important: set a real `ssh_public_key`, a unique `s3_bucket_name`, and
restrict `allowed_cidr_blocks` (especially port 22) in
`terraform.tfvars` before applying production.

Verify:

```bash
terraform output -module 2>/dev/null || true
aws ec2 describe-instances --filters "Name=tag:Environment,Values=production"
```

## GitHub Actions

### CI - `.github/workflows/ci.yml`

Triggered on push and pull request to `main`:

1. **lint-and-typecheck** - `npm ci`, `npm run typecheck`, `npm run lint`
2. **test** - `postgres:16-alpine` service container, `DATABASE_URL` pointing at
   `localhost:5432`, runs `npm run db:generate`, `npm run db:push`,
   `npm run test:api`
3. **build** - `npm run build`, uploads `apps/*/dist` and `packages/*/dist`
   artifacts (7 days)

### CD - `.github/workflows/deploy.yml`

Triggered on push to `main` and by `workflow_dispatch`:

1. **build-and-push** - logs into `ghcr.io`, builds the single `Dockerfile`
   (API + web UI) with `docker/build-push-action@v5` (GHA layer cache),
   pushes `ghcr.io/<owner>/<repo>-app:<sha>` and `:latest`.
2. **terraform** - runs in the GitHub `environment: production` (approval rules
   are configured per repository); `terraform fmt -check`, `init`, `plan`,
   `apply` (apply only for push events) in
   `infrastructure/terraform/environments/production`.
3. **deploy-ec2** - writes `deploy.env` and a runtime
   `docker-compose.deploy.yml`, copies both over SSH, logs the host into GHCR
   with the workflow token and runs
   `docker compose pull && docker compose up -d`, then smoke-tests `/` and
   `:4000/health`.

Required repository configuration:

| Kind | Name | Used by |
| --- | --- | --- |
| Secret | `AWS_SSH_KEY` | private key for EC2 (multi-line PEM/OpenSSH) |
| Secret | `AWS_EC2_HOST` | public DNS/IP of the instance |
| Secret | `AWS_SSH_USER` | SSH user (optional, defaults to `ec2-user`) |
| Secret | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Terraform |
| Secret | `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` | runtime env (optional, sane defaults are used) |
| Variable | `AWS_REGION` | Terraform (default `us-east-1`) |
| Variable | `CORS_ORIGIN` | deploy env (optional) |
| Environment | `production` | terraform job (add required reviewers for approvals) |

The EC2 instance must have Docker installed (the module's user data does this)
and must allow inbound HTTP (80) plus SSH (22) from GitHub Actions runners.

## Rollback

- **Compose/EC2:** re-run the deploy workflow for a previous commit
  (`workflow_dispatch` on the desired SHA) or on the host:
  ```bash
  cd /opt/cloudops
  APP_IMAGE=ghcr.io/<owner>/<repo>-app:<previous-sha> \
  docker compose -p cloudops -f docker-compose.deploy.yml --env-file deploy.env up -d
  ```
- **Kubernetes:** `kubectl rollout undo deployment/api -n cloudops`
- **Terraform:** `terraform apply <previous-tfplan>` or revert the commit and
  let the deploy workflow re-apply.
