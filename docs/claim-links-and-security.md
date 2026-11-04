# Claim links and security

## Merkle sum tree

Allocations are committed as a tagged Merkle **sum** tree:

- leaf: `keccak256(abi.encode(0, index, account, amount, walletBound))`, sum = `amount`
- node: `keccak256(abi.encode(1, leftHash, leftSum, rightHash, rightSum))`, sum = `leftSum + rightSum`
- the tree is padded to a power of two with `(0x00, 0)` leaves

The contract checks that a proof reproduces both the stored root **and** the stored `totalAllocation`. Because sums are part of every node, a valid proof also proves the allocations add up to the funded total, so the organizer cannot commit to more than they deposited. The same logic exists in TypeScript (`src/lib/tree.ts`) and Solidity.

For public campaigns the contract rebuilds the whole tree from the published rows during `createCampaign` and rejects any mismatch. For private campaigns the rows are never published, so the sum-tree integrity of a private campaign cannot be authenticated onchain. A claim only succeeds when the leaf's proof sums to exactly the funded total, and total claims can never exceed `totalAllocation` (`AllocationExceeded`).

## Two kinds of allocation

1. **Wallet-bound** (`walletBound = true`): the leaf names a wallet. Only that wallet can call `claim`; the organizer can alternatively push it with `distribute`. No secret exists.
2. **Link-based** (`walletBound = false`): the leaf names a *claim key address*. The matching private key is in the recipient's link. To claim, the browser signs an EIP-712 `Claim(campaignId, index, recipient, deadline)` message with that key, where `recipient` is the connected wallet. The contract recovers the signer and requires it to equal the leaf's account. A copied transaction cannot redirect funds because the signature binds the recipient.

## Claim keys

For link-based recipients the organizer signs one free message (it names the contract, chain and a public per-campaign salt). `keccak256(signature)` is the campaign master secret, and each recipient's key is `keccak256(master, index)`. This lets the organizer regenerate every link later by signing again. Keys are never sent to a server and never appear in calldata or events; only the key's **address** is committed in the tree.

## Payout modes (equal shares without wallets)

The payout mode is stored in the public campaign metadata (`k`: `list`, `open` or `codes`) so the claim page knows what to show. It is a UI convention only; the contract sees ordinary link-based allocations.

- **Open link.** Every share's claim key is `keccak256(master, index)`. The link carries the master secret, so any holder can derive the keys. The claim page picks a random free share (using `isClaimed`), signs the claim with that key for the connected wallet and submits it. If two people pick the same share, the second transaction reverts with `AlreadyClaimed` and the page picks another. The contract cannot tell two claims by the same wallet apart, so one person can take several shares with one link. Use secret codes when each person must get exactly one.
- **Secret codes.** Code `i` is 12 characters from a 31-symbol alphabet (about 59 bits), derived from the master secret so the organizer can list the codes again later by signing. The claim key behind a code is `keccak256("giftflow:<campaign salt>:<code>")`. Leaf addresses are public, so an attacker could try to guess codes offline; 59 bits makes that impractical, which is why codes are generated and names are never used as secrets.
- Both modes force a public campaign, because the claim page needs the published recipient list to find the share.

## Link formats

All links are built with `buildShareLink()` (`src/lib/share.ts`).

| Campaign / recipient | Link |
| --- | --- |
| Public, wallet-bound | `/claim/<id>?r=<wallet>` (an address, not a secret) |
| Public, link-based | `/claim/<id>#k=<claim key>` |
| Private (either kind) | `/claim/<id>#p=<payload>` with index, amount, account, optional key and the Merkle proof |
| Open link (public campaign) | `/claim/<id>#m=<master secret>`: the holder can claim any free share |
| Secret code (public campaign) | `/claim/<id>` plus a typed code, or `/claim/<id>#c=<code>` |

Secrets live only in the URL **fragment**, which browsers never send to servers. Do not move them into the path or query.

## Protections

| Risk | Mitigation |
| --- | --- |
| Reentrancy | `nonReentrant` on every state-changing function; state is updated before transfers |
| Unsafe token transfers | `SafeERC20` |
| Double claim | per-campaign claimed bitmap, set before the transfer |
| Replay / front-running | signature binds campaign, index, recipient and deadline; allocations are single-use |
| Unauthorized claim | wallet-bound check or key signature, enforced by the contract |
| Over-allocation | sum tree must equal the funded total; funding is atomic with creation |
| Double refund | `refunded` is tracked; a zero remainder reverts with `NothingToRefund` |
| Unauthorized refund | creator-only |
| Operator abuse | no owner withdrawal, no upgrade path, ownership renounce disabled, pause cannot block refund or cancel |
| Wrong decimals | all amounts are 6-decimal base units; the UI parses with `parseUsdc` |

## Known limits and caveats

- Campaign names, messages and public recipient lists are public onchain data. The UI warns users not to include private information.
- Anyone holding a link-based claim link can claim that allocation. Treat such links like cash.
- A private campaign's recipient list exists only in the organizer's CSV and links. Losing the CSV means losing the ability to manage it (links already issued keep working).
- The contract assumes a standard USDC (no fee-on-transfer, no rebasing).
- The contract has not been audited by a third party. Get an audit before holding significant value.
