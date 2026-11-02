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

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
