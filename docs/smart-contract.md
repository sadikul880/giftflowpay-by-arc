# Smart contract: `GiftFlow`

Source: [`contracts/GiftFlow.sol`](../contracts/GiftFlow.sol). Solidity `^0.8.20` (compiled with 0.8.28, Cancun EVM), OpenZeppelin 5.6.1: `SafeERC20`, `ReentrancyGuard`, `Pausable`, `Ownable2Step`, `EIP712`, `ECDSA`.

The token is a constructor argument (`USDC`), never a hardcoded address. It must be a standard, non-fee-on-transfer, 6-decimal USDC. The deploy script reads the Arc Testnet USDC address from `src/onchain-facts.ts`.

## Campaign

| Field | Meaning |
| --- | --- |
| `creator` | Funding wallet; the only wallet that can distribute, refund or cancel |
| `createdAt`, `startTime`, `claimDeadline` | Schedule. A `startTime` in the past is normalised to now |
| `merkleRoot` | Root of the Merkle sum tree over all allocations |
| `totalAllocation` | USDC (6 decimals) deposited and committed |
| `claimed`, `refunded` | Running totals paid out / returned |
| `recipientCount`, `claimedCount` | Allocation counts |
| `isPublic` | Public campaigns publish the full recipient list in an event |
| `cancelled` | Set by `cancelCampaign` |

Outstanding balance for a campaign is `totalAllocation - claimed - refunded` (zero once cancelled). Claimed allocations are tracked in a per-campaign bitmap (`isClaimed(campaignId, index)`).

## Functions

| Function | Caller | Behavior |
| --- | --- | --- |
| `createCampaign(params, metadata, recipientsData)` | anyone, not paused | Validates, stores the campaign and pulls `totalAllocation` USDC with `safeTransferFrom` atomically. Public campaigns must pass the packed recipient rows; the contract recomputes the sum tree and requires root and total to match |
| `claim(campaignId, allocation, proof, sigDeadline, signature)` | the payee, not paused | Verifies window, proof and bitmap. Wallet-bound: `msg.sender` must equal the committed wallet. Link-based: requires an EIP-712 signature by the claim key over `(campaignId, index, msg.sender, deadline)`. Always pays `msg.sender` |
| `distribute(campaignId, entries)` | creator, not paused | Pays 1-100 wallet-bound allocations to their committed wallets. Any invalid entry reverts the whole batch |
| `refund(campaignId)` | creator | After `claimDeadline`, returns the unclaimed remainder once. Works while paused |
| `cancelCampaign(campaignId)` | creator | Strictly before `startTime`, returns the full total and marks the campaign cancelled. Works while paused |
| `getCampaign`, `isClaimed`, `refundable`, `claimDigest` | view | Reads used by the UI |
| `pause` / `unpause` | owner | Blocks create, claim and distribute. Refund and cancel stay available so funds are never trapped |
| `setMaxTotalAllocation(value)` | owner | Cap for future campaigns (default 1,000,000 USDC, hard ceiling 100,000,000 USDC) |

`renounceOwnership` is disabled. The owner can pause and change the cap but has **no** function to withdraw campaign funds or change any campaign.

## Limits

| Limit | Value |
| --- | --- |
| Recipients per campaign | 10,000 private, 1,000 public (the app caps private at 4,096) |
| Claim window (start to deadline) | 1 hour to 730 days |
| Start delay | up to 365 days |
| Metadata | 2,048 bytes |
| Direct-distribution batch | 100 (the app sends 50) |
| Total allocation | at least 1 base unit per recipient, at most `maxTotalAllocation` |

## Events

`CampaignCreated`, `RecipientsPublished`, `Claimed` (includes a `direct` flag), `Refunded`, `CampaignCancelled`, `MaxTotalAllocationUpdated`, plus OpenZeppelin's `Paused`, `Unpaused` and ownership events.

## Errors

Custom errors for every failure path, for example `InvalidProof`, `AlreadyClaimed`, `WalletMismatch`, `ClaimsNotStarted`, `ClaimWindowClosed`, `RefundNotAvailable`, `NothingToRefund`, `NotCampaignCreator`, `CancellationNotAllowed`. The frontend maps these to readable messages.
