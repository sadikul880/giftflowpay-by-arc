# GiftFlow (programmable USDC distribution on Arc)

Project memory for future agents and humans. Full documentation is in `docs/`.

## What this app does

Non-custodial USDC campaigns. An organizer deposits the whole total into `GiftFlow` and commits all allocations as a Merkle sum tree. Recipients claim with a wallet-bound address or a link-based claim key (EIP-712 signature bound to the caller). The organizer can distribute directly, refund after expiry, or cancel before the start time. No backend for money: state comes from contract reads and events. The one server-side piece is the Support inbox and admin panel (`server/`, `docs/support-and-admin.md`).

## Deployments

- Arc Testnet (5042002): `GiftFlow` at `0xa4b97bda0785ab417d0cce128a9fb9449139ee2c`, set via `VITE_GIFTFLOW_ADDRESS_TESTNET`.
- Mainnet: intentionally not configured. Add only after an explicit decision; deploy from the operator's own wallet.
- Redeploy with `OWNER_ADDRESS=0x... FORGE_ACCOUNT=<keystore> bun run deploy:testnet`.

## Product map

Public site (`PublicLayout`): landing, about, privacy, support (inbox with replies), claim, verify. App (`AppLayout`): dashboard, gift cards (`/gifts`, `/gifts/new`), send payment, payroll, rewards, transactions, swap, campaigns, contract activity, settings, and `/admin` (only for the wallet in `ADMIN_WALLET`). Gifts and payroll are one-recipient and wallet-list campaigns on the same contract, distinguished by the public metadata (`t`: gift, payroll; `k`: list, open, codes; `g`: gift details). Status of every requested feature, with the open items (company management, recurring payroll, embedded-wallet login, WalletConnect, mainnet, audit): `docs/feature-status.md`.

## Design notes

- One contract; campaigns are storage entries. Public campaigns publish recipient rows in `RecipientsPublished` and the contract re-derives the sum tree; private campaigns publish nothing, so the organizer must keep the CSV.
- Merkle sum tree (tagged leaves/nodes, padded to a power of two) is implemented identically in `contracts/GiftFlow.sol` and `src/lib/tree.ts`. Change both together.
- Link-based claim keys derive from the organizer's wallet signature over a message with a public salt; keys live only in the URL `#fragment`.
- Campaign metadata (name, description, type, message) is public JSON in `CampaignCreated` (max 2048 bytes).
- The Arc RPC rejects `eth_getLogs` ranges above about 10,000 blocks, so scans use 9,000-block windows (`EVENT_WINDOW_BLOCKS`) and never start before `DEPLOY_BLOCK`. The public RPC also returns 429 under heavy scans.
- Payout modes live in campaign metadata (`k`: list, open, codes). Open link: `#m=<master>` in the URL fragment unlocks every equal share. Codes: 12-character code per person, key = keccak("giftflow:<salt>:<code>"). Both force public campaigns. Logic in `src/lib/flow.ts`, claim UI in `src/pages/ClaimModes.tsx`, tests in `src/lib/modes.test.ts`.
- Arc RPC reads go through `src/lib/transport.ts` (batching and provider fallback).
- `localStorage` holds UI preferences only; `sessionStorage` holds the Support session token. Support data lives in SQLite behind `/api` (`server/app.mjs`); `ADMIN_WALLET` decides who is admin and is enforced by the API.
- `bun run e2e:local` runs the app libraries against the real contract on Anvil (Docker); `bun run e2e:testnet` is the live testnet check (needs `E2E_KEYS_FILE` with two throwaway wallets).

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit, injected wallets
- Contracts: Solidity 0.8.28 + Foundry in `contracts/`; tests in `contracts/test/*.t.sol`
- Chain/token: Arc Testnet (5042002), USDC `0x3600000000000000000000000000000000000000` (6 decimals)
- Hosting: nginx static build plus the `api` service (`Dockerfile`, `docker-compose.yml`, Coolify-ready)

## Key files

- `contracts/GiftFlow.sol`: the contract
- `src/lib/tree.ts`, `src/lib/flow.ts`: Merkle tree, metadata, CSV, claim keys and links
- `src/lib/chain.ts`, `src/lib/events.ts`: contract reads and event scanning
- `src/hooks/useTx.ts`: transaction runner (simulate, send, wait for receipt)
- `src/onchain-facts.ts`: verified Arc chain facts (RPC, explorer, USDC)

## Share links

- Build every link users copy or send with `buildShareLink()` from `src/lib/share.ts`.
- Never put a secret (claim key, private key, seed phrase, token) in the URL path or query. Claim secrets go only in the `#fragment` and are read from `location.hash`.
- Keep the `installShareSync()` call in `src/main.tsx`.
- Navigate inside the app with relative links.

## Commands

```bash
bun install
bun run dev
bun run dev:api   # Support API, reads .env (ADMIN_WALLET)
bun run check
bun run build
bun run test
bun run contracts:test
docker compose up -d --build
```
