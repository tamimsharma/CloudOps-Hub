# Security

Security controls for CloudOps Hub: role-based access, secrets handling, token
rotation, rate limiting and the surrounding hardening measures.

## Threat model summary

| Asset | Threat | Control |
| --- | --- | --- |
| User accounts | credential stuffing, token theft | bcrypt passwords, short-lived JWTs, refresh rotation, rate limiting |
| Infrastructure (cloud/k8s/docker) | privilege escalation via API | RBAC (`ADMIN > ENGINEER > VIEWER`), audit logging, least-privilege IAM |
| Secrets (DB, JWT, AWS) | leakage through repo/logs | `.env` gitignored, GitHub Secrets, Kubernetes Secrets, AWS Secrets Manager |
| Data at rest/transit | interception, exposure | TLS at the edge, SSE on S3, encrypted EBS, restricted security groups |
| Supply chain | malicious dependency/image | lockfiles, `npm ci` in CI, GHCR images built from this repo, pinned base images |

## RBAC matrix

Roles are stored on `User.role` (`ADMIN`, `ENGINEER`, `VIEWER`) and enforced by
`requireRole(...)` in each route module. Hierarchy: `ADMIN` ⊃ `ENGINEER` ⊃ `VIEWER`.

| Area | Endpoint pattern | VIEWER | ENGINEER | ADMIN |
| --- | --- | --- | --- | --- |
| Auth (self) | `GET /api/auth/me`, `POST /api/auth/{logout,change-password}` | R/W self | R/W self | R/W self |
| Dashboard | `GET /api/dashboard/summary` | yes | yes | yes |
| Health | `GET /api/health` | yes | yes | yes |
| Users | `GET /api/users`, `GET /api/users/:id` | yes | yes | yes |
| Users | `PATCH /api/users/:id` | no | yes (name, role, isActive) | yes |
| Users | `GET /api/users/stats`, `POST /api/users`, `DELETE /api/users/:id` | no | no | yes |
| Resources | `GET /api/resources/**` | yes | yes | yes |
| Resources | `POST/PATCH /api/resources`, `POST /api/resources/:id/health` | no | yes | yes |
| Resources | `DELETE /api/resources/:id` | no | no | yes |
| Deployments | `GET /api/deployments/**` | yes | yes | yes |
| Deployments | `POST/PATCH /api/deployments`, `restart`, `scale` | no | yes | yes |
| Deployments | `DELETE /api/deployments/:id` | no | no | yes |
| Containers | `GET /api/containers/**` | yes | yes | yes |
| Containers | `start`, `stop`, `restart` | no | yes | yes |
| Containers | `DELETE /api/containers/:id` | no | no | yes |
| Kubernetes | `GET /api/kubernetes/**` | yes | yes | yes |
| Kubernetes | `POST /api/kubernetes/**` (register, scale, restart) | no | yes | yes |
| Kubernetes | `DELETE /api/kubernetes/clusters/:id` | no | no | yes |
| Metrics / Logs | `GET /api/metrics/**`, `GET /api/logs/**` | yes | yes | yes |
| Logs | `POST /api/logs` (ingest) | no | yes | yes |
| Alerts | `GET /api/alerts/**` | yes | yes | yes |
| Alerts | `POST/PATCH /api/alerts`, `acknowledge`, `resolve` | no | yes | yes |
| Alerts | `DELETE /api/alerts/:id` | no | no | yes |
| Incidents | `GET /api/incidents/**` | yes | yes | yes |
| Incidents | create/patch/assign/note/resolve/close | no | yes | yes |
| Incidents | `DELETE /api/incidents/:id` | no | no | yes |
| Costs | `GET /api/costs/**` | yes | yes | yes |
| Costs | `POST /api/costs/estimate` | no | yes | yes |
| Reports | `GET /api/reports/**` (incl. download) | yes | yes | yes |
| Reports | `POST /api/reports` | no | yes | yes |
| Reports | `DELETE /api/reports/:id` | no | no | yes |
| CI/CD | `GET /api/cicd/**` | yes | yes | yes |
| CI/CD | `POST /api/cicd/workflows`, `trigger` | no | yes | yes |
| CI/CD | `DELETE /api/cicd/workflows/:id` | no | no | yes |
| AWS | `GET /api/aws/**` | yes | yes | yes |
| AWS | `POST /api/aws/**` (accounts, sync, instance state) | no | yes | yes |
| AWS | `DELETE /api/aws/accounts/:id` | no | no | yes |

