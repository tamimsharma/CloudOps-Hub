# API Reference

Base URL (local development): `http://localhost:4000`

All application endpoints are mounted under `/api`. Two unauthenticated
process-level endpoints exist outside the prefix: `GET /health` (liveness) and
`GET /ready` (readiness, verifies the database).

- Content type: `application/json`
- Timestamps: ISO 8601 UTC (`2026-01-15T09:30:00.000Z`)
- IDs: UUID v4 strings

## Response envelope

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Optional human readable message"
}
```

Paginated success responses add a `pagination` sibling:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  }
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  }
}
```

The `error` object always carries `code` and `message`, and may carry
`details` and the `requestId` echoed from the `X-Request-ID` header (use it when
reporting an issue - it links the response to server logs and `AuditLog`).

Validation errors include the failing fields:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "errors": ["email: Invalid email format", "password: Password must be at least 8 characters"]
    },
    "requestId": "b1c2d3e4-..."
  }
}
```

### Error codes

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Request body/query failed Zod validation |
| `BAD_REQUEST` | 400 | Malformed request |
| `AUTHENTICATION_ERROR` | 401 | Missing/invalid/expired token or bad credentials (message: `No token provided`, `Invalid token`, `Token has expired`, `Invalid credentials`) |
| `AUTHORIZATION_ERROR` | 403 | Authenticated but role is insufficient (message: `Required role: ADMIN or ENGINEER`) |
| `NOT_FOUND` | 404 | Resource or route does not exist |
| `CONFLICT` | 409 | Uniqueness violation handled by the API (e.g. duplicate email) |
| `DUPLICATE_ENTRY` | 409 | Database unique constraint violated (Prisma `P2002`) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests in the current window |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Downstream dependency (DB, Prometheus, ...) unavailable |

In production, non-operational errors are masked as `INTERNAL_ERROR` /
`Internal server error` so internal details never leak.

## Authentication

Send the access token on every protected request:

```
Authorization: Bearer <accessToken>
```

| Property | Value (default) |
| --- | --- |
| Access token lifetime | `JWT_EXPIRES_IN` = `15m` |
| Refresh token lifetime | `JWT_REFRESH_EXPIRES_IN` = `7d` (30d with `rememberMe`) |
| Refresh secret | `JWT_REFRESH_SECRET` (rotates independently) |
| Password hashing | bcrypt, `BCRYPT_ROUNDS` = 12 |

Tokens are returned in the login/register/refresh response `data`. When an
access token expires the API returns `401 AUTHENTICATION_ERROR`; call
`POST /api/auth/refresh` with the refresh token to obtain a new pair. Refresh
tokens are stored hashed and are revoked on logout, password change and refresh
(one-time use). See `docs/security.md`.

## Roles and permissions

Role hierarchy: `ADMIN > ENGINEER > VIEWER`.

| Capability | VIEWER | ENGINEER | ADMIN |
| --- | --- | --- | --- |
| Read dashboards, metrics, logs, inventory, alerts, incidents | yes | yes | yes |
| Create/update resources, deployments, containers ops, k8s ops | no | yes | yes |
| Acknowledge/resolve alerts, create/assign/resolve incidents | no | yes | yes |
| Trigger CI/CD workflows, estimate costs, generate reports | no | yes | yes |
| Create/update users, change roles | no | partial (update only) | yes |
| Delete users, resources, deployments, alerts, incidents | no | no | yes |

`VIEWER` attempting a mutating route returns `403 AUTHORIZATION_ERROR`.

## Pagination, sorting and filters

Query parameters accepted by every list endpoint:

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer >= 1 | `1` | page number |
| `limit` | integer 1..100 | `20` | page size |
| `sortBy` | string | module default | field name, e.g. `createdAt` |
| `sortOrder` | `asc` \| `desc` | `desc` | sort direction |

Common filters (applied when provided):

| Param | Used by | Example values |
| --- | --- | --- |
| `search` | users, resources, logs | free text |
| `type`, `provider`, `environment`, `region`, `status`, `health` | resources | `EC2_INSTANCE`, `aws`, `production`, `us-east-1`, `RUNNING`, `HEALTHY` |
| `status`, `resourceId` | deployments | `RUNNING`, UUID |
| `severity`, `source` | alerts, logs | `CRITICAL`, `prometheus` |
| `severity`, `status`, `assignedTo` | incidents | `SEV1`, `OPEN`, user UUID |
| `role`, `isActive` | users | `ADMIN`, `true` |
| `kind`, `namespace`, `clusterId` | kubernetes workloads | `Deployment`, `cloudops` |
| `range` | metrics, logs, costs, dashboard | `15m`, `1h`, `6h`, `24h`, `7d`, `30d` |
| `start`, `end` | metrics, logs, costs | ISO 8601 timestamps (override `range`) |

Example:

```http
GET /api/resources?page=2&limit=10&sortBy=createdAt&sortOrder=desc&type=EC2_INSTANCE&health=HEALTHY
```

## Rate limiting

Global limit: `RATE_LIMIT_MAX_REQUESTS` (100) requests per
`RATE_LIMIT_WINDOW_MS` (900000 ms = 15 min) per client. Responses include
`RateLimit-*` standard headers; exceeding the limit returns `429`:

```json
{
  "success": false,
  "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests" }
}
```

---

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | none | Process liveness (outside `/api`) |
| GET | `/ready` | none | Readiness, runs `SELECT 1` (outside `/api`) |
| GET | `/api/health` | none | Dependency health summary |

`GET /api/health` response:

```json
{
  "success": true,
  "data": {
    "status": "HEALTHY",
    "uptime": 5231,
    "checks": {
      "database": { "status": "HEALTHY", "latency": 3, "message": "database is healthy" },
      "prometheus": { "status": "HEALTHY", "latency": 12, "message": "prometheus is healthy" },
      "opensearch": { "status": "WARNING", "latency": 0, "message": "opensearch check failed: timeout" }
    },
    "overall": "HEALTHY",
    "timestamp": "2026-01-15T09:30:00.000Z"
  }
}
```

## Dashboard

| Method | Path | Auth | Query |
| --- | --- | --- | --- |
| GET | `/api/dashboard/summary` | any role | `range` (`15m`..`30d`), `environment?` |

```json
{
  "success": true,
  "data": {
    "resources": { "total": 42, "healthy": 35, "warning": 4, "degraded": 2, "critical": 1, "byType": { "EC2_INSTANCE": 8, "KUBERNETES_POD": 24 } },
    "alerts": { "firing": 3, "acknowledged": 1, "resolved": 12, "bySeverity": { "CRITICAL": 1, "WARNING": 2, "INFO": 1 } },
    "incidents": { "open": 1, "investigating": 1, "resolved": 7, "bySeverity": { "SEV1": 0, "SEV2": 1, "SEV3": 1, "SEV4": 0 } },
    "deployments": { "total": 58, "running": 12, "failed": 2, "last24h": 4 },
    "requestRate": 34.2,
    "errorRate": 0.013,
    "recentActivity": [
      { "type": "DEPLOYMENT", "id": "2f0c8e1a-...", "title": "api v1.4.2 deployed", "at": "2026-01-15T09:12:00.000Z" },
      { "type": "ALERT", "id": "77b1f9d0-...", "title": "HighCpuUsage on node-1", "at": "2026-01-15T08:55:00.000Z" }
    ],
    "range": "24h"
  }
}
```

## Auth

All auth endpoints except register/login/refresh require
`Authorization: Bearer <accessToken>`.

| Method | Path | Auth | Body |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | none | `email`, `name`, `password` |
| POST | `/api/auth/login` | none | `email`, `password`, `rememberMe?` |
| POST | `/api/auth/refresh` | none | `refreshToken` |
| POST | `/api/auth/logout` | bearer | `refreshToken?` |
| POST | `/api/auth/change-password` | bearer | `currentPassword`, `newPassword` |
| GET | `/api/auth/me` | bearer | - |

`password` requirements: 8-128 chars with at least one uppercase, one
lowercase, one digit and one special character. The **first registered user is
granted `ADMIN`**; every subsequent user is `VIEWER`.

### POST /api/auth/register

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"Platform Admin","password":"Str0ng!Passw0rd"}'
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "b3f1c2d4-...", "email": "you@example.com", "name": "Platform Admin", "role": "ADMIN", "createdAt": "2026-01-15T09:00:00.000Z" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Registration successful"
}
```

