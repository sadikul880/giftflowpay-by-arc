# Testing

## Smart contract tests (Foundry)

```bash
bun run contracts:test
```

123 tests in 9 suites under `contracts/test/`, all passing:

| Suite | Focus |
| --- | --- |
| `GiftFlow.t.sol` | Creation validation (root, counts, windows, metadata), public-list commitment checks, insufficient allowance and balance, pause, tree sizes up to 1,000 public recipients |
| `GiftFlow.Claim.t.sol` | Wallet-bound claims, wrong wallet, bad proofs, wrong amount or index, duplicate claims, window start and end, cancelled or paused campaigns, malicious roots that understate or inconsistently sum allocations |
| `GiftFlow.Bearer.t.sol` | Link-based claims: valid signature, wrong signer, recipient, index, campaign or deadline, expired signature, front-running by another wallet, replay after claim, chain-ID change |
| `GiftFlow.Distribute.t.sol` | Creator batch distribution (up to 100), non-creator rejection, link-based entries rejected, whole batch reverts on one bad entry |
| `GiftFlow.Lifecycle.t.sol` | Refund after expiry, double refund, early refund, refund after partial claims, cancel before start, refund and cancel while paused |
| `GiftFlow.Admin.t.sol` | Pause and unpause, allocation cap, two-step ownership, disabled renounce, owner cannot withdraw funds, reentrancy through the token during claim, distribute, refund, cancel and create |
| `GiftFlow.Fuzz.t.sol` | Property tests over amounts, indexes, tree shapes |
| `GiftFlow.Invariant.t.sol` | Contract balance equals outstanding allocations, claimed amounts match bitmap and committed amounts, token conservation |
| `GiftFlow.Base.t.sol` | Shared test harness (mock USDC and tree builder, no tests of its own) |

Run them without a local Foundry install:

```bash
docker run --rm --entrypoint sh -v "$PWD:/app" -w /app ghcr.io/foundry-rs/foundry:v1.7.1 -c "forge test"
```

(`node_modules` must exist first because OpenZeppelin is resolved from it.)

### Deeper runs

```bash
FOUNDRY_FUZZ_RUNS=10000 FOUNDRY_INVARIANT_RUNS=1024 FOUNDRY_INVARIANT_DEPTH=300 forge test
forge coverage --report summary --ir-minimum        # GiftFlow.sol: 98.7% lines, 97.7% branches, 100% functions
```

## Local-chain end-to-end test (no funds needed)

```bash
bun run e2e:local      # Docker: starts Anvil, deploys a fake USDC and GiftFlow, runs the test, stops Anvil
```

`contracts/test-integration/local-chain.test.ts` drives the real contract with the app's own libraries: gifts by secret code, named wallet and private link, one shared link with several shares, 100 secret codes, payroll for 100 employees in batches with resume, refund, cancel, and the attack cases (wrong code, wrong wallet, replay, double pay, overstated total). With Foundry installed locally, start `anvil`, run `forge script contracts/script/DeployLocal.s.sol:DeployLocal --rpc-url http://127.0.0.1:8545 --broadcast --private-key <anvil dev key>` and then `bun test contracts/test-integration/local-chain.test.ts`. The test skips itself when no node is running. `DeployLocal` refuses to run on any chain but Anvil's 31337.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: typecheck, lint, frontend tests and the capped production build; the Foundry suite; and the local-chain end-to-end test.

## Frontend checks

```bash
bun run test        # frontend tests (bun) and Support API tests (node:test), covering: codes, open links and claim keys (modes.test.ts); gift plans, metadata, QR round-trip and text wrapping (gift.test.ts); payroll validation, batching, resume and receipt, fee display (payroll.test.ts); pinned token addresses, formatting and kit error handling (swapbridge.test.ts); motion helpers (motion.test.ts); the Support client (support.test.ts); and the Support API in `server/app.test.mjs`: wallet sign-in, nonce reuse, conversations, admin-only routes, pagination, filters, rate limits
bun run typecheck   # tsc
bun run lint        # oxlint with type-aware rules
bun run build       # production build
```

## Live end-to-end check (Arc Testnet)

```bash
E2E_KEYS_FILE=/path/to/keys.json bun run e2e:testnet
```

`contracts/test-integration/e2e-testnet.ts` runs against the deployed contract with the app's own libraries: it creates a public 100-recipient campaign, rebuilds the published list and verifies it against the onchain commitment, performs wallet-bound and link-based claims, and checks that unauthorized and duplicate claims are rejected. It needs two throwaway wallets in the keys file (`{"a": "0x...", "b": "0x..."}`) and testnet USDC on wallet `a`. Never reuse a real wallet's key.

Campaign #1 on the current testnet deployment is the result of such a run and can be inspected on the Verify page.
