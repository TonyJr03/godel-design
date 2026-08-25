# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=godel-design-npm,target=/root/.npm,sharing=locked \
  npm ci \
    --no-audit \
    --no-fund \
    --fetch-retries=3 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=60000

FROM base AS builder
ARG NEXT_PUBLIC_SUPABASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node -e 'const name = "NEXT_PUBLIC_SUPABASE_URL"; if (!process.env[name]) { console.error(`Missing required public build configuration: ${name}`); process.exit(1); }'
ARG GODEL_PUBLIC_BUILD_NONCE
RUN --mount=type=secret,id=godel_supabase_publishable_key,required=true \
  if [ -z "$GODEL_PUBLIC_BUILD_NONCE" ]; then >&2 printf '%s\n' 'Missing required public build configuration: GODEL_PUBLIC_BUILD_NONCE'; exit 1; fi; \
  node -e 'const { execFileSync } = require("node:child_process"); const { readFileSync } = require("node:fs"); const name = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"; const value = readFileSync("/run/secrets/godel_supabase_publishable_key", "utf8"); if (!value) { console.error(`Missing required public build configuration: ${name}`); process.exit(1); } execFileSync("npm", ["run", "build"], { stdio: "inherit", env: { ...process.env, [name]: value } });'

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
STOPSIGNAL SIGTERM

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
RUN mkdir -p /app/.next/cache /tmp \
  && chown node:node /app/.next/cache \
  && chmod 1777 /tmp

USER node
EXPOSE 3000
CMD ["node", "server.js"]