### POST /api/auth/login

```json
{ "email": "you@example.com", "password": "Str0ng!Passw0rd", "rememberMe": true }
```

`200 OK`:

```json
{
  "success": true,
  "data": {
    "user": { "id": "b3f1c2d4-...", "email": "you@example.com", "name": "Platform Admin", "role": "ADMIN" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Login successful"
}
```

Wrong credentials return `401`:

```json
{ "success": false, "error": { "code": "AUTHENTICATION_ERROR", "message": "Invalid credentials" } }
```

### POST /api/auth/refresh

Body: `{ "refreshToken": "<refreshToken>" }`

```json
{
  "success": true,
  "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." },
  "message": "Tokens refreshed"
}
```

Revoked/expired refresh tokens return `401 AUTHENTICATION_ERROR`.

### POST /api/auth/logout

Body: `{ "refreshToken": "<refreshToken>" }` (omitting it revokes **all**
refresh tokens of the user).

```json
{ "success": true, "message": "Logout successful" }
```

### POST /api/auth/change-password

```json
{
  "success": true,
  "message": "Password changed successfully. Please log in again."
}
```

All refresh tokens are revoked; the client must log in again.

### GET /api/auth/me

```json
{
  "success": true,
  "data": {
    "id": "b3f1c2d4-...",
    "email": "you@example.com",
    "name": "Platform Admin",
    "role": "ADMIN",
    "isActive": true,
    "lastLoginAt": "2026-01-15T09:20:00.000Z",
    "createdAt": "2026-01-15T09:00:00.000Z"
  }
}
```

