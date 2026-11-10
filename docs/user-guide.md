# User guide

You need an EVM wallet (for example MetaMask) on Arc Testnet and some testnet USDC. USDC is also Arc's gas token, so no separate gas token is required.

## Organizers

1. **Connect** your wallet. If you are on another network, use the "Switch to Arc Testnet" button.
2. Open **Create a campaign** and fill in:
   - name, description, campaign type and an optional message for recipients
   - claim window (start time and deadline)
   - public or private (public campaigns publish the recipient list so anyone can verify it)
3. **Choose how people get paid** on the Recipients step:
   - **Wallet list** (default): you know each wallet, for example monthly salaries. Add rows or import a CSV. Everyone opens the same campaign page, connects their wallet and claims, or you use **Send directly** to push everything in a few transactions.
   - **One shared link**: equal shares for people without a wallet on file, for example 100 people at 5 USDC. You get a single link. Anyone who has it connects a wallet and claims one share until all are taken. The same wallet can claim more than one share, so only send it to people you trust.
   - **Secret codes**: equal shares with one personal code per person (like `K7QX-9M2P-4TWD`). Each code works once, so each person gets exactly one share. You get a code sheet (name, code, link) as a CSV. Names you type stay in your browser and only label the sheet.

   For a wallet list, add recipients row by row or by importing a CSV. Columns: `wallet` (optional), `amount`, `label` (optional); a header row with `amount` is detected automatically. A row with a wallet is wallet-bound. A row without a wallet becomes a personal claim link.
4. **Review and fund.** The review step shows the total, your USDC balance and the allowance. Confirm in the dialog. If any recipient is link-based you will first sign a free message (it creates the claim keys; it does not move funds). Then approve USDC if needed and create the campaign. Success is shown only after the transaction confirms.
5. **Share links.** For a shared link, copy it from the result screen (you can get it again later from the Recipients page by signing with the creator wallet). For other modes, download the claim-links CSV from the result screen or later from the campaign's **Recipients** page. Wallet-bound recipients can also just open the claim page with their wallet.
6. **Track progress** on the campaign page: funded, claimed, remaining, refundable, recipient status and transactions.
7. **Distribute directly** (optional): on the Recipients page, push all unclaimed wallet-bound allocations to their wallets in batches while the campaign is active.
8. **Refund** after the deadline to recover whatever was not claimed. **Cancel** is available only before the start time and returns everything.

Private campaigns: the recipient list is not stored onchain. Keep the CSV you funded with. To manage the campaign later, load the same CSV (same order and amounts) on the Recipients page; it is accepted only if it reproduces the onchain commitment.

## Send payment

Open **Send payment**, enter one wallet address and an amount, check the estimated network fee and confirm. The transfer goes straight to that wallet and cannot be recalled. The page shows success only after the network confirms it.

## Payroll

Open **Payroll**, name the run, then add employees one by one or import a CSV (`wallet,amount,label`). Every row needs a wallet. Choose **Fund and pay**: after one USDC approval, the total is funded in one transaction and then paid out to every wallet (50 per transaction). The page shows how many wallets are paid, confirmed on the chain. If something fails partway, use **Continue sending**; unpaid money stays in the contract and can be refunded after 30 days. Download the CSV receipt when done. Employee labels stay in your browser; wallets and amounts are visible on the explorer like any transfer.

## Gift cards

Open **Gift cards** in the sidebar. Choose an amount and design, write the names and message, pick how the recipient claims and how long the gift stays open, then fund it. Success, the link, the QR code and the downloadable PNG appear only after the network confirms the funding transaction.

- **Secret code**: send the claim link (or QR or PNG) and, in a separate message, the code. The recipient opens the link, types the code, connects a wallet and claims.
- **Specific wallet**: only the wallet you enter can claim. The link and QR are safe to share publicly.
- **Anyone with the link**: whoever opens the link or scans its QR can claim, so share it only with the recipient. The PNG does not include a QR for this method.

If nobody claims the gift before it expires, refund it from the campaign page.

## Recipients

1. Open your claim link. For a wallet-bound allocation, connect the exact wallet the organizer listed. For a secret-code campaign, type your code (or use the personal link that fills it in). For a shared link, just open it. You need a small USDC balance in your wallet to pay the network fee, because Arc uses USDC for gas.
2. The page shows the amount, campaign information and deadline, and checks eligibility against the contract.
3. Click **Claim**, confirm in your wallet and wait for the confirmation. The USDC goes to the connected wallet.

If the page says the allocation is already claimed, the window is closed, or the wallet is not eligible, the contract would reject the transaction too.

## Anyone

Open **Verify** (or `/verify/<campaign id>`) to check a campaign without a wallet: creator, funded and claimed totals, remaining and refundable amounts, status, recipients (public campaigns) and transactions. For public campaigns the page rebuilds the recipient tree in your browser and compares it with the onchain commitment.