Rules of thumb:

- **VIEWER is read-only**: any `POST`/`PATCH`/`PUT`/`DELETE` outside
  `auth/change-password` and `auth/logout` returns `403 AUTHORIZATION_ERROR`.
- **ENGINEER mutates infrastructure but never identities**: no user creation or
  deletion, no destructive deletes.
- **ADMIN owns identity and destruction**: user management, deletions, role
  grants.

Additional controls:

- The first self-registered account becomes `ADMIN`; all later registrations are
  `VIEWER` and must be promoted by an `ADMIN`.
- Every mutating request is recorded in `AuditLog` (action, actor, resource,
  before/after values with sensitive fields redacted, IP, user agent).
- Account state matters: `isActive=false` blocks login and invalidates sessions.

## Secrets handling

### Application secrets

| Secret | Local dev | CI/CD | Kubernetes | AWS |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | `.env` (gitignored) | GitHub Secret `POSTGRES_PASSWORD` builds the URL | ConfigMap in dev / Secret in prod | SSM Parameter Store or Secrets Manager |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `.env` | GitHub Secrets `JWT_SECRET`, `JWT_REFRESH_SECRET` | Secret (see below) | Secrets Manager (`cloudops/*`) |
| `OPENSEARCH_PASSWORD` | `.env` | - | Secret | Secrets Manager |
| AWS credentials | `~/.aws` or env vars | GitHub Secrets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` | IRSA / instance role | instance profile (module `iam`) |
| SSH key for deploys | local key file | GitHub Secret `AWS_SSH_KEY` | - | - |

Practices:

- `.env` is gitignored; only `.env.example` (with placeholders) is committed.
  `scripts/setup.ps1` / `scripts/setup.sh` create `.env` automatically and never
  overwrite an existing one.
- Never commit real credentials, tokens, or PEM keys. The pre-commit hooks and
  CI should fail on `.env` and `*.pem` additions.
- Prefer file-based secrets in production (Docker/Kubernetes secrets) over
  environment variables where practical.
- Kubernetes: the repo ships plaintext values in `configmaps/api-config.yaml`
  for local clusters only. For production:

  ```bash
  kubectl -n cloudops create secret generic cloudops-secrets \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --from-literal=JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    --from-literal=DATABASE_URL="$DATABASE_URL"
  ```

  Then patch the deployments to add:

  ```yaml
  envFrom:
    - configMapRef: { name: api-config }   # non-sensitive
    - secretRef: { name: cloudops-secrets } # sensitive
  ```

- GitHub: store credentials as **repository/environment secrets**, scope them to
  the `production` environment, and restrict who can approve deployments.
- AWS: the `iam` module grants `secretsmanager:GetSecretValue` only on
  `arn:aws:secretsmanager:<region>:<account>:secret:cloudops/*`.
- Logs and audit entries redact `password`, `passwordHash`, `token`,
  `refreshToken`, `authorization` fields.

### Rotation schedule

| Item | Frequency | Procedure |
| --- | --- | --- |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | 90 days or on suspicion | update secret, restart API (all access+refresh tokens invalidated, users re-login) |
| Database password | 90 days | `ALTER ROLE cloudops WITH PASSWORD '...'`, update secret, rolling restart |
| AWS access keys | 90 days | create new key, update GitHub Secret, deactivate old key |
| SSH deploy key | 180 days | generate new key pair, update `AWS_SSH_KEY` secret and `authorized_keys` |
| Admin passwords | on staff change | `POST /api/auth/change-password` or ADMIN resets via user update |

## JWT rotation

Configuration (`.env`): `JWT_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`
(30d when login uses `rememberMe`), separate `JWT_SECRET` and
`JWT_REFRESH_SECRET`.

Lifecycle:

1. **Login/register** issues an access token (15 min) and a refresh token
   (7/30 days). Only the SHA hash of the refresh token is stored
   (`RefreshToken.tokenHash`), with `expiresAt`.
2. **Requests** carry `Authorization: Bearer <accessToken>`. Expired/invalid
   tokens return `401 AUTHENTICATION_ERROR`; there is no silent renewal.
3. **Refresh** (`POST /api/auth/refresh`) verifies the JWT signature, looks up
   the *unrevoked, unexpired* hash, **revokes the old token and issues a new
   pair** (one-time use - replay of a consumed token fails).
4. **Logout** revokes the presented refresh token, or all of the user's tokens
   when none is provided.
5. **Password change** revokes all refresh tokens in the same transaction as the
   hash update, forcing re-authentication everywhere.
6. **Compromise response**: rotate `JWT_SECRET`/`JWT_REFRESH_SECRET` - both token
   types become invalid immediately, since verification is symmetric HMAC.

Client guidance: store the access token in memory, the refresh token in a
`httpOnly; Secure; SameSite=Strict` cookie or secure storage, and refresh
proactively ~30 s before expiry.

## Rate limiting

Implemented with `express-rate-limit`, configured in `.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | sliding window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | max requests per client per window |

Behaviour:

- Responses carry `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
  (standard headers; `X-RateLimit-*` legacy headers disabled).
- Exceeding the limit returns `429`:
  ```json
  { "success": false, "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests" } }
  ```
- `trust proxy` is set to 1 so the limiter keys on the real client IP behind the
  nginx ingress / load balancer.
- Recommended production tightening: a stricter limiter for `/api/auth/*`
  (e.g. 10 attempts / 15 min per IP + per email) to blunt credential stuffing,
  while keeping the global limit for authenticated API traffic.

## Additional hardening

- **Transport**: terminate TLS at the ingress/load balancer and redirect HTTP to
  HTTPS in production (`nginx.ingress.kubernetes.io/ssl-redirect` is disabled
  for local `cloudops.local` only).
- **Headers**: `helmet` sets CSP (production), HSTS via proxy, `X-Content-Type-Options`,
  `X-Frame-Options`, referrer policy; COEP disabled for compatibility.
- **CORS**: single origin from `CORS_ORIGIN`, credentials enabled, only the
  methods/headers the app uses.
- **Input validation**: all bodies/queries pass Zod schemas before touching the
  database; body size limited to 10 MB.
- **Database**: parameterized queries via Prisma (no string concatenation),
  least-privilege application role (`cloudops`), migrations run by a separate
  higher-privileged role.
- **Containers**: API runs as non-root (`runAsUser: 1001`), Docker socket
  mounted read-only, image pulled from GHCR by digest/tag from this repository.
- **Host/infra**: security group exposes only 22/80/443 (restrict 22 to known
  CIDRs in `terraform.tfvars`), IMDSv2 required
  (`http_tokens = required`), EBS and S3 encrypted, S3 public access fully
  blocked.
- **Supply chain**: `npm ci` with committed lockfiles, pinned base images, CI
  runs lint/typecheck/test/build on every push and PR.
- **Monitoring of security signals**: watch for `AUTHENTICATION_ERROR` bursts
  (credential stuffing), `RATE_LIMIT_EXCEEDED` spikes, `AuditLog` entries with
  `success=false`, and unexpected role changes (`role` in `oldValues`/`newValues`).
