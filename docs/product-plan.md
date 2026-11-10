# GiftFlowPay product plan (Phase 0 audit)

Status: 2026-11-11. This page compares the requested product (the GiftFlowPay master prompt and its dashboard reference design) with what the repository does today, and lists what each phase needs.

The "GiftFlowPay Final Developer PRD v5.0" referenced by the prompt was not available to the maintainers' tooling, so this plan follows the master prompt and the dashboard image. Anything the PRD specifies differently must be reconciled before the matching phase starts.

## What exists today (verified)

| Capability | State | Where |
| --- | --- | --- |
| Arc Testnet config, USDC (6 decimals), explorer links | Done | `src/onchain-facts.ts`, `src/lib/network.ts` |
| Injected wallet connect, network switch, USDC balance and allowance | Done | `src/hooks/useFlow.ts`, ConnectKit |
| Campaigns funded in one transaction, Merkle sum tree, claims, refunds, cancel, pause | Done, 123 Foundry tests | `contracts/GiftFlow.sol` |
| Payout modes: wallet list, one shared link, secret codes | Done, unit-tested | `src/lib/flow.ts`, `src/pages/ClaimModes.tsx` |
| CSV import, manual entry, bulk direct send (50 per transaction) | Done | `src/components/create`, `src/pages/Recipients.tsx` |
| Claim links in the URL `#fragment`, public verification page | Done | `src/lib/flow.ts`, `src/pages/Verify.tsx` |
| Transaction history from contract events (windowed `getLogs`) | Done | `src/hooks/useEventScanner.ts` |
| Dark emerald design, separate public site and app shell, dashboard with wallet panel | Done in this phase | `src/components/Layout.tsx`, `src/pages/Dashboard.tsx` |
| Docker and Coolify deployment | Done | `Dockerfile`, `docker-compose.yml` |

All numbers on the dashboard come from the contract and the wallet. The reference image contains sample figures; none of them are used.

## Requested features and how each will be built

| # | Feature | Plan | Needs a decision first |
| --- | --- | --- | --- |
| 1-3 | Wallet onboarding, MetaMask, WalletConnect | Injected wallets work now. WalletConnect is a connector plus a WalletConnect project ID. The production bundle currently stubs the WalletConnect SDK to keep builds small (see `vite.config.ts`) | A WalletConnect project ID |
| 2 | Google and email login with embedded wallets | Requires an embedded-wallet provider (for example Circle's modular or user-controlled wallets) with a client key and an allowed domain. The key cannot be committed | Provider choice and credentials. Report: not possible without them |
| 4 | Arc USDC wallet dashboard | Balance and address are live. Other token balances need token addresses verified per chain | Which tokens |
| 5-8 | Gift cards, PNG, QR, claim links | A gift card is a one-recipient campaign on the existing contract (shared link or secret code). Add a QR of the claim link (library `qrcode`, runs in the browser) and a canvas-rendered branded PNG after the funding transaction confirms. See the QR and PNG note below for what the image may contain | Whether the PNG may contain the link at all |
| 9 | Secret code | Already supported (codes mode) | none |
| 10 | Expiry and refund | Already supported | none |
| 11 | Direct payments | A one-recipient wallet-list campaign works today. A lighter "send" screen can wrap it | Whether a pure transfer with no escrow is wanted |
| 12 | Company payroll (CSV or manual) | Wallet list plus direct send covers one-off payroll. Recurring payroll needs a new `PayrollManager` contract | Scope: one-off or recurring |
| 13 | Community rewards | Campaigns today | none |
| 14-16 | Swap and bridge, Base and Arc balances, EURC, cirBTC | Circle App Kit (`@circle-fin/app-kit`). Quotes and routes must come live from the kit; nothing is hard-coded. cirBTC is shown as wrapped Bitcoin | Kit key, supported routes on Arc, mainnet vs testnet liquidity |
| 17 | Transaction history | Done for campaigns; swaps and bridges would add their own records | none |
| 18 | Company management | Needs `CompanyAccessManager` (roles, multi-member access) | Role model |
| 19 | Security and settings | Settings page exists (allowance revoke, preferences) | none |

QR and PNG note: a secret-bearing link must never be printed into an image that is shared publicly. For shared-link and code modes the QR can encode the campaign claim page (`/claim/<id>`) so a code is still typed by the person; a QR of a personal `#c=` link is the same secret as the link itself and should be treated that way. This needs an explicit product decision.

## Contracts the prompt asks for

The current single `GiftFlow` contract already behaves like `GiftCardEscrow` and `RewardCampaignManager`. New contracts are only justified for:

- `PayrollManager`: recurring or scheduled payroll, per-employee streams. New design, new tests.
- `CompanyAccessManager`: shared company access with roles. New design, new tests.

Each needs reentrancy protection, access control, pause, no unrestricted admin withdrawal, unit, fuzz and invariant tests, and a testnet deployment before any UI depends on it. No contract is deployed to mainnet without explicit approval.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Audit and plan | This page |
| 1 | Landing, dashboard shell, wallet panel, dark emerald theme | Done (this change) |
| 2 | Gift cards: QR, PNG, claim | Next. Reuses the existing contract |
| 3 | Send payment and payroll | One-off payroll needs UI only; recurring needs `PayrollManager` |
| 4 | Swap and bridge | Blocked on Circle App Kit key and route verification |
| 5 | Rewards, company, transactions | Needs `CompanyAccessManager` |
| 6 | Security, testing, optimization | After each contract change |
| 7 | Mainnet readiness | Audit first, then explicit approval |

## Phase 1 report

Changed: `src/index.css` (design tokens), `src/components/Layout.tsx` (public layout and app shell), `src/App.tsx` (route split), `src/pages/Dashboard.tsx`, `src/pages/Landing.tsx`, `src/components/HeroCard.tsx`, `src/main.tsx` (dark wallet modal), brand strings, `index.html`.

Verified: typecheck, lint, 7 unit tests, production build; pages inspected in a browser against live Arc Testnet data.

Not done in this phase, on purpose: sidebar entries for features that do not exist yet (payroll, swap, contacts, company). They will appear with their phases rather than as dead links.

Unresolved: Google and email login (needs a provider), WalletConnect (needs a project ID), Swap and Bridge (needs the Circle kit key), PRD v5.0 not available.
