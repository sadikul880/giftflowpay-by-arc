# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Vite inlines VITE_* values at build time, so the contract address is a build arg.
ARG VITE_GIFTFLOW_ADDRESS_TESTNET
ENV VITE_GIFTFLOW_ADDRESS_TESTNET=${VITE_GIFTFLOW_ADDRESS_TESTNET}
RUN bunx vite build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
