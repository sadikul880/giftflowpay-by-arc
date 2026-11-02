# User guide

You need an EVM wallet (for example MetaMask) on Arc Testnet and some testnet USDC. USDC is also Arc's gas token, so no separate gas token is required.

## Organizers

1. **Connect** your wallet. If you are on another network, use the "Switch to Arc Testnet" button.
2. Open **Create a campaign** and fill in:
   - name, description, campaign type and an optional message for recipients
   - claim window (start time and deadline)
   - public or private (public campaigns publish the recipient list so anyone can verify it)
3. **Add recipients**, either row by row or by importing a CSV. Columns: `wallet` (optional), `amount`, `label` (optional); a header row with `amount` is detected automatically. A row with a wallet is wallet-bound. A row without a wallet becomes a personal claim link.
4. **Review and fund.** The review step shows the total, your USDC balance and the allowance. Confirm in the dialog. If any recipient is link-based you will first sign a free message (it creates the claim keys; it does not move funds). Then approve USDC if needed and create the campaign. Success is shown only after the transaction confirms.
5. **Share links.** Download the claim-links CSV from the result screen or later from the campaign's **Recipients** page. Wallet-bound recipients can also just open the claim page with their wallet.
6. **Track progress** on the campaign page: funded, claimed, remaining, refundable, recipient status and transactions.
7. **Distribute directly** (optional): on the Recipients page, push all unclaimed wallet-bound allocations to their wallets in batches while the campaign is active.
8. **Refund** after the deadline to recover whatever was not claimed. **Cancel** is available only before the start time and returns everything.

Private campaigns: the recipient list is not stored onchain. Keep the CSV you funded with. To manage the campaign later, load the same CSV (same order and amounts) on the Recipients page; it is accepted only if it reproduces the onchain commitment.

## Recipients

1. Open your claim link. For a wallet-bound allocation, connect the exact wallet the organizer listed.
2. The page shows the amount, campaign information and deadline, and checks eligibility against the contract.
3. Click **Claim**, confirm in your wallet and wait for the confirmation. The USDC goes to the connected wallet.

If the page says the allocation is already claimed, the window is closed, or the wallet is not eligible, the contract would reject the transaction too.

## Anyone

Open **Verify** (or `/verify/<campaign id>`) to check a campaign without a wallet: creator, funded and claimed totals, remaining and refundable amounts, status, recipients (public campaigns) and transactions. For public campaigns the page rebuilds the recipient tree in your browser and compares it with the onchain commitment.
