# CloudOps Hub - single-image build.
#
# One image contains everything needed to run the platform:
#   * the Express API (also serves the built web UI - one URL, one container)
#   * the compiled React app (Vite production build)
#   * the Prisma client (schema is pushed on first start)
#
# Usage:  docker compose --profile app up --build     (or double-click START.bat)

# ---------------------------------------------------------------- build stage
FROM node:20-slim AS build

# Prisma needs the openssl CLI + libssl to pick the right query/schema engines
# (node:20-slim ships neither). Install before `npm ci` so the engines that get
# downloaded during install/generate match this runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Dependency layer first so it is cached until package.json/lock change.
# (`scripts/prepare.mjs` is included because npm runs it on `npm ci`; it is a
#  no-op here because the workspace sources are not copied yet.)
COPY package.json package-lock.json ./
COPY scripts/prepare.mjs scripts/prepare.mjs
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

# Sources, Prisma client, then the full monorepo build
# (shared packages + API tsc + web production bundle).
COPY . .
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build

# -------------------------------------------------------------- runtime stage
FROM node:20-slim AS runtime

# Same OpenSSL requirement as the build stage (Prisma schema/query engines).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

ENV NODE_ENV=production \
    PORT=4000 \
    SERVE_WEB=true \
    WEB_DIST_PATH=/repo/apps/web/dist

# Full node_modules (including devDependencies) is intentional: the entrypoint
# runs `prisma db push` and the TypeScript seed through tsx.
COPY --from=build /repo /repo

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "docker/entrypoint.sh"]
