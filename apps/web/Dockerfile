# Build context must be the repository root (Bun workspaces):
#   docker build -f apps/web/Dockerfile .

# ---- Build stage -----------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# Manifests first: this layer (and the install below) is cached until a
# dependency changes. Every workspace manifest must be present for the
# frozen lockfile check to pass.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/cv-render/package.json packages/cv-render/
COPY packages/prompts/package.json packages/prompts/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: skip husky (`prepare`) and the web `postinstall`, which
# needs sources that are not copied yet. `nuxt build` prepares by itself.
RUN bun install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
RUN cd apps/web && bun --bun nuxt build
# Admin CLI (list users, reset a password) as one self-contained file, since the
# runtime image has no sources or node_modules: `docker compose exec web bun cli/user.js ...`
RUN bun build packages/db/src/user-cli.ts --target=bun --outfile=/app/cli/user.js

# ---- Runtime stage ---------------------------------------------------------
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle

# Only the self-contained Nitro bundle, the SQL migrations and the admin CLI.
COPY --from=build --chown=bun:bun /app/apps/web/.output ./.output
COPY --from=build --chown=bun:bun /app/packages/db/drizzle ./drizzle
COPY --from=build --chown=bun:bun /app/cli ./cli

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", ".output/server/index.mjs"]
