# Audit notes

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
