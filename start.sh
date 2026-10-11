#!/usr/bin/env bash
# CloudOps Hub - start with Docker (macOS / Linux)
#   usage:  bash start.sh
set -e
cd "$(dirname "$0")"

OPEN_URL="http://localhost:4000"

echo "============================================"
echo " CloudOps Hub - start with Docker"
echo "============================================"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed."
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

echo "Building and starting the platform (first run takes a few minutes)..."
if ! docker compose --profile app up --build -d; then
  echo ""
  echo "Port 4000 seems to be in use (npm run dev?) - trying port 8080 instead..."
  export APP_PORT=8080 APP_URL=http://localhost:8080
  OPEN_URL="http://localhost:8080"
  if ! docker compose --profile app up --build -d; then
    echo ""
    echo "[ERROR] docker compose failed - see the message above."
    echo "Ports 4000 and 8080 are both busy, or Docker needs more resources."
    exit 1
  fi
fi

echo -n "Waiting for the app to become ready"
for _ in $(seq 1 40); do
  if curl -fsS "$OPEN_URL/health" >/dev/null 2>&1; then
    echo ""
    echo "--------------------------------------------"
    echo " CloudOps Hub is running"
    echo "   Website:  $OPEN_URL"
    echo "   Stop it:  docker compose --profile app down"
    echo "--------------------------------------------"
    (command -v open >/dev/null 2>&1 && open "$OPEN_URL") ||
      (command -v xdg-open >/dev/null 2>&1 && xdg-open "$OPEN_URL") ||
      echo "Open $OPEN_URL in your browser."
    exit 0
  fi
  echo -n "."
  sleep 3
done

echo ""
echo "The container is still starting. Open $OPEN_URL in a moment,"
echo "or inspect it with:  docker compose --profile app logs"
