# Infrastructure Inventory Report

Generated: 2026-10-07T09:20:05.244Z

| Name | Type | Provider | Environment | Status | Health |
| --- | --- | --- | --- | --- | --- |
| prod-web-01 | EC2_INSTANCE | AWS | production | RUNNING | HEALTHY |
| prod-api-01 | EC2_INSTANCE | AWS | production | RUNNING | HEALTHY |
| prod-worker-01 | EC2_INSTANCE | AWS | production | RUNNING | WARNING |
| staging-web-01 | EC2_INSTANCE | AWS | staging | RUNNING | HEALTHY |
| cloudops-postgres | DOCKER_CONTAINER | DOCKER | development | RUNNING | HEALTHY |
| cloudops-redis | DOCKER_CONTAINER | DOCKER | development | RUNNING | HEALTHY |
| cloudops-prometheus | DOCKER_CONTAINER | DOCKER | development | RUNNING | HEALTHY |
| cloudops-grafana | DOCKER_CONTAINER | DOCKER | development | RUNNING | WARNING |
| cloudops-opensearch | DOCKER_CONTAINER | DOCKER | development | RUNNING | HEALTHY |
| cloudops-prod-eks | KUBERNETES_CLUSTER | AWS | production | RUNNING | HEALTHY |
| cloudops-hub-artifacts | S3_BUCKET | AWS | production | RUNNING | HEALTHY |
| cloudops-hub-backups | S3_BUCKET | AWS | production | RUNNING | HEALTHY |
| cloudops-primary-db | DATABASE | AWS | production | RUNNING | HEALTHY |
| cloudops-public-nlb | LOAD_BALANCER | AWS | production | RUNNING | HEALTHY |
| cloudops-hub | APPLICATION | AWS | production | RUNNING | HEALTHY |
| legacy-batch-01 | EC2_INSTANCE | AWS | production | STOPPED | UNKNOWN |

**Totals:** 16 resources, 15 running, 2 needing attention.
