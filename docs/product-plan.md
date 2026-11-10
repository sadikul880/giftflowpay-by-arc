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
| 1 | Landing, dashboard shell, wallet panel, dark emerald theme | Done |
| 2 | Gift cards: QR, PNG, claim | Done, see the Phase 2 report below. Reuses the existing contract |
| 3 | Send payment and payroll | Done for one-off payments and payroll, see the Phase 3 report. Recurring payroll still needs `PayrollManager` |
| 4 | Swap and bridge | Done for the routes Circle verifies on Arc Testnet, see the Phase 4 report. No kit key was needed |
| 5 | Rewards, company, transactions | Rewards and transactions done; company management is blocked on a product decision, see the Phase 5 report |
| 6 | Security, testing, optimization | Done, see the Phase 6 report and `docs/audit.md` |
| 7 | Mainnet readiness | Audit first, then explicit approval |

## Phase 2 report: gift cards

Built on the existing contract (a gift is a one-recipient public campaign, so no contract change and no redeploy).

- `/gifts/new`: amount (10, 25, 50, 100, 500 or custom), four designs, from, to, message, expiry (7 days to 1 year), live preview, confirmation dialog, key signing, approval and funding with confirmed-receipt success.
- Three claim methods. **Secret code**: link, QR and image hold no secret; the recipient types a code you send separately. **Specific wallet**: only that wallet can claim; no secret anywhere. **Anyone with the link**: the claim key is in the link's `#fragment`, so the link and its QR are the secret; the downloaded image carries no QR for that reason. This resolves the QR and PNG note above: the prompt's rule that secrets never appear in QR codes, URLs or images is kept for the code and wallet methods, and the link method is an explicit, labelled opt-in.
- Real QR codes (`qrcode`, rendered in the browser). Tests scan the generated QR image back and check it decodes to exactly the claim link.
- Branded PNG drawn on a canvas (1200 by 750), created only after the funding transaction is confirmed.
- The claim page shows the gift card (design, amount, from, to, message) for gift campaigns.
- Gift details are stored in the public campaign metadata (field `g`) and survive a page reload; the secret code can be shown again from the campaign's Recipients page by signing with the funding wallet.

Changed: `src/pages/GiftCreate.tsx`, `src/lib/gift.ts`, `src/lib/giftPng.ts`, `src/components/GiftCardArt.tsx`, `src/lib/flow.ts` (gift type and metadata), `src/pages/Claim.tsx`, `src/pages/Dashboard.tsx`, `src/components/Layout.tsx`, `src/App.tsx`, `src/lib/gift.test.ts`.

Verified: typecheck, lint, 22 frontend tests (7 existing, 15 new), production build, form and PNG rendering in a browser.

Not verified: a funded end-to-end gift on Arc Testnet. That needs a wallet holding testnet USDC; the cryptography is unit-tested and the contract paths (one-recipient tree, bearer and wallet-bound claims, refund) are covered by the Foundry suite.

Known limits: a gift is public (amount, sender and recipient names, and for wallet gifts the recipient address are onchain). The code and link methods need the funding wallet to sign once. Gift cards use the contract's per-campaign limits.

## Phase 6 report: security, testing, optimization

Full detail is in [audit.md](audit.md). In short:

- **Contract**: 123 tests pass at 10,000 fuzz runs and 1,024 invariant runs of depth 300; 98.7% line and 97.7% branch coverage of `GiftFlow.sol`. No defects found, no contract change.
- **New local-chain end-to-end test** (`bun run e2e:local`, also in CI): the app's real TypeScript against the real contract on Anvil, 10 scenarios including 100 secret codes and a 100-employee payroll in two batches. All pass. It closes the gap that gifts, codes and payroll were previously tested on each side separately.
- **Security**: a real Content-Security-Policy, verified with zero violations against the production build; external links limited to http(s); 13 transitive dependency advisories assessed as unreachable and documented.
- **Optimization**: page-level code splitting; initial JavaScript 553 KB to 494 KB gzipped; the capped Docker-style build still passes.
- **CI**: GitHub Actions workflow for typecheck, lint, tests, build, Foundry and the local end-to-end test.

Still open: an independent audit, the company-management decision, cirBTC, and a live run of the funded flows on Arc Testnet.

## Phase 5 report: rewards, transactions and company

**Done**

