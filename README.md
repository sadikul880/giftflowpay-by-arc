# GiftFlowPay

The programmable distribution layer for USDC on Arc. Create once. Fund once. Distribute by rules.

GiftFlow lets Web3 projects, DAOs, hackathon organizers and communities run reward campaigns. An organizer deposits the full USDC total into one smart contract, commits every recipient's allocation as a Merkle sum tree, and recipients claim with their wallet or a personal link. Unclaimed funds return to the organizer after the deadline. There is no database and no backend; everything authoritative lives onchain.

## Features

- Campaigns with name, description, type, message, start time, claim deadline, public or private visibility
- Recipients added one by one or imported from CSV (up to 1,000 public / 4,096 private in the app)
- Atomic funding: `createCampaign` pulls the full USDC total, so allocations can never exceed what was deposited
- Gift cards: fund a USDC gift, share it by link or QR code, download a branded PNG, claim by secret code, named wallet or link
- Three payout modes: a wallet list (salaries, DAO payouts), one shared link with equal shares, or a secret code per person
- Claim-based distribution (wallet-bound or link-based) and direct batch distribution by the organizer
- Contract-enforced eligibility: Merkle proof, single-use claims, wallet binding, EIP-712 signatures for link-based claims
- Refunds after expiry, cancellation before start, emergency pause that never traps funds
- Dashboard, campaign details, recipient status, public verification page and paginated activity, all read from the contract and its events

## Tech stack

Solidity 0.8.28 + OpenZeppelin 5.6.1 + Foundry; React 18, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Arc Testnet (chain 5042002), USDC `0x3600000000000000000000000000000000000000`.

## Quick start

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh) (Foundry only for contract work).

```bash
bun install
cp .env.example .env
bun run dev
```

```bash
bun run check            # lint + typecheck
bun run build            # production build
bun run contracts:build
bun run test             # frontend unit tests
bun run contracts:test   # 123 tests
```

Deployed contract (Arc Testnet): `0xa4b97bda0785ab417d0cce128a9fb9449139ee2c`. Mainnet is intentionally not configured.

## Self-hosting

```bash
docker compose up -d --build
```

`docker-compose.yml` is ready for Coolify (Docker Compose resource, domain on the `web` service, port 80). See [docs/deployment.md](docs/deployment.md).

## Documentation

See [docs/](docs/README.md): architecture, smart contract reference, claim links and security, frontend, user guide, deployment, testing and roadmap.

## Status

Testnet MVP. The contract has not been independently audited. Do not use it with significant value before an audit.
