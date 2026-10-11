#!/usr/bin/env bash
#
# CloudOps Hub - POSIX/bash development environment setup.
#
# Usage:
#   ./scripts/setup.sh
#   ./scripts/setup.sh --skip-db
#   ./scripts/setup.sh --skip-docker
#
set -euo pipefail

SKIP_DB=0
SKIP_DOCKER=0
for arg in "$@"; do
  case "$arg" in
    --skip-db) SKIP_DB=1 ;;
    --skip-docker) SKIP_DOCKER=1 ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

step() { printf '\n==> %s\n' "$1"; }
ok()   { printf '    OK  %s\n' "$1"; }
warn() { printf '  WARN  %s\n' "$1" >&2; }
fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

echo ""
echo "CloudOps Hub - development setup"
echo "Working directory: $REPO_ROOT"

# 1) Toolchain checks --------------------------------------------------------
step "Checking toolchain"
command_exists node || fail "node is required but was not found on PATH"
command_exists npm  || fail "npm is required but was not found on PATH"

NODE_VERSION="$(node --version | sed 's/^v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
[ "$NODE_MAJOR" -ge 20 ] || fail "Node.js 20+ required, found $NODE_VERSION"
ok "node v$NODE_VERSION"
ok "npm $(npm --version)"

if [ "$SKIP_DOCKER" -eq 1 ]; then
  warn "Docker check skipped (--skip-docker)"
elif command_exists docker; then
  ok "docker $(docker --version | sed 's/^Docker version //')"
  if docker info >/dev/null 2>&1; then
    ok "docker daemon is running"
  else
    warn "Docker daemon is not reachable; 'npm run docker:up' will fail until it is started."
  fi
else
  warn "docker not found. Container workflows (docker compose) will be unavailable."
fi

# 2) Environment file --------------------------------------------------------
step "Preparing .env"
if [ -f .env ]; then
  ok ".env already exists - left untouched"
elif [ -f .env.example ]; then
  cp .env.example .env
  ok ".env created from .env.example"
else
  warn ".env.example not found - skipped"
fi

# 3) Dependencies ------------------------------------------------------------
step "Installing workspace dependencies (npm install)"
npm install
ok "dependencies installed"

# 4) Database ----------------------------------------------------------------
if [ "$SKIP_DB" -eq 1 ]; then
  warn "Database steps skipped (--skip-db)"
else
  step "Generating Prisma client"
  npm run db:generate
  ok "Prisma client generated"

  step "Pushing Prisma schema to the database"
  echo "    (start PostgreSQL first: docker compose up -d postgres)"
  if npm run db:push; then
    ok "schema pushed"
  else
    warn "prisma db push failed - is PostgreSQL running?"
  fi

  step "Seeding database"
  if npm run db:seed; then
    ok "database seeded"
  else
    warn "seed failed - continuing (it may not be implemented yet or the DB may be unreachable)"
  fi
fi

# 5) Summary -----------------------------------------------------------------
echo ""
echo "Setup finished."
echo ""
echo "Next steps:"
echo "  docker compose --profile full up -d   # postgres, redis + observability stack"
echo "  npm run dev                   # api (:4000) + web (:5173)"
echo "  ./scripts/smoke-test.sh       # verify the API"
echo ""
