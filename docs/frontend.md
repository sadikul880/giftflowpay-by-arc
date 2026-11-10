# Frontend

React 18 + Vite + TypeScript, Tailwind CSS, wagmi v2 / viem v2 with an injected wallet (ConnectKit UI), react-router, TanStack Query, Sonner toasts and Lucide icons. Light theme, restrained green accent, no emojis.

## Routes

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `Landing` | Product overview and live contract totals |
| `/dashboard` | `Dashboard` | Wallet overview: campaigns, funded, distributed, pending, unclaimed, USDC balance |
| `/campaigns` | `Campaigns` | List of campaigns with status |
| `/rewards` | `Rewards` | Reward campaign starting points and your latest campaigns |
| `/transactions` | `Transactions` | Wallet history from the explorer index: labelled transactions and token transfers |
| `/swap` | `Swap` | Swap on Arc Testnet through Circle App Kit, live quote before signing |
| `/bridge` | `Bridge` | CCTP bridge between Base Sepolia and Arc Testnet with live steps and retry |
| `/send` | `SendPayment` | One-wallet USDC transfer with fee estimate |
| `/payroll` | `Payroll` | CSV or manual payroll: fund once, pay in batches, receipt |
| `/gifts/new` | `GiftCreate` | Gift card creation, funding, QR code and PNG download |
| `/campaigns/new` | `Create` | Three-step creation: details, recipients, review and fund |
| `/campaigns/:id` | `CampaignDetails` | Organizer view: funding, claimed, remaining, refundable, actions, transactions |
| `/campaigns/:id/recipients` | `Recipients` | Recipient status, claim-link export (CSV), batch distribution, private-list import |
| `/claim`, `/claim/:id` | `Claim` | Recipient page: eligibility check, wallet connect, claim |
| `/verify`, `/verify/:id` | `Verify` | Public verification page, no wallet needed |
| `/activity` | `Activity` | Paginated event history |
| `/settings` | `Settings` | Network facts, USDC balance and allowance (with revoke), UI preferences |
| `/about`, `/privacy` | `About`, `Privacy` | What GiftFlow is and what data it does and does not touch |

Campaign states shown in the UI are derived from contract data: `scheduled`, `active`, `completed`, `expired`, `cancelled`. A draft exists only in memory before the creation transaction (`useDraft`).

The app has two shells (`src/components/Layout.tsx`). `PublicLayout` (top bar, no sidebar) serves `/`, `/about`, `/privacy`, `/claim` and `/verify`, which recipients and auditors open from a link. `AppLayout` (fixed sidebar, slide-over menu on phones) serves the organizer pages: `/dashboard`, `/campaigns*`, `/activity` and `/settings`. Design tokens (near-black surfaces, emerald borders, neon green actions) are CSS variables in `src/index.css`.

## Source layout

```
src/
  main.tsx, App.tsx, config.ts   providers, routes, wagmi config
  pages/                         one file per route (ClaimModes.tsx: open-link and secret-code claiming)
  components/                    layout, UI primitives, campaign parts, create steps
  hooks/
    useFlow.ts                   wallet, balance, allowance, campaign and global reads
    useTx.ts                     transaction runner: phases, confirmation, error handling
    useEventScanner.ts           windowed, paginated log scanning
    useRecipients.ts             organizer working copy of recipients, link generation
    useDraft.tsx                 in-memory campaign draft, payout mode (list, open link, codes)
  lib/
    abi.ts                       GiftFlow ABI
    chain.ts                     campaign loading, claimed flags, integrity check
    events.ts                    public client, log queries, event decoding
    flow.ts                      metadata, CSV parsing, claim keys, links, status helpers
    tree.ts                      Merkle sum tree (matches the contract)
    format.ts                    USDC formatting, error explanations
    network.ts                   active network, contract address, scan window
    explorerApi.ts               explorer API client, parsing, transaction labels
    rewards.ts                   reward campaign presets
    appkit.ts                    lazy Circle App Kit loader, wallet adapter, error messages
    tokens.ts                    verified token and bridge-chain facts, token formatting
    payroll.ts                   payroll validation, batching, receipt CSV
    gift.ts                      gift plans, designs, text wrapping
    giftPng.ts                   canvas renderer for the downloadable gift card PNG
    prefs.ts                     localStorage UI preferences
    share.ts                     share-link helpers
    transport.ts                 Arc RPC transport: batching plus provider fallback
  onchain-facts.ts, onchain-money.ts, onchain-wait.ts   Arc chain facts and USDC/receipt helpers
```

## Wallet and transaction handling

- Injected wallets only. Connect, disconnect, account change and chain change are handled by wagmi; `WalletGate` shows a connect or "switch to Arc Testnet" action when needed.
- USDC balance and allowance are read live. `approve` is sent only when the allowance is below the campaign total, and Settings can revoke it.
- Every write goes through `useTxAction`: simulate first, send, wait for the receipt, and only then show success. Rejections, reverts (mapped from custom errors), insufficient funds and RPC errors become readable messages.
- Important actions (fund, distribute, refund, cancel, revoke) use a confirmation dialog.
- Hash and explorer links are shown for confirmed transactions.

## Configuration

One build-time variable: `VITE_GIFTFLOW_ADDRESS_TESTNET` (see [deployment.md](deployment.md)). Chain ID, RPC, explorer and USDC address come from `src/onchain-facts.ts`.

The `installShareSync()` call in `src/main.tsx` and `src/lib/share.ts` come from the Arc Studio scaffold; they only talk to a parent frame when the app is embedded inside Studio.