- **`/rewards`**: six ready-made starting points (hackathon prizes, community airdrop with secret codes, open giveaway with one shared link, grants, bounties, contributor rewards). A card pre-fills the campaign type and payout mode in the create form and opens it; nothing is stored. Below, your latest campaigns, with gift cards and payroll runs hidden because they have their own pages.
- **`/transactions`**: the connected wallet's full history on Arc Testnet, in two tabs. *Transactions* labels each one from the contract it called and its function selector (funded a campaign, claimed, sent payouts, refunded, cancelled, approved USDC, sent USDC, contract interaction, deployment) with status, network fee and explorer link. *Token transfers* shows USDC, EURC and any other token moved in or out, with the counterparty, flagging tokens that are not USDC or EURC as unverified. Both load older pages on request. This is where swaps and bridges appear too, as transactions and token transfers.
- Data source: the Arc block explorer's public API (Blockscout), because an RPC cannot list a wallet's history. It is public chain data, every row links to its transaction, and nothing authoritative depends on it: campaign state and balances still come from the contract. The privacy notice says so. The `/activity` page (renamed "Contract activity") still lists the contract's own events for everyone.
- The labelling was checked against real transactions: the `createCampaign` selector seen on chain equals the one derived from the ABI, and the page labelled this wallet's real history correctly (funded, approved, cancelled, sent payouts).

**Not built: company management**

The prompt asks for a `CompanyAccessManager` contract (company roles). I did not build it, because it changes the architecture and needs your decision first:

- The GiftFlowPay contract gives every campaign to one creator wallet, who alone can pay out, refund or cancel. Roles such as "finance can run payroll but not refund" cannot be enforced by a separate registry unless the money moves through it.
- *Option A, no new contract*: use a Safe multisig as the company wallet. Payroll and wallet-list campaigns work unchanged. Gift links and secret codes do not, because they derive keys from a deterministic wallet signature, which smart-contract wallets cannot produce.
- *Option B, new contracts*: a `CompanyTreasury` that holds the USDC and calls GiftFlowPay for the company, with owner, admin and finance roles, an approval step for payroll, and its own Foundry tests (reentrancy, access control, no admin withdrawal). It must be deployed from your wallet, and it adds a second contract to audit.
- *Not an option*: storing company members in a database or in the browser. That would break the no-backend rule.

Please choose A or B (or drop company management for the MVP). Recurring payroll (`PayrollManager`) belongs with the same decision, because a company treasury is what would hold its funds.

Changed: `src/pages/Transactions.tsx`, `src/pages/Rewards.tsx`, `src/lib/explorerApi.ts`, `src/lib/rewards.ts`, `src/components/Layout.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Privacy.tsx`, `src/App.tsx`, `src/lib/explorerApi.test.ts`.

Verified: typecheck, lint, 51 frontend tests (9 new, built from real explorer responses), production build; in a browser with a read-only stand-in wallet the page listed that wallet's real history with correct labels and amounts, and the airdrop card opened the create form with the airdrop type and secret-code mode selected.

Limits: the explorer index can lag a few seconds behind the chain, and it is a third-party service. If it is down the page says so and offers retry.

## Phase 4 report: swap and bridge

Built on Circle App Kit (`@circle-fin/app-kit` 1.21, `@circle-fin/adapter-viem-v2` 1.20), loaded lazily so the rest of the app stays small. Swap and bridge are permissionless: **no kit key and no backend are used**, and the user's own wallet signs every transaction. Nothing is hard-coded: quotes, fees and routes come live from the kit.

- **`/swap`**: swap on Arc Testnet between USDC and EURC (or any ERC-20 by contract address, shown as unverified). Flow: choose tokens and amount, pick a slippage tolerance (0.5%, 1%, 3%), **Review quote** (live `estimateSwap`), see the estimated and minimum output, fees and network, then click the swap button. Quotes expire after 60 seconds and any change of input invalidates them. USDC to native is not offered, because on Arc native gas and USDC are the same asset. Users are told the trade is routed through a third-party aggregator (currently LiFi).
- **`/bridge`**: CCTP V2 between Base Sepolia and Arc Testnet in both directions. Live quote (`estimateBridge`) with fees and gas, the four CCTP steps (approve, burn, attestation, mint) shown live with explorer links, an option to let Circle's forwarding service complete the mint (no destination gas needed, small fee), and **Continue from the failed step** using `retryBridge` so a failure never means starting over or paying twice.
- **Balances**: the dashboard wallet panel shows USDC on Arc, EURC on Arc and USDC on Base Sepolia, read from the chains.
- Token addresses come from Circle's published USDC and EURC testnet tables (Arc USDC `0x3600…0000`, Arc EURC `0x89B5…D72a`, Base Sepolia USDC `0x036C…CF7e`); a test pins them. Base Sepolia was added to the wagmi config as the other end of the bridge.

Verified live against Arc Testnet with the real kit (read-only, throwaway key, nothing signed): USDC to EURC and EURC to USDC both returned live quotes through LiFi (1 USDC about 1.10 EURC at the time), and both bridge directions returned fee and gas estimates. In a browser with a read-only stand-in wallet the real UI produced a live quote for a wallet holding testnet USDC, asked for the wallet signature, and handled a refusal for both swap and bridge (the bridge showed the failed approve step and the Continue button).

