# Roadmap and extension points

The MVP is a fully funded, Merkle-authorized distribution contract. These features are not implemented; this page records how the current design leaves room for them without changing what is already deployed.

| Feature | How it fits |
| --- | --- |
| Scheduled payments | Already partly present: `startTime` delays claims, and `cancelCampaign` works before it. A recurring schedule would be a new module creating campaigns with later start times |
| Linear vesting and cliffs | New `VestingModule` that holds funds per allocation and releases by time. Leaves would carry vesting parameters, committed in the same tree format with a new leaf tag |
| Milestone rewards | Leaves reference a milestone ID; claims require the creator (or a multisig) to mark the milestone complete, or a signed attestation |
| Admin-approved conditional rewards | An approver address per campaign; `claim` would additionally check an approval record |
| Shared reward pools | A campaign without fixed per-wallet leaves, where claims are authorized by attestations up to a pool cap |
| Signed attestations | The claim path already verifies EIP-712 signatures. An attestation signer per campaign would reuse that pattern for external task completion |

A smart contract cannot verify real-world events such as GitHub contributions or course completion. Any such condition needs an authorized verifier, a multisig approval, or a signed attestation from a trusted party, and GiftFlow will not claim otherwise.

Other planned work: third-party security audit, a Mainnet configuration and deployment path (explicit go-ahead required), a dedicated RPC configuration option, and QR codes for claim links.
