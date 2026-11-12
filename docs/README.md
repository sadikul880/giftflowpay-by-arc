# GiftFlow documentation

GiftFlow is a non-custodial USDC distribution platform on Arc. An organizer creates a campaign, deposits the full USDC total into one smart contract, and recipients claim their allocation with a wallet or a personal link. There is no database and no backend: all authoritative state lives in the `GiftFlow` contract and its events.

| Document | What it covers |
| --- | --- |
| [product-plan.md](product-plan.md) | Phase 0 audit and phased plan for the GiftFlowPay product (what exists, what each feature needs) |
| [architecture.md](architecture.md) | System overview, data flow, what lives onchain and what does not |
| [smart-contract.md](smart-contract.md) | `GiftFlow.sol`: storage, functions, events, errors, limits |
| [claim-links-and-security.md](claim-links-and-security.md) | Merkle sum tree, claim keys, link formats, threat model |
| [frontend.md](frontend.md) | Pages, source layout, hooks, wallet and transaction handling |
| [user-guide.md](user-guide.md) | Step-by-step for organizers and recipients |
| [support-and-admin.md](support-and-admin.md) | Support inbox, admin panel, the API behind them, what is stored |
| [deployment.md](deployment.md) | Arc Testnet deployment, environment variables, Docker and Coolify |
| [testing.md](testing.md) | Contract tests, frontend checks, live end-to-end script |
| [audit.md](audit.md) | Findings, fixes and known limits from the latest review |
| [presentation/](presentation/GiftFlow-presentation.pptx) | 16-slide project presentation (PowerPoint and PDF) with screenshots of the running app |
| [feature-status.md](feature-status.md) | Every requested feature: done, partial or not built, with the reason |
| [mainnet-readiness.md](mainnet-readiness.md) | Checklist for going live on mainnet (not configured yet) |
| [roadmap.md](roadmap.md) | How the design leaves room for vesting, milestones and attestations |

## Quick facts

- Network: Arc Testnet, chain ID `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`.
- Token: USDC at `0x3600000000000000000000000000000000000000`, 6 decimals (also Arc's native gas token).
- Contract (Arc Testnet): `0xa4b97bda0785ab417d0cce128a9fb9449139ee2c`.
- Mainnet: intentionally not configured. It is added only after an explicit decision, deployed from the operator's own wallet.
- Stack: Solidity 0.8.28, OpenZeppelin 5.6.1, Foundry; React 18, Vite, TypeScript, Tailwind, wagmi, viem, ConnectKit.
