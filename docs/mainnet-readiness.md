# Mainnet readiness

Status: **not ready, and deliberately not configured.** Nothing in the repository deploys to or talks to a mainnet. This page is the checklist for when you decide to go live. Do not skip a section.

## 1. Gates before any mainnet deployment

1. **Independent security audit** of `contracts/GiftFlow.sol` by a third party, with all findings fixed or accepted in writing. The project's own review ([audit.md](audit.md)) is not a substitute.
2. **A live, funded run on Arc Testnet** of every flow you will offer (gift by code, by wallet and by link; payroll; refund; cancel; swap). The local-chain test proves the logic, not the wallet experience.
3. **Decisions still open**: company management (Safe or new contracts), recurring payroll. See [feature-status.md](feature-status.md).
4. **Your explicit approval** to deploy. No script or workflow in this repository does it automatically.

## 2. Facts that must come from official documentation

Verify each on docs.arc.io and developers.circle.com on the day you deploy, and record the source and date:

- Arc mainnet chain ID, RPC URL, block explorer and native currency. The repository's chain facts file lists a chain named "Arc" with ID 5042, but that file is a snapshot, not the official source.
- The **Arc mainnet USDC address**. Circle's published USDC mainnet address table did not list Arc when this page was written, so there was no official address to use. Do not deploy until one is published.
- App Kit chain identifiers for the routes you enable (`Arc` for Arc mainnet). EURC and USDC addresses on Base mainnet in Circle's tables: USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, EURC `0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42`.

## 3. Contract deployment

- Deploy from **your own hardware wallet or Foundry keystore**, never from a key stored in a file or CI secret.
- Constructor arguments: the verified mainnet USDC address and an `initialOwner`. Make the owner a **multisig** (the contract uses `Ownable2Step`, so ownership transfers need acceptance, and renouncing is disabled).
- The owner can pause and set `maxTotalAllocation` (default 1,000,000 USDC, hard ceiling 100,000,000 USDC). Choose a low cap for the first weeks, for example 1,000 to 10,000 USDC, and raise it as confidence grows.
- Use `scripts/deploy-testnet.ts` as the model for a separate `deploy-mainnet.ts` that refuses to run unless `EXPECTED_CHAIN_ID` matches and prints the addresses it will use before asking for confirmation. Verify the source on the explorer after deployment.
- Record the deployment block: the event scanner never reads before `DEPLOY_BLOCK`.

## 4. Application changes for mainnet

The app is testnet-only by construction (`src/lib/network.ts` exposes only `NETWORKS.testnet`). To add mainnet:

1. Add a `mainnet` entry to `NETWORKS` with its own `VITE_GIFTFLOW_ADDRESS_MAINNET`, USDC address and explorer, and a clear network switch or a separate deployment (a separate Coolify app with its own domain is the safest way to keep them apart).
2. Add the mainnet chain to `src/config.ts` and its Circle chain keys to `src/lib/tokens.ts` and the swap page. Keep testnet and mainnet tokens in separate tables.
3. Show a persistent "Mainnet: real funds" banner, and warn before any amount above a threshold (for example 100 USDC) as the Circle skills require.
4. Review `security-headers.inc` (`connect-src`) and the privacy notice for any new services.
5. Re-run the full checks: `bun run check`, `bun test src`, `forge test`, `bun run e2e:local`, and a funded run on the new network with small amounts.

## 5. Operations

- Use a **dedicated RPC provider** with a rate limit that fits your traffic. The public RPC and the explorer API throttle heavy use (HTTP 429).
- Keep the Docker build at 1.28 GB of heap or more; a server with 2 GB of RAM is enough. After each release, check that open tabs recover (the error boundary asks for a reload when a page's file is gone).
- Monitor the contract: watch for `Paused`, `MaxTotalAllocationUpdated` and ownership events, and keep the owner multisig's signers reachable.
- Publish a short incident procedure: who can pause, how users are told, and the fact that refunds and cancellations keep working while paused.

## 6. What stays true on mainnet

The owner cannot withdraw campaign funds, change a campaign, or block refunds. Recipients can verify every campaign on its public page. Claim secrets never appear in storage, queries, logs, or images that are shared publicly.