## Users

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/users` | any | `page`, `limit`, `sortBy`, `sortOrder`, `role`, `isActive`, `search` |
| GET | `/api/users/stats` | ADMIN | - |
| GET | `/api/users/:id` | any | - |
| POST | `/api/users` | ADMIN | body: `email`, `name`, `password`, `role` |
| PATCH | `/api/users/:id` | ADMIN, ENGINEER | body: `name?`, `role?`, `isActive?` |
| DELETE | `/api/users/:id` | ADMIN | - |

### GET /api/users

```json
{
  "success": true,
  "data": [
    { "id": "b3f1c2d4-...", "email": "platform-admin@example.com", "name": "Platform Admin", "role": "ADMIN", "isActive": true, "lastLoginAt": "2026-01-15T09:20:00.000Z", "createdAt": "2026-01-15T09:00:00.000Z" },
    { "id": "9a2e77bc-...", "email": "read-only@example.com", "name": "Read Only", "role": "VIEWER", "isActive": true, "lastLoginAt": null, "createdAt": "2026-01-15T09:05:00.000Z" }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### GET /api/users/stats

```json
{
  "success": true,
  "data": { "total": 5, "active": 4, "byRole": { "ADMIN": 1, "ENGINEER": 2, "VIEWER": 2 }, "inactive": 1 }
}
```

### POST /api/users

```json
{
  "success": true,
  "data": { "id": "9a2e77bc-...", "email": "read-only@example.com", "name": "Read Only", "role": "VIEWER", "isActive": true, "createdAt": "2026-01-15T09:05:00.000Z" },
  "message": "User created successfully"
}
```

Duplicate email returns `409 CONFLICT`.

### PATCH /api/users/:id

```json
{ "success": true, "data": { "id": "9a2e77bc-...", "role": "ENGINEER" }, "message": "User updated successfully" }
```

### DELETE /api/users/:id

```json
{ "success": true, "message": "User deleted successfully" }
```

Notes: deleting your own account returns `400 VALIDATION_ERROR`
("Cannot delete your own account"), and an `ADMIN` cannot demote themselves
("Cannot demote yourself from ADMIN role"). Passwords must satisfy the shared
policy (8-128 chars, upper/lower/digit/special).

## Resources

Inventory of managed infrastructure (cloud and container objects).

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/resources` | any | pagination + `type`, `provider`, `environment`, `region`, `status`, `health`, `search` |
| GET | `/api/resources/stats` | any | - |
| GET | `/api/resources/health` | any | - |
| GET | `/api/resources/:id` | any | - |
| POST | `/api/resources` | ENGINEER, ADMIN | body below |
| PATCH | `/api/resources/:id` | ENGINEER, ADMIN | partial body |
| DELETE | `/api/resources/:id` | ADMIN | - |
| POST | `/api/resources/:id/health` | ENGINEER, ADMIN | body: `health`, `cpuUsage?`, `memoryUsage?` |

Create body:

```json
{
  "name": "web-prod-1",
  "type": "EC2_INSTANCE",
  "provider": "aws",
  "environment": "production",
  "region": "us-east-1",
  "status": "RUNNING",
  "health": "HEALTHY",
  "cpuUsage": 42.5,
  "memoryUsage": 61.2,
  "diskUsage": 35.0,
  "networkIn": 1048576,
  "networkOut": 2097152,
  "tags": { "team": "platform" },
  "metadata": { "instanceType": "t3.medium" }
}
```

### GET /api/resources

```json
{
  "success": true,
  "data": [
    {
      "id": "5d8a21f0-...",
      "name": "web-prod-1",
      "type": "EC2_INSTANCE",
      "provider": "aws",
      "environment": "production",
      "region": "us-east-1",
      "status": "RUNNING",
      "health": "HEALTHY",
      "cpuUsage": 42.5,
      "memoryUsage": 61.2,
      "diskUsage": 35.0,
      "networkIn": 1048576,
      "networkOut": 2097152,
      "tags": { "team": "platform" },
      "metadata": {},
      "lastHealthCheckAt": "2026-01-15T09:25:00.000Z",
      "createdAt": "2026-01-14T11:00:00.000Z",
      "updatedAt": "2026-01-15T09:25:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNext": true, "hasPrev": false }
}
```

### GET /api/resources/stats

```json
{
  "success": true,
  "data": {
    "total": 42,
    "byStatus": { "RUNNING": 36, "STOPPED": 4, "ERROR": 1, "PENDING": 1, "UNKNOWN": 0 },
    "byHealth": { "HEALTHY": 35, "WARNING": 4, "DEGRADED": 2, "CRITICAL": 1, "UNKNOWN": 0 },
    "byProvider": { "aws": 28, "docker": 10, "kubernetes": 4 },
    "byEnvironment": { "production": 20, "staging": 12, "development": 10 }
  }
}
```

### GET /api/resources/health

```json
{
  "success": true,
  "data": {
    "overall": "WARNING",
    "critical": 1,
    "degraded": 2,
    "warning": 4,
    "healthy": 35,
    "unhealthyResources": [{ "id": "5d8a21f0-...", "name": "db-prod-1", "health": "CRITICAL", "cpuUsage": 97.2 }]
  }
}
```

### POST /api/resources/:id/health

```json
{ "health": "DEGRADED", "cpuUsage": 91.4, "memoryUsage": 88.0 }
```

Response:

```json
{ "success": true, "data": { "id": "5d8a21f0-...", "health": "DEGRADED", "cpuUsage": 91.4 }, "message": "Resource health updated successfully" }
```

## Deployments

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/deployments` | any | pagination + `status`, `resourceId` |
| GET | `/api/deployments/stats` | any | - |
| GET | `/api/deployments/:id` | any | - |
| GET | `/api/deployments/:id/logs` | any | `tail` (lines, default 100) |
| POST | `/api/deployments` | ENGINEER, ADMIN | body below |
| PATCH | `/api/deployments/:id` | ENGINEER, ADMIN | partial body |
| DELETE | `/api/deployments/:id` | ADMIN | - |
| POST | `/api/deployments/:id/restart` | ENGINEER, ADMIN | - |
| POST | `/api/deployments/:id/scale` | ENGINEER, ADMIN | body: `replicas` (1..100) |

Create body:

```json
{
  "name": "cloudops-api",
  "image": "ghcr.io/cloudops-hub/cloudops-api",
  "tag": "1.4.2",
  "port": 4000,
  "environmentVariables": { "NODE_ENV": "production" },
  "cpuLimit": "500m",
  "memoryLimit": "512Mi",
  "replicas": 2,
  "resourceId": "5d8a21f0-..."
}
```

### POST /api/deployments

`201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "c1a2b3d4-...",
    "name": "cloudops-api",
    "image": "ghcr.io/cloudops-hub/cloudops-api",
    "tag": "1.4.2",
    "port": 4000,
    "replicas": 2,
    "cpuLimit": "500m",
    "memoryLimit": "512Mi",
    "status": "PENDING",
    "deployedBy": "b3f1c2d4-...",
    "createdAt": "2026-01-15T09:30:00.000Z"
  },
  "message": "Deployment created successfully"
}
```

### GET /api/deployments/stats

```json
{
  "success": true,
  "data": { "total": 58, "byStatus": { "RUNNING": 12, "FAILED": 2, "STOPPED": 44 }, "last24h": 4, "successRate": 0.96 }
}
```

### POST /api/deployments/:id/scale

```json
{ "replicas": 4 }
```

```json
{ "success": true, "data": { "id": "c1a2b3d4-...", "replicas": 4, "status": "DEPLOYING" }, "message": "Deployment updated successfully" }
```

## Containers

Docker container management (requires `DOCKER_HOST`, typically
`unix:///var/run/docker.sock` mounted read-only).

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/containers` | any | pagination + `status`, `name` |
| GET | `/api/containers/health` | any | - |
| GET | `/api/containers/:id` | any | container id or name |
| GET | `/api/containers/:id/logs` | any | `tail`, `since` |
| GET | `/api/containers/:id/stats` | any | `stream=false` |
| POST | `/api/containers/:id/start` | ENGINEER, ADMIN | - |
| POST | `/api/containers/:id/stop` | ENGINEER, ADMIN | - |
| POST | `/api/containers/:id/restart` | ENGINEER, ADMIN | - |
| DELETE | `/api/containers/:id` | ADMIN | - |

### GET /api/containers

```json
{
  "success": true,
  "data": [
    {
      "id": "9f2e1c3a7b...",
      "name": "cloudops-api",
      "image": "ghcr.io/cloudops-hub/cloudops-api:latest",
      "state": "running",
      "status": "Up 3 hours",
      "ports": [{ "privatePort": 4000, "publicPort": 4000, "type": "tcp" }],
      "createdAt": "2026-01-15T06:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### GET /api/containers/:id/stats

```json
{
  "success": true,
  "data": {
    "cpuPercent": 12.4,
    "memoryUsage": 134217728,
    "memoryLimit": 536870912,
    "memoryPercent": 25.0,
    "networkIn": 10485760,
    "networkOut": 5242880,
    "blockRead": 2097152,
    "blockWrite": 1048576
  }
}
```

### GET /api/containers/:id/logs

```json
{
  "success": true,
  "data": {
    "containerId": "9f2e1c3a7b...",
    "tail": 100,
    "lines": ["2026-01-15T09:30:01Z INFO  CloudOps Hub API running on port 4000 in development mode"]
  }
}
```

## Kubernetes

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/kubernetes/clusters` | any | pagination + `provider`, `region`, `status` |
| GET | `/api/kubernetes/clusters/:id` | any | - |
| POST | `/api/kubernetes/clusters` | ENGINEER, ADMIN | body: `name`, `provider`, `region`, `version`, `endpoint` |
| DELETE | `/api/kubernetes/clusters/:id` | ADMIN | - |
| GET | `/api/kubernetes/workloads` | any | `clusterId`, `namespace`, `kind`, pagination |
| GET | `/api/kubernetes/workloads/:id` | any | - |
| POST | `/api/kubernetes/workloads/:id/scale` | ENGINEER, ADMIN | body: `replicas` |
| POST | `/api/kubernetes/workloads/:id/restart` | ENGINEER, ADMIN | - |

### GET /api/kubernetes/clusters

```json
{
  "success": true,
  "data": [
    {
      "id": "7a1b2c3d-...",
      "name": "cloudops-prod",
      "provider": "aws",
      "region": "us-east-1",
      "version": "1.29",
      "status": "RUNNING",
      "health": "HEALTHY",
      "nodeCount": 3,
      "cpuCapacity": 24,
      "memoryCapacity": 98304,
      "endpoint": "https://ABCDEF.gr7.us-east-1.eks.amazonaws.com",
      "createdAt": "2026-01-10T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### GET /api/kubernetes/workloads

```json
{
  "success": true,
  "data": [
    {
      "id": "3c9d8e7f-...",
      "clusterId": "7a1b2c3d-...",
      "namespace": "cloudops",
      "name": "api",
      "kind": "Deployment",
      "desiredReplicas": 2,
      "availableReplicas": 2,
      "readyReplicas": 2,
      "cpuUsage": 0.42,
      "memoryUsage": 312,
      "restartCount": 0,
      "status": "RUNNING",
      "health": "HEALTHY",
      "labels": { "app.kubernetes.io/name": "cloudops-api" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 6, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

## Metrics

Read-only proxy over Prometheus (requires `PROMETHEUS_URL`).

| Method | Path | Auth | Params |
| --- | --- | --- | --- |
| GET | `/api/metrics/query` | any | `query` (PromQL, required), `time?` |
| GET | `/api/metrics/range` | any | `query`, `start`, `end`, `step?` |
| GET | `/api/metrics/resource/:resourceId` | any | `metric` = `cpu`\|`memory`\|`disk`\|`network`, `range` |
| GET | `/api/metrics/summary` | any | `range` |

### GET /api/metrics/query?query=up

```json
{
  "success": true,
  "data": {
    "query": "up",
    "resultType": "vector",
    "result": [
      { "metric": { "job": "api", "instance": "api:4000" }, "value": [1768469401.234, "1"] }
    ]
  }
}
```

### GET /api/metrics/resource/5d8a21f0-...?metric=cpu&range=1h

```json
{
  "success": true,
  "data": {
    "resourceId": "5d8a21f0-...",
    "metric": "cpu",
    "unit": "percent",
    "range": "1h",
    "values": [
      { "timestamp": "2026-01-15T08:35:00.000Z", "value": 38.2 },
      { "timestamp": "2026-01-15T09:30:00.000Z", "value": 42.5 }
    ]
  }
}
```

### GET /api/metrics/summary?range=24h

```json
{
  "success": true,
  "data": {
    "range": "24h",
    "cpu": { "avg": 41.2, "max": 93.1, "p95": 78.4 },
    "memory": { "avg": 58.9, "max": 88.0, "p95": 81.2 },
    "disk": { "avg": 34.0, "max": 35.5, "p95": 35.2 },
    "network": { "inBytesPerSec": 1048576, "outBytesPerSec": 524288 }
  }
}
```

If Prometheus is unreachable: `503 SERVICE_UNAVAILABLE`.

## Logs

Log search backed by OpenSearch (requires `OPENSEARCH_URL`).

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/logs` | any | pagination + `severity`, `source`, `resourceId`, `search`, `range`/`start`,`end` |
| GET | `/api/logs/stats` | any | `range` |
| GET | `/api/logs/:id` | any | - |
| POST | `/api/logs` | ENGINEER, ADMIN | body: `severity`, `source`, `message`, `resourceId?`, `fields?`, `traceId?`, `spanId?` |

### GET /api/logs?severity=ERROR&range=1h&limit=5

```json
{
  "success": true,
  "data": [
    {
      "id": "e1f2a3b4-...",
      "timestamp": "2026-01-15T09:12:44.000Z",
      "severity": "ERROR",
      "source": "api",
      "resourceId": null,
      "message": "Failed to refresh metrics from Prometheus",
      "fields": { "component": "metrics", "status": 503 },
      "traceId": "8b1f6d9a...",
      "spanId": "c93a1b2f..."
    }
  ],
  "pagination": { "page": 1, "limit": 5, "total": 23, "totalPages": 5, "hasNext": true, "hasPrev": false }
}
```

### GET /api/logs/stats?range=24h

```json
{
  "success": true,
  "data": {
    "range": "24h",
    "total": 4821,
    "bySeverity": { "DEBUG": 1200, "INFO": 3100, "WARN": 420, "ERROR": 98, "FATAL": 3 },
    "bySource": { "api": 3500, "web": 900, "postgres": 421 }
  }
}
```

## Alerts

Alerts originate from Prometheus rules (via webhook/sync) or manual creation.

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/alerts` | any | pagination + `severity`, `status`, `source`, `resourceId` |
| GET | `/api/alerts/stats` | any | - |
| GET | `/api/alerts/:id` | any | - |
| POST | `/api/alerts` | ENGINEER, ADMIN | body: `title`, `description`, `severity`, `source`, `resourceId?` |
| PATCH | `/api/alerts/:id` | ENGINEER, ADMIN | partial body |
| POST | `/api/alerts/:id/acknowledge` | ENGINEER, ADMIN | - |
| POST | `/api/alerts/:id/resolve` | ENGINEER, ADMIN | - |
| DELETE | `/api/alerts/:id` | ADMIN | - |

### GET /api/alerts?status=FIRING&severity=CRITICAL

```json
{
  "success": true,
  "data": [
    {
      "id": "aa11bb22-...",
      "title": "HighCpuUsage on node-1",
      "description": "CPU usage is 91.4% for the last 10 minutes (threshold 85%).",
      "severity": "CRITICAL",
      "source": "prometheus",
      "resourceId": "5d8a21f0-...",
      "status": "FIRING",
      "acknowledgedBy": null,
      "resolvedBy": null,
      "metadata": { "rule": "HighCpuUsage", "instance": "node-1" },
      "createdAt": "2026-01-15T08:55:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### POST /api/alerts/:id/acknowledge

```json
{ "success": true, "data": { "id": "aa11bb22-...", "status": "ACKNOWLEDGED", "acknowledgedBy": "b3f1c2d4-...", "acknowledgedAt": "2026-01-15T09:00:00.000Z" }, "message": "Alert acknowledged" }
```

### POST /api/alerts/:id/resolve

```json
{ "success": true, "data": { "id": "aa11bb22-...", "status": "RESOLVED", "resolvedBy": "b3f1c2d4-...", "resolvedAt": "2026-01-15T09:20:00.000Z" }, "message": "Alert resolved" }
```

## Incidents

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/incidents` | any | pagination + `severity`, `status`, `assignedTo` |
| GET | `/api/incidents/stats` | any | - |
| GET | `/api/incidents/:id` | any | includes `timeline` and `notes` |
| POST | `/api/incidents` | ENGINEER, ADMIN | body: `title`, `description`, `severity`, `affectedResourceId?` |
| PATCH | `/api/incidents/:id` | ENGINEER, ADMIN | partial body |
| POST | `/api/incidents/:id/acknowledge` | ENGINEER, ADMIN | - |
| POST | `/api/incidents/:id/assign` | ENGINEER, ADMIN | body: `userId` |
| POST | `/api/incidents/:id/notes` | ENGINEER, ADMIN | body: `content` |
| POST | `/api/incidents/:id/resolve` | ENGINEER, ADMIN | body: `rootCause`, `resolution` |
| POST | `/api/incidents/:id/close` | ENGINEER, ADMIN | - |
| DELETE | `/api/incidents/:id` | ADMIN | - |

### POST /api/incidents

```json
{
  "title": "API elevated error rate",
  "description": "5xx rate above 25% for 5 minutes after release 1.4.2",
  "severity": "SEV1",
  "affectedResourceId": "5d8a21f0-..."
}
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "f0e1d2c3-...",
    "title": "API elevated error rate",
    "severity": "SEV1",
    "status": "OPEN",
    "assignedTo": null,
    "rootCause": null,
    "resolution": null,
    "createdAt": "2026-01-15T09:31:00.000Z"
  },
  "message": "Incident created successfully"
}
```

### GET /api/incidents/:id

```json
{
  "success": true,
  "data": {
    "id": "f0e1d2c3-...",
    "title": "API elevated error rate",
    "severity": "SEV1",
    "status": "INVESTIGATING",
    "assignedTo": "9a2e77bc-...",
    "alerts": [{ "id": "aa11bb22-...", "title": "HighApiErrorRate", "severity": "CRITICAL" }],
    "timeline": [
      { "type": "CREATED", "description": "Incident created", "createdAt": "2026-01-15T09:31:00.000Z" },
      { "type": "ACKNOWLEDGED", "description": "Acknowledged by Platform Admin", "createdAt": "2026-01-15T09:32:00.000Z" },
      { "type": "STATUS_CHANGED", "description": "Status changed to INVESTIGATING", "createdAt": "2026-01-15T09:33:00.000Z" }
    ],
    "notes": [{ "id": "11223344-...", "userId": "b3f1c2d4-...", "content": "Rolled back to 1.4.1", "createdAt": "2026-01-15T09:35:00.000Z" }]
  }
}
```

### POST /api/incidents/:id/resolve

```json
{ "rootCause": "Bad database migration in 1.4.2", "resolution": "Rolled back to 1.4.1 and reverted the migration" }
```

```json
{ "success": true, "data": { "id": "f0e1d2c3-...", "status": "RESOLVED", "resolvedAt": "2026-01-15T09:45:00.000Z" }, "message": "Incident resolved" }
```

## Costs

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/costs` | any | pagination + `provider`, `resourceId`, `service`, `range` |
| GET | `/api/costs/summary` | any | `range`, `provider?`, `groupBy?` (`service`\|`resource`\|`environment`) |
| GET | `/api/costs/forecast` | any | `days` (default 30) |
| GET | `/api/costs/resource/:resourceId` | any | - |
| POST | `/api/costs/estimate` | ENGINEER, ADMIN | body: `resourceId`, `service`, `dailyCost`, `monthlyCost`, `assumptions?` |

### GET /api/costs/summary?range=30d

```json
{
  "success": true,
  "data": {
    "range": "30d",
    "currency": "USD",
    "totalDaily": 18.42,
    "totalMonthly": 552.6,
    "byService": [
      { "service": "EC2", "monthly": 312.4 },
      { "service": "RDS", "monthly": 148.2 },
      { "service": "S3", "monthly": 32.0 },
      { "service": "CloudFront", "monthly": 60.0 }
    ],
    "byEnvironment": [
      { "environment": "production", "monthly": 431.8 },
      { "environment": "staging", "monthly": 120.8 }
    ],
    "trend": -0.04
  }
}
```

### GET /api/costs/forecast?days=30

```json
{
  "success": true,
  "data": { "days": 30, "currency": "USD", "forecast": 566.1, "confidence": 0.87, "assumptions": ["current usage pattern continues", "no new resources"] }
}
```

## Reports

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/reports` | any | pagination + `type`, `status` |
| GET | `/api/reports/:id` | any | - |
| GET | `/api/reports/:id/download` | any | - (binary/redirect) |
| POST | `/api/reports` | ENGINEER, ADMIN | body: `name`, `type`, `parameters?` |
| DELETE | `/api/reports/:id` | ADMIN | - |

`type` is one of `INVENTORY`, `COST_ANALYSIS`, `INCIDENT_SUMMARY`,
`DEPLOYMENT_HISTORY`, `HEALTH_REPORT`, `COMPLIANCE`.

### POST /api/reports

```json
{ "name": "January cost analysis", "type": "COST_ANALYSIS", "parameters": { "range": "30d", "groupBy": "service" } }
```

```json
{
  "success": true,
  "data": {
    "id": "44556677-...",
    "name": "January cost analysis",
    "type": "COST_ANALYSIS",
    "status": "PENDING",
    "generatedBy": "b3f1c2d4-...",
    "fileUrl": null,
    "createdAt": "2026-01-15T09:40:00.000Z"
  },
  "message": "Report queued successfully"
}
```

### GET /api/reports/:id

```json
{
  "success": true,
  "data": {
    "id": "44556677-...",
    "status": "COMPLETED",
    "fileUrl": "/api/reports/44556677-.../download",
    "completedAt": "2026-01-15T09:41:12.000Z",
    "errorMessage": null
  }
}
```

## CI/CD

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/cicd/workflows` | any | pagination + `status`, `repository`, `branch` |
| GET | `/api/cicd/workflows/:id` | any | includes recent `runs` |
| POST | `/api/cicd/workflows` | ENGINEER, ADMIN | body: `name`, `repository`, `branch`, `trigger` |
| POST | `/api/cicd/workflows/:id/trigger` | ENGINEER, ADMIN | - |
| DELETE | `/api/cicd/workflows/:id` | ADMIN | - |
| GET | `/api/cicd/runs` | any | pagination + `workflowId`, `status`, `branch` |
| GET | `/api/cicd/runs/:id` | any | includes `jobs` -> `steps` |
| POST | `/api/cicd/webhooks/github` | HMAC signature | raw GitHub webhook payload |

### GET /api/cicd/runs/12345

```json
{
  "success": true,
  "data": {
    "id": "99887766-...",
    "workflowId": "11223344-...",
    "runNumber": 42,
    "trigger": "PUSH",
    "branch": "main",
    "commitSha": "0a1b2c3d4e5f...",
    "status": "SUCCESS",
    "startedAt": "2026-01-15T08:00:00.000Z",
    "completedAt": "2026-01-15T08:04:31.000Z",
    "duration": 271,
    "url": "https://github.com/cloudops-hub/cloudops/actions/runs/12345",
    "jobs": [
      {
        "id": "aa00bb11-...",
        "name": "build",
        "status": "SUCCESS",
        "steps": [{ "name": "npm run build", "status": "SUCCESS", "duration": 42 }]
      }
    ]
  }
}
```

## AWS

Cloud account registration and AWS resource operations (requires AWS
credentials in the environment and `ENABLE_AWS_INTEGRATION=true`).

| Method | Path | Role | Params |
| --- | --- | --- | --- |
| GET | `/api/aws/accounts` | any | - |
| POST | `/api/aws/accounts` | ENGINEER, ADMIN | body: `name`, `accountId`, `region`, `credentialsRef` |
| POST | `/api/aws/accounts/:id/sync` | ENGINEER, ADMIN | - |
| DELETE | `/api/aws/accounts/:id` | ADMIN | - |
| GET | `/api/aws/resources` | any | `accountId?`, `service?`, pagination |
| POST | `/api/aws/resources/:instanceId/state` | ENGINEER, ADMIN | body: `action` = `start`\|`stop`\|`reboot` |

### GET /api/aws/accounts

```json
{
  "success": true,
  "data": [
    {
      "id": "66778899-...",
      "name": "production",
      "provider": "AWS",
      "accountId": "123456789012",
      "region": "us-east-1",
      "credentialsRef": "secretsmanager:cloudops/prod-credentials",
      "status": "CONNECTED",
      "lastSyncedAt": "2026-01-15T09:00:00.000Z",
      "errorMessage": null
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### GET /api/aws/resources?service=ec2

```json
{
  "success": true,
  "data": [
    {
      "instanceId": "i-0abc1234",
      "name": "web-prod-1",
      "state": "running",
      "instanceType": "t3.medium",
      "region": "us-east-1",
      "publicIp": "54.12.34.56",
      "privateIp": "10.0.1.20",
      "tags": { "team": "platform" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

### POST /api/aws/resources/i-0abc1234/state

```json
{ "action": "stop" }
```

```json
{ "success": true, "data": { "instanceId": "i-0abc1234", "state": "stopping" }, "message": "Instance stop requested" }
```

---

## Quick curl session

```bash
BASE=http://localhost:4000

# 1. register (the first account becomes ADMIN) and log in
curl -s -X POST $BASE/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"Platform Admin","password":"Str0ng!Passw0rd"}'

TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Str0ng!Passw0rd"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

# 2. authenticated calls
curl -s -H "Authorization: Bearer $TOKEN" $BASE/api/auth/me
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/resources?page=1&limit=5"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/alerts?status=FIRING"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/dashboard/summary?range=24h"

# 3. logout
curl -s -X POST $BASE/api/auth/logout \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```