Not verified: a completed swap or bridge with a real signature (needs a wallet with testnet USDC and gas on both chains).

Limits and open items:
- **cirBTC**: no verified contract address or support entry was found in Circle's documentation or the App Kit package, so it is not offered. The custom-token field accepts an address, reads its symbol and decimals from the chain, labels anything reporting the symbol cirBTC as wrapped Bitcoin (not native BTC), and always marks custom tokens unverified. Please supply the official address if cirBTC support is required.
- **Base mainnet and other chains**: the app is testnet-only by design. App Kit supports many more chains, but they are not enabled, and mainnet needs your explicit go-ahead.
- Cross-chain swaps and multi-leg routes are not offered; only same-chain swaps on Arc Testnet and the USDC bridge.
- The bridge page keeps progress in memory. If the tab is closed mid-transfer, use the transaction links already shown and check the explorer before retrying.

Changed: `src/pages/Swap.tsx`, `src/pages/Bridge.tsx`, `src/lib/appkit.ts`, `src/lib/tokens.ts`, `src/hooks/useToken.ts`, `src/config.ts`, `src/components/Layout.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Privacy.tsx`, `src/App.tsx`, `src/lib/swapbridge.test.ts`.

Verified: typecheck, lint, 42 frontend tests (8 new), production build within the 1.28 GB heap cap.

## Phase 3 report: payments

- **`/send`**: a plain USDC `transfer` to one wallet, with no escrow and no claim step. Balance check, address validation (rejects malformed, zero, USDC-contract and GiftFlowPay-contract addresses), warning for your own wallet, an estimated network fee, a confirmation dialog, and a success screen only after the receipt is confirmed. The fee estimate is gas times the network's fee per gas, shown with 18-decimal precision because Arc pays fees in USDC at 18 decimals while the USDC token has 6.
- **`/payroll`**: one-off payroll from a table or CSV (wallet, amount, label). Every row needs a wallet. One run creates a private campaign on the existing contract (funds are pulled in one transaction after one approval) and then pushes the money to every wallet with the contract's batch `distribute` (50 wallets per transaction, so 100 employees take 2 payout transactions). Before each batch the app reads which wallets are already paid from the chain, so a resumed run never pays anyone twice. If a payout fails, the unpaid part stays in the contract and the page offers "Continue sending"; whatever is still unpaid after 30 days can be refunded from the campaign page. The page shows "paid, confirmed onchain" counts read from the contract and offers a CSV receipt (label, wallet, amount, paid or unpaid).
- Shared table: the recipient editor became `src/components/RowsEditor.tsx`, used by campaigns and payroll.

No contract change. Payroll metadata uses the campaign type `payroll`.

Changed: `src/pages/SendPayment.tsx`, `src/pages/Payroll.tsx`, `src/components/RowsEditor.tsx`, `src/components/create/RecipientsStep.tsx`, `src/lib/payroll.ts`, `src/lib/format.ts` (fee formatting), `src/lib/flow.ts`, `src/components/Layout.tsx`, `src/pages/Dashboard.tsx`, `src/App.tsx`, `src/lib/payroll.test.ts`.

Verified: typecheck, lint, 34 frontend tests (12 new: validation, exact amounts, CSV, batching, resume, receipt, fee display), production build; a 100-row CSV imported in a browser (100 employees, 5 pages, 4 transactions, 500 USDC total); send-page address checks.

Not verified: a funded payroll or payment on Arc Testnet (needs a wallet with testnet USDC). The contract side (private campaign, wallet-bound batch distribute up to 100, double-pay protection) is covered by the Foundry suite.

Limits: payroll amounts and wallets are public on the block explorer, as with any transfer. Recurring or scheduled payroll, per-employee streams and company roles need new contracts (`PayrollManager`, `CompanyAccessManager`) and a decision on scope; they are not part of this phase.

## Phase 1 report

Changed: `src/index.css` (design tokens), `src/components/Layout.tsx` (public layout and app shell), `src/App.tsx` (route split), `src/pages/Dashboard.tsx`, `src/pages/Landing.tsx`, `src/components/HeroCard.tsx`, `src/main.tsx` (dark wallet modal), brand strings, `index.html`.

Verified: typecheck, lint, 7 unit tests, production build; pages inspected in a browser against live Arc Testnet data.

Not done in this phase, on purpose: sidebar entries for features that do not exist yet (payroll, swap, contacts, company). They will appear with their phases rather than as dead links.

Unresolved: Google and email login (needs a provider), WalletConnect (needs a project ID), Swap and Bridge (needs the Circle kit key), PRD v5.0 not available.
