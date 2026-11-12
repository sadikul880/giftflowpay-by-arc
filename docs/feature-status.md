# Feature status

Compared with the GiftFlowPay master prompt (the Phase 0 audit in [product-plan.md](product-plan.md) has the history). Status: **Done** (built and checked), **Partial**, **Not built** (with the reason and what it needs). Last updated 2026-11-12.

## Product features

| # | Requirement | Status | Notes |
| --- | --- | --- | --- |
| 1 | Wallet connection and onboarding | Done | Injected wallets (MetaMask and others), network switch, wrong-network banner |
| 2 | Google and email login with embedded wallet | **Not built** | Needs an embedded-wallet provider (for example Circle's wallets) with a client key and an allowed domain. Credentials cannot be committed |
| 3 | MetaMask and WalletConnect | Partial | MetaMask works through the injected connector. WalletConnect needs a WalletConnect project ID, and its SDK is stubbed out of the production build (`vite.config.ts`) until then |
| 4 | Arc USDC wallet dashboard | Done | Live USDC, EURC and Base Sepolia USDC balances, address, explorer link |
| 5 | Digital gift card creation | Done | Amount, designs, names, message, expiry, three claim methods |
| 6 | Downloadable gift card PNG | Done | Created only after the funding transaction confirms |
| 7 | Real QR code | Done | Scans back to exactly the claim link (tested) |
| 8 | Shareable claim links | Done | Secrets only in the URL fragment |
| 9 | Optional secret code | Done | One code, one share |
| 10 | Gift expiry and refund | Done | Refund from the gift's page; link, code, QR and PNG can be re-created later by signing with the funding wallet |
| 11 | Direct USDC payments | Done | `/send`, with address checks and a fee estimate |
| 12 | Company payroll, CSV and manual | Partial | One-off payroll done (fund once, pay in batches, resume, receipt). Recurring or scheduled payroll needs the new `PayrollManager` contract |
| 13 | Community reward campaigns | Done | Presets, wallet list, shared link, secret codes |
| 14 | Swap | Done on testnet | Live USDC, EURC and cirBTC quotes on Arc Testnet. The cross-chain bridge was built and then **removed on request** (2026-11-12) |
| 15 | Arc, Base and supported token balances | Partial | Arc USDC and EURC and Base Sepolia USDC shown. Other tokens only through the swap page's address field |
| 16 | EURC and cirBTC | Done on testnet | Both are in the swap token list. cirBTC (`0xf0C4…32BF`, 8 decimals, "Circle Wrapped Bitcoin") comes from Circle App Kit's built-in token registry, and the contract on Arc Testnet reports symbol cirBTC. Whether a quote exists for a pair depends on live testnet liquidity; "no route" is shown plainly. It is wrapped Bitcoin, not native BTC |
| 17 | Transaction history | Done | Wallet history (labelled transactions and token transfers) plus contract-wide activity |
| 18 | Company management | **Not built** | Needs a product decision (Safe multisig or new `CompanyTreasury` contracts); see the Phase 5 report |
| 19 | Security and settings | Done | Allowance revoke, preferences, CSP, error boundary |
| 20 | Support and feedback | Done | One page, `/support`: a signed-in user writes to the team inside the site and reads the replies later. Stored by a small API with SQLite (`server/`), see [support-and-admin.md](support-and-admin.md). `/feedback` redirects to it |
| 22 | Admin panel | Done | `/admin`, shown in the dashboard sidebar only for the wallet in `ADMIN_WALLET`: inbox with replies, users with pagination, statistics |
| 21 | Official social links | Done | X `https://x.com/GiftFlowPay` and Telegram `https://t.me/GiftFlowPay` in both footers and Support |

## Platform requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Separate landing page and dashboard | Done | `PublicLayout` and `AppLayout` |
| Dark emerald design, responsive | Done | Checked at 375 px on every route: no horizontal overflow |
| No custody, no mock data | Done | Campaigns, balances and claims are contract reads, events and the public explorer index. The only server-side data is the Support inbox |
| Smart contracts: reentrancy, access control, replay protection, expiry and refund, pause, no admin withdrawal | Done | One `GiftFlow` contract; 123 tests, 10,000-run fuzzing, invariants, 98.7% line coverage |
| Separate `GiftCardEscrow`, `RewardCampaignManager` | By design | The single contract does both jobs |
| `PayrollManager`, `CompanyAccessManager` | **Not built** | See rows 12 and 18 |
| Arc Testnet deployment and docs | Done | Contract `0xa4b9…ee2c`; Docker and Coolify files |
| Mainnet | **Deliberately not configured** | See [mainnet-readiness.md](mainnet-readiness.md) |
| Independent security audit | **Not done** | Required before real value |
| Live funded run on Arc Testnet of gifts, payroll and swap | **Not done** | Needs a wallet with testnet USDC. The same logic runs end to end on a local chain (`bun run e2e:local`) and live quotes were checked read-only |

## Ideas from the reference design that were left out on purpose

- **Contacts**: an address book needs storage, and the rules forbid a database or browser storage of user data.
- **Scan QR to claim inside the app**: a phone camera already opens the claim link from a QR code.
- **Google sign-in button**: see row 2.
