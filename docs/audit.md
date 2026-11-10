# Audit notes

## Phase 6 review, 2026-11-11

Scope: the whole product after Phases 1 to 5 (gifts, payroll, payments, swap and bridge, rewards, transactions). Engineering review by the maintainers' tooling, not a third-party audit.

### Smart contract

Unchanged since the last review; no defects found. New evidence:

- 123 Foundry tests re-run with **10,000 fuzz runs** per property and **1,024 invariant runs of depth 300** (the default is 256 runs): all pass.
- Coverage of `contracts/GiftFlow.sol`: 98.7% of lines, 98.7% of statements, 97.7% of branches, 100% of functions. Two lines, three statements and one branch are not exercised; they have not been analysed individually.
- **Local-chain end-to-end test** (`bun run e2e:local`, runs in CI too): the app's own TypeScript (Merkle tree, claim keys, secret codes, gift plans, payroll batching) against the real contract on a throwaway Anvil node. 10 scenarios, all pass: a gift claimed by secret code (wrong code, wrong wallet and replay rejected), a signature made for one wallet refused for another, a named-wallet gift, one shared link with 5 shares, 100 secret codes (first, middle, last), payroll for 100 employees in two batches of 50 (everyone paid exactly once, a repeat run reverts), payroll resume after one batch, refund after the deadline (once, creator only, claims closed), cancel before the start, and a tree that overstates the deposit being unable to pay. This is the first test that proves the frontend code and the contract agree for the gift, code and payroll flows; before, those paths were only unit-tested on each side.

### Frontend

- **Links from outside the app** (explorer URLs returned by the swap and bridge kit) are now followed only if they are plain http(s) (`src/lib/safeUrl.ts`), so a `javascript:` URL could never run on click. Covered by tests.
- **Content-Security-Policy.** nginx now sends a real CSP: scripts only from our own origin (the bundle has no inline scripts and needs no eval), styles from our origin plus Google Fonts, images from our origin, data and blob URLs and https, `connect-src` https and wss (the app talks to public RPCs, the explorer API and Circle and LiFi services chosen at runtime), no framing, no plugins. It was tested in a browser against the production build: dashboard, wallet connection, a live swap quote through the lazily loaded App Kit, the bridge page and the gift page all ran with **zero CSP violations**.
- Secrets: claim keys, master secrets and codes live only in the URL fragment or in memory; no secret is written to storage, logs or a query string. `localStorage` still holds three interface preferences only.
- No private key, API key or kit key is used or stored anywhere in the app. Swap and bridge are permissionless and signed by the user's own wallet.

### Dependencies

`bun audit`: 13 advisories (7 high, 5 moderate, 1 low), unchanged by `bun audit fix` because every fix would cross a version the Circle SDKs and wagmi pin. All are transitive. Reachability check against the production bundle: `stream-json` and `decode-uri-component` are not shipped; `toml` (via a Solana library) and `uuid` are used only inside wallet and SDK code paths that parse our own inputs; `zod` ships inside the lazily loaded App Kit chunk and validates the app's own parameters and service responses; `elliptic` comes from the Node crypto polyfills. None parses attacker-controlled input in this app. Re-run `bun audit` and upgrade `@circle-fin/*` and `wagmi` as soon as releases fix them.

### Performance

- Every page except the landing page is now code-split (`React.lazy`), with a skeleton while a page loads. The initial JavaScript fell from 553 KB to 494 KB gzipped (1.74 MB to 1.58 MB raw), and the swap, bridge, gift, payroll and other page code, plus the Circle App Kit, load only when opened.
- Hand-made vendor chunks were tried and removed: they separated React from the libraries that import it and the app failed to start (caught by the browser check, not shipped).
- The production build still fits the 1.28 GB heap cap used by the Docker image.

### Known limits

- The public Arc RPC and the explorer API rate-limit heavy use; use a dedicated RPC for a launch with many simultaneous claimants.
- The contract has still not had an independent audit. Do that before real value is held.
- `connect-src` allows any https host because the swap and bridge services are chosen at runtime. Narrow it if the set of services becomes fixed.

## Earlier review, 2026-11-05

Second review of the project, 2026-11-05. This is an engineering review by the maintainers' tooling, not a third-party security audit.

## Scope and method

- `contracts/GiftFlow.sol`: line-by-line read, 123 Foundry tests (including fuzz and invariant suites), gas measurement of the largest campaign.
- Frontend: claim, create, organizer and event-reading code paths; production bundle behavior in a browser against the live testnet contract.
- Dependencies: `bun audit`.
- Deployment: Dockerfile, nginx config, Coolify compose.

## Smart contract

No defects found, no change made.

| Check | Result |
| --- | --- |
| Reentrancy, token transfers | `nonReentrant` everywhere, `SafeERC20`, state written before transfers |
| Double claim, replay, front-running | claimed bitmap; link-based signatures bind campaign, index, recipient and deadline |
| Over-funding / over-allocation | sum tree must equal the funded total, funding is atomic with creation, `AllocationExceeded` guards the running total |
| Refund and cancel | creator only, work while paused, cannot repeat |
| Operator power | owner can pause and set the cap only; no withdrawal, no upgrade, renounce disabled |
| Gas at the limit | `createCampaign` with 1,000 public recipients executes in about 3.5 million gas, far below Arc Testnet's 30 million block gas limit |

Observations (documented, by design):

- A private campaign's sum-tree integrity cannot be checked onchain; claims are still capped by `totalAllocation`.
- Link-based allocations are bearer instruments. With the shared-link mode one wallet can claim several shares; secret codes give strictly one share per code.
- Arc pays gas in USDC, so a claiming wallet needs a small USDC balance. A brand-new empty wallet cannot claim until it receives some.
- The contract has not been reviewed by an independent auditor.

## Frontend

Changed in this review:

- **Fewer RPC requests.** A campaign's creation event never changes, but it was searched again on every 30-second refresh. It is now looked up once per page load.
- **RPC resilience.** Reads now use JSON-RPC batching and fall back to the other public Arc RPC providers when one rate-limits (HTTP 429), instead of surfacing errors. See `src/lib/transport.ts`.
- **Lighter build.** The wallet connector is imported from `wagmi` instead of the `wagmi/connectors` bundle, and unused wallet SDKs are stubbed in production builds (see [deployment.md](deployment.md)). Build memory fell from over 2 GB to about 1 GB, which fixes the Coolify `exit code 137`.
- **Clickjacking.** nginx now sends `frame-ancestors 'none'` and other security headers.
- **Payout modes.** One shared link and secret codes added for equal shares without wallets, with unit tests for code derivation, claim-key signatures and link parsing (`src/lib/modes.test.ts`).

Known limitations:

- Activity history uses windowed `eth_getLogs` (about 9,000 blocks per request), so scanning far back takes many requests. Dashboards and campaign lists use contract reads and are not affected. A dedicated indexer would remove this limit.
- The public RPC remains the only data source; there is no self-hosted node.

## Dependencies

`bun audit` reports 5 advisories (2 high, 2 moderate, 1 low). They sit in transitive packages of wallet SDKs (`@walletconnect`, `@metamask/sdk`, `@coinbase/cdp-sdk`) and in `elliptic` through the Node polyfills. The wallet SDKs are not part of the production bundle (stubbed, never loaded). Re-run `bun audit` and update `wagmi` and `vite-plugin-node-polyfills` when newer versions are available.

## Not verified

- A full end-to-end run of the new payout modes against the live testnet contract (needs funded test wallets). The cryptography is unit-tested, and the contract paths they use are covered by the Foundry bearer-claim tests.
- The final Docker image build on a Coolify server.
