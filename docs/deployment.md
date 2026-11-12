# Deployment

## Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `VITE_GIFTFLOW_ADDRESS_TESTNET` | build time | Address of the deployed `GiftFlow` contract on Arc Testnet. Vite inlines it, so rebuild after changing it |
| `ADMIN_WALLET` | the `api` service | The wallet that gets the Admin panel (support inbox, users, statistics). Read by the Support API at runtime; the compose file defaults to the project admin wallet |
| `OWNER_ADDRESS`, `FORGE_ACCOUNT` | contract deployment only | Admin address (pause and cap) and the name of a Foundry keystore |

Copy `.env.example` to `.env` for local work. `.env` is git-ignored. No private key is ever stored in the repository or passed on a command line.

## Arc Testnet facts

Verified through `src/onchain-facts.ts` and used by the app and the deploy script:

- Chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`
- USDC `0x3600000000000000000000000000000000000000` (6 decimals; also the native gas currency)

Re-check these against the official Arc documentation (docs.arc.io) before any production use.

## Deploy the contract

Prerequisites: [Foundry](https://book.getfoundry.sh) and [Bun](https://bun.sh).

```bash
bun install
bun run contracts:build
bun run contracts:test
cast wallet import giftflow --interactive
OWNER_ADDRESS=0xYourAdminAddress FORGE_ACCOUNT=giftflow bun run deploy:testnet
```

The script (`scripts/deploy-testnet.ts`) calls `contracts/script/DeployGiftFlow.s.sol`, which checks the chain ID before broadcasting. Put the printed address in `.env` as `VITE_GIFTFLOW_ADDRESS_TESTNET`. The owner can pause and set the allocation cap but cannot touch campaign funds.

There is deliberately no mainnet script or mainnet configuration. Add one only after an explicit decision, and deploy from your own wallet.

## Run locally

```bash
bun install
bun run dev        # http://localhost:5173
bun run check      # lint + typecheck
bun run build      # production build into dist/
```

## Docker

The Dockerfile has two deployable targets. `web` (default): Bun builds the static site, nginx serves it and forwards `/api` to the `api` service. `api`: the Support service (Node 22 with SQLite and `viem`). Compose starts both. nginx falls back to `index.html` for client-side routes, caches hashed assets for a year, and exposes `/healthz`.

```bash
docker compose up -d --build     # container port 80
```

Set the contract address with `VITE_GIFTFLOW_ADDRESS_TESTNET` (the compose file defaults to the current Arc Testnet deployment).

## Coolify

1. In Coolify, create a new resource: **Docker Compose** from this Git repository, branch `main`, compose file `docker-compose.yml`.
2. Under the environment variables, set `VITE_GIFTFLOW_ADDRESS_TESTNET` (mark it as a build variable if Coolify asks).
3. Assign your domain to the `web` service on port 80. The compose file declares `SERVICE_FQDN_WEB_80`, so Coolify generates the proxy labels and a domain field for it. HTTPS is handled by Coolify's proxy.
4. Deploy. The health check hits `/healthz`.
5. After changing the contract address, redeploy so the image is rebuilt.

Two services start: `web` and `api`. Give your domain to `web` only; `api` stays internal and keeps its SQLite file in the `support-data` volume (keep this volume, and back it up if you care about the conversations). Set `ADMIN_WALLET` in the resource environment if it should differ from the default. See [support-and-admin.md](support-and-admin.md).

## RPC capacity

The app reads logs from the public Arc RPC, which limits `eth_getLogs` to about 10,000 blocks per request (the app already windows its scans) and rate-limits bursts (HTTP 429). The app sends concurrent requests as JSON-RPC batches and falls back to the other public Arc providers listed in viem's chain definition (`src/lib/transport.ts`) when one fails or rate-limits. For a launch with many simultaneous claimants, put a dedicated RPC endpoint first in that list (or in `rpcUrls` for Arc Testnet in `src/onchain-facts.ts`) and rebuild.

## Security headers

The full policy is in `security-headers.inc` with the reasoning for each directive; it was verified against the production build with zero violations. The summary below names the main points.

nginx sends `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, a `Content-Security-Policy` limited to `frame-ancestors 'none'` (no framing, so no clickjacking of approve and claim buttons), and a restrictive `Permissions-Policy`. They live in `security-headers.inc`.

## Build memory

The production build runs on Node with a 1.28 GB heap cap (`NODE_OPTIONS` in the `Dockerfile`) and needs roughly 1.5 GB of free RAM in total. `vite.config.ts` stubs wallet SDKs that wagmi lazy-loads but this app never uses (WalletConnect, Coinbase, MetaMask, Safe, Porto, Base), which cut the build from more than 2 GB to about 1 GB of heap. A server with 2 GB RAM is enough; on a 1 GB server add swap. If a build dies with `exit code 137`, the server ran out of memory.

Only the injected-wallet connector is configured. To add WalletConnect or another connector later, remove its SDK from `UNUSED_WALLET_SDKS` in `vite.config.ts`.
