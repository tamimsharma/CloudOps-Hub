# Incident Response Runbook

Operational guide for responding to CloudOps Hub alerts and incidents.
Severity levels, roles and statuses mirror the API (`docs/api.md`).

## Severity model

| Severity | Definition | Response time | Examples |
| --- | --- | --- | --- |
| SEV1 | Full outage or data loss risk | 5 minutes | API down, database unavailable, 5xx rate > 25% |
| SEV2 | Major degradation, no workaround | 15 minutes | Elevated error rate, dashboard outage, disk > 95% |
| SEV3 | Partial degradation with workaround | 1 business hour | Single node high CPU, slow queries, one failed replica |
| SEV4 | Minor/no user impact | Next business day | Cosmetic issues, non-critical warnings |

Roles: `ENGINEER` acknowledges/investigates, `ADMIN` closes and manages
communication. `VIEWER` may observe but not mutate.

## First 5 minutes (triage checklist)

1. **Acknowledge the alert** in the UI or API
   (`POST /api/alerts/:id/acknowledge`) so the team knows someone is on it.
2. **Open the dashboard** - Grafana `CloudOps Hub Overview` (CPU, memory, disk,
   network, request rate, error rate).
3. **Check scope** - `GET /api/dashboard/summary?range=1h`: is it one host, one
   service, or everything? Any recent deployments
   (`GET /api/deployments?status=FAILED`)?
4. **Create an incident** for SEV1/SEV2 (`POST /api/incidents`) with the alert
   linked, and set status `INVESTIGATING`.
5. **Note the timeline** - every action goes into incident notes
   (`POST /api/incidents/:id/notes`).

## Alert triage

### ApiDown / ApiHealthCheckFailing (critical)

Symptoms: `up{job="api"} == 0`, `/health` not responding, UI login failures.

1. `docker compose --profile app ps` or `kubectl -n cloudops get pods -l app.kubernetes.io/name=cloudops-api`
2. `docker compose --profile app logs --tail=200` or `kubectl -n cloudops logs deploy/api --tail=200`
   (in dev the API is a local process: restart `npm run dev`)
3. Check dependency health: `GET /api/health` (database/Prometheus/OpenSearch).
4. If the database is the cause, check `postgres` container health and
   `pg_isready -U cloudops -d cloudops_hub`.
5. Mitigations, in order of preference:
   - restart: `docker compose --profile app restart` / `kubectl rollout restart deployment/api -n cloudops`
   - rollback: deploy the previous image tag (`workflow_dispatch` on the last
     good SHA) / `kubectl rollout undo deployment/api -n cloudops`
   - scale: `POST /api/deployments/:id/scale {"replicas":4}`

### HighApiErrorRate / CriticalApiErrorRate (warning/critical)

Symptoms: 5xx ratio > 5% (warning) or > 25% (critical) for 5 minutes.

1. Identify the failing route: Grafana "Request Rate by Status" and
   `GET /api/logs?severity=ERROR&range=15m`.
2. Correlate with the last deployment: `GET /api/deployments?sortOrder=desc`.
3. Check traces/ids in log entries (`traceId`) and search OpenSearch:
   ```bash
   curl -s "http://localhost:9200/logs-*/_search" -H 'Content-Type: application/json' -d '{
     "size": 20,
     "sort": [{"timestamp": "desc"}],
     "query": {"bool": {"must": [{"match": {"severity": "ERROR"}}]}}
   }'
   ```
4. Mitigate: roll back the release, revert the config change, or scale out.

### HighCpuUsage / CriticalCpuUsage

1. Confirm on Grafana (CPU panel) and identify the process:
   `docker stats --no-stream` or `kubectl top pods -n cloudops`.
2. Check for traffic spikes: request rate panel; check for a runaway batch job.
3. Mitigate: scale out (`POST /api/deployments/:id/scale`), move load, or
   resize the instance (`terraform apply` with a larger `instance_type`).
4. If persistent, add capacity or tune limits (CPU requests/limits in the
   Kubernetes deployments).

### HighMemoryUsage / OutOfMemoryImminent / ContainerOOMKilled

1. Identify the container/pod: Grafana memory panel, `kubectl top pods`,
   `docker stats`.
2. Read the logs right before the OOM event (a memory leak often logs first).
3. Mitigate: restart the affected container, raise memory limits, then fix the
   leak (heap dumps / `--max-old-space-size` for Node).

### HighDiskUsage / DiskAlmostFull

1. Locate the mount: Grafana disk panel or `df -h`.
2. Usual culprits: log growth, Docker images/volumes, Prometheus TSDB, OpenSearch indices.
3. Quick relief:
   ```bash
   docker system prune -af                 # unused images/containers
   curl -X DELETE http://localhost:9200/logs-<old-date>   # old log indices
   ```
4. Long-term: enable/verify the ISM retention policy (14 days) and S3 lifecycle
   rules, expand the volume (`terraform apply` with a larger root volume).

