# Architecture

## Principles

- **Money has no server.** Nothing about funds, campaigns or claims is stored off chain. The one exception is the Support inbox: a small API with SQLite holds support conversations, see [support-and-admin.md](support-and-admin.md). The site works without it; only Support and Admin need it.
- **The contract is the source of truth.** Funding, claims, refunds and cancellations are contract state. The UI never reports success before a transaction receipt is confirmed.
- **History comes from events and reads.** Dashboards, campaign pages and activity feeds are built from `getCampaign`, `isClaimed` and the contract's logs.
- **Browser storage is small.** `localStorage` holds three UI settings (`giftflow:prefs`): default visibility, default claim window, compact tables. `sessionStorage` holds the Support session token for that tab.

## Components

```
Organizer / recipient browser
  React app (static files, served by nginx; /api is forwarded to the Support API)
    wagmi + viem      -> injected wallet (MetaMask etc.)
    viem public client -> Arc RPC (reads, getLogs)
                               |
                          Arc Testnet
                            GiftFlow contract  <->  USDC (ERC-20, 6 decimals)
```

There is exactly one contract, `GiftFlow`. Campaigns are entries in its storage, not separate contracts, so creating a campaign costs one transaction regardless of how many recipients it has.

## Data flow

**Create** (organizer wallet)
1. The organizer enters campaign details and recipients (manual rows or CSV).
2. The browser builds a Merkle **sum** tree over the recipients and computes the root and total.
3. If any recipient has no wallet (link-based), the organizer signs a free message; the signature derives one claim key per such recipient.
4. USDC `approve` (only if the allowance is too low), then `createCampaign`, which pulls the whole total into the contract in the same transaction.
5. The UI waits for the receipt, reads the `CampaignCreated` event, and shows the claim links.

**Claim** (recipient wallet)
1. The recipient opens a claim link. The app reads the campaign from the contract and checks the proof locally.
2. Wallet-bound allocation: the recipient's wallet calls `claim`. Link-based allocation: the claim key in the link signs an EIP-712 message bound to the caller, and the wallet submits it with `claim`.
3. The contract verifies the Merkle proof, the window, the claimed bitmap and (for link-based) the signature, then transfers USDC to the caller.

**Direct distribution** (organizer wallet): `distribute` pays wallet-bound allocations to their committed wallets in batches (the app uses 50 per transaction; the contract allows up to 100).

**Refund / cancel** (organizer wallet): `refund` returns the unclaimed remainder after the deadline; `cancelCampaign` returns everything before the start time.

## What is stored where

| Data | Location |
| --- | --- |
| Campaign totals, claimed amount, deadline, Merkle root, status flags | Contract storage |
| Which allocation indexes are claimed | Contract storage (bitmap) |
| Campaign name, description, type, message | `CampaignCreated` event (public JSON, up to 2048 bytes) |
| Recipient list of a **public** campaign | `RecipientsPublished` event |
| Recipient list of a **private** campaign | Not onchain. Only the organizer's CSV and the claim links hold it |
| Claim keys | Never stored. Derived from the organizer's wallet signature, or carried in a link |
| UI preferences | `localStorage` |

## Event scanning

The Arc RPC rejects `eth_getLogs` ranges above roughly 10,000 blocks, so the app scans in 9,000-block windows (`EVENT_WINDOW_BLOCKS`), newest first, and never earlier than the contract's `DEPLOY_BLOCK`. The public RPC also rate-limits (HTTP 429) heavy scanning; use a dedicated RPC for production traffic (see [deployment.md](deployment.md)).
