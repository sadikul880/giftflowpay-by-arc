# syntax=docker/dockerfile:1

# Vite runs on Node, not the Bun runtime: it needs far less memory. Bun is only the package installer.
# The heap cap makes a too-small server fail fast instead of swapping for 30 minutes (exit code 137).
FROM node:22-slim AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=1280
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Vite inlines VITE_* values at build time, so the contract address is a build arg.
ARG VITE_GIFTFLOW_ADDRESS_TESTNET
ENV VITE_GIFTFLOW_ADDRESS_TESTNET=${VITE_GIFTFLOW_ADDRESS_TESTNET}
RUN node node_modules/vite/bin/vite.js build

# The support API: a small Node service with a SQLite file. Needs only viem to check wallet signatures.
FROM node:22-slim AS api
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/index.mjs server/app.mjs server/db.mjs ./
RUN mkdir -p /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s   CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings", "index.mjs"]

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/conf.d/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
