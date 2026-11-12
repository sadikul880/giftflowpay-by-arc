# Support and Admin

GiftFlowPay has one piece of server-side state: the Support inbox. Everything about money (campaigns, balances, claims, refunds, swaps) stays onchain or in the user's wallet. This page describes what the Support service stores, how people sign in, and what the admin can see.

## What a user does

1. Open **Support**, connect a wallet and press **Sign in with wallet**. This is one free message signature (no transaction, no gas).
2. Press **New message**, choose Question, Report an issue or Suggestion, write the message and send it.
3. The conversation appears under **Your conversations** with its status (Waiting for reply, Answered, Closed). When the team replies, the conversation gets a green dot, and the Support entry in the dashboard sidebar shows a count of unread replies. Opening the conversation marks it read. The user can add more messages to the same conversation; writing in a closed one reopens it.

`/feedback` (the old separate page) redirects to Support.

## What the admin does

The **Admin** entry appears in the dashboard sidebar only while the connected wallet equals `ADMIN_WALLET`. Any other wallet does not see it, and opening `/admin` by URL sends them to the dashboard. The API does not trust the page: every admin request needs a session made by signing in with the admin wallet, and anything else gets 403.

- **Overview**: open and closed conversations, how many wait for a reply, replies sent, users, active users (7 days), new users (24 hours), sign-ins, a 14-day chart of new conversations and new users, the split by type, and the contract totals read from Arc (campaigns, funded, claimed, refunded).
- **Inbox**: all conversations, filter by status and type, search by wallet, subject or text, 10 per page. Open one to read the thread, **Send reply**, **Reply and close**, or **Close** and **Reopen**. The user sees the reply the next time they open Support (the page also refreshes every 20 to 30 seconds).
- **Users**: wallets that signed in to Support, most recent first, 10 per page, search by address, with first seen, last seen, sign-ins and conversation counts. This is not a list of every wallet that used the contract: GiftFlowPay has no accounts, so only wallets that signed in to Support are known.

## Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `ADMIN_WALLET` | the `api` service (`.env` locally, the resource's environment in Coolify) | The one wallet that gets the admin panel. Not a secret, and not read by the browser: the page learns it from `GET /api/config`. If unset or invalid, the admin panel is disabled |
| `DATA_DIR` | the `api` service | Folder of the SQLite file `support.db` (`/data`, a Docker volume, in compose) |
| `PORT` | the `api` service | Defaults to 8787 |

Back up the `support-data` volume if the conversations matter. Without it, a redeploy that drops volumes loses them.

## How it fits together

```
browser -> nginx (web) -- /api/* --> api (Node 22, node:sqlite, viem) --> /data/support.db
```

- `server/app.mjs` is the whole API (`createApp`), `server/db.mjs` the schema, `server/index.mjs` the entry point. The only dependency is `viem`, used to verify signatures.
- Local development: `bun run dev:api` (reads `.env`), and Vite proxies `/api` to it.
- Sign-in: `POST /api/auth/nonce` returns a message to sign (it names the wallet and a single-use nonce valid for 5 minutes); `POST /api/auth/verify` recovers the signer, and on a match returns a random session token valid for 12 hours. The server stores only the SHA-256 of the token. The browser keeps the token in `sessionStorage` for that tab only. Smart-contract wallets are not supported (the check is plain signature recovery).
- Authorization: user routes only ever touch conversations whose wallet equals the session's wallet; admin routes require the session wallet to equal `ADMIN_WALLET`.

## Limits and abuse protection

- Each message is at most 2000 characters, subjects 80; request bodies at most 16 KB (nginx also caps at 32 KB).
- A wallet can open 5 conversations per hour and send 20 follow-up messages per hour; sign-in requests are limited per IP. Limits are in memory and reset when the API restarts.
- Text is stored as plain text and shown by React, which escapes it; control characters are stripped.

## What is stored (and what is not)

Stored: wallet address, message text, timestamps, conversation status, sign-in count and times. Not stored: IP addresses, user agents, emails, names, session tokens (only hashes), or anything about campaigns. The Privacy page says the same. The admin can read every conversation, so users are told not to send secrets. There is no deletion feature yet; remove rows from `support.db` by hand if someone asks.

## Tests

`node --test server/app.test.mjs` (also part of `bun run test`) runs the API against an in-memory database with real wallet signatures: sign-in, refused signatures, nonce reuse, ownership checks, unread flags, admin-only routes, filters and pagination, status changes, stats, rate limits, and the no-admin case. The page flows were also checked in a browser with a throwaway wallet.

## Not done

- Email or push notifications when a reply arrives (users see it when they return).
- Deleting or exporting conversations from the panel.
- Running more than one API instance (limits and SQLite are single-node).
