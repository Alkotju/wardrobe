# Multi-stage build:
#   deps  → installs prod node_modules in a throwaway layer
#   runner → copies only what's needed at runtime (no npm cache, no apt lists)
#
# node:20-slim (Debian) is used instead of alpine because
# @imgly/background-removal-node depends on ONNX runtime, which expects glibc.

FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# ca-certificates is needed for outbound HTTPS (yr.no, nominatim).
# PID-1 signal handling is provided by `init: true` in docker-compose (tini),
# so we no longer ship dumb-init.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000

CMD ["node", "server.js"]