### ContainerRestarting / ApiProcessRestarted (crash loop)

1. `kubectl -n cloudops describe pod <pod>` - check `Last State`, exit code,
   restart count; or `docker inspect --format '{{.State.ExitCode}}' <container>`.
2. Exit code 137 = OOM kill (see memory alerts), 1 = application error.
3. Read logs from the previous container:
   `kubectl -n cloudops logs <pod> --previous`.
4. Verify config (`api-config` ConfigMap / `.env`) and secrets after changes.
5. Roll back if the restarts started with a deploy.

## Log investigation

Order of investigation (cheapest first):

1. **API aggregated logs** - `GET /api/logs?severity=ERROR&range=15m&limit=50`
   with `search` for the failing component.
2. **OpenSearch raw logs** - OpenSearch Dashboards (`http://localhost:5601`),
   index pattern `logs-*`, useful fields: `severity`, `source`, `resourceId`,
   `traceId`, `spanId`.
3. **Container logs** -
   `docker compose logs --since 30m <service>` or
   `kubectl -n cloudops logs deploy/<name> --since=30m --tail=300`.
4. **Host logs** - `journalctl -u docker --since "30 minutes ago"`, and
   `/var/log/messages` on Amazon Linux.
5. **Audit trail** - `AuditLog` entries record who changed what
   (`action`, `resourceType`, `resourceId`, `oldValues`/`newValues`,
   `ipAddress`).

Correlating across services: use `X-Request-ID` (assigned by the API) in log
searches; `traceId`/`spanId` link API logs to the originating request.

## Escalation

| Stage | Trigger | Action |
| --- | --- | --- |
| 1 - On-call engineer | Any firing alert | Acknowledge, triage, work the checklist |
| 2 - Senior engineer | Not mitigated in 15 minutes, or SEV1 | Page the senior engineer, open a bridge/room |
| 3 - Engineering lead / Admin | Not mitigated in 30 minutes, or data-loss risk | ADMIN declares an incident, communicates status, may freeze deploys |
| 4 - External | Provider outage, security incident | Open a provider support case, notify stakeholders, preserve evidence |

Communication template (status updates every 15 minutes for SEV1/SEV2):

```
[SEV1] CloudOps API elevated error rate
Impact: dashboard and API requests failing for ~40% of users
Current action: rolling back release 1.4.2
Next update: 10:15 UTC
Incident: <id>
```

Do not post secrets, tokens, credentials or customer data in chat.

## Resolution and closure

1. Verify recovery: alerts green, `GET /api/health` healthy, error rate back to
   baseline for 15 minutes.
2. `POST /api/incidents/:id/resolve` with `rootCause` and `resolution`.
3. Link related alerts: alerts linked to the incident move to `RESOLVED`.
4. `POST /api/incidents/:id/close` (ADMIN) after the postmortem is scheduled.
5. Update runbooks/deployment docs if a procedure changed.

## Postmortem template

Create one for every SEV1/SEV2 within 48 hours of resolution.

```markdown
# Postmortem: <title>

- Incident ID: <uuid>
- Severity: SEV1 | SEV2
- Status: <OPEN | ... | CLOSED>
- Dates: detected <YYYY-MM-DD HH:MM UTC> / resolved <YYYY-MM-DD HH:MM UTC>
- Duration: <Xm / Xh>
- Author: <name>
- Participants: <names>

## Impact
- Users affected:
- Requests/errors during the window:
- Revenue or SLA impact:
- Data loss/corruption: none | describe

## Timeline (UTC)
- HH:MM - trigger event / alert fired
- HH:MM - acknowledged by <name>
- HH:MM - hypothesis and actions taken
- HH:MM - mitigation applied
- HH:MM - verified recovery

## Root cause
<technical explanation - what allowed this to happen>

## Contributing factors
- Detection gap:
- Process gap:
- Technical debt:

## What went well
-

## What went poorly
-

## Action items
| Action | Owner | Priority | Due | Tracking ID |
| --- | --- | --- | --- | --- |
| e.g. add disk usage alert at 80% | <name> | P1 | <date> | <ticket> |

## Lessons learned
<short summary shared with the wider team>
```

## Useful commands

```bash
# Compose stack
docker compose --profile app ps
docker compose --profile app logs -f --tail=200
docker compose --profile app restart

# Kubernetes
kubectl -n cloudops get pods
kubectl -n cloudops describe pod <pod>
kubectl -n cloudops logs deploy/api --tail=200
kubectl -n cloudops rollout status deploy/api
kubectl -n cloudops rollout undo deploy/api

# Prometheus / OpenSearch
curl -s 'http://localhost:9090/api/v1/rules' | head -c 2000
curl -s 'http://localhost:9090/api/v1/alerts'
curl -s 'http://localhost:9200/_cluster/health?pretty'

# API
curl -s http://localhost:4000/api/health
curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:4000/api/incidents?status=OPEN'
```
