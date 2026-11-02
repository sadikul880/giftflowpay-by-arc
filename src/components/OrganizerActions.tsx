import { useState } from 'react'
import { Ban, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTxAction } from '@/hooks/useTx'
import { useWallet } from '@/hooks/useFlow'
import { flowAbi } from '@/lib/abi'
import type { CampaignView } from '@/lib/chain'
import { publicClient } from '@/lib/events'
import { campaignState, refundableOf } from '@/lib/flow'
import { fmtDate, fmtUsd } from '@/lib/format'
import { contractAddress } from '@/lib/network'
import { ConfirmDialog, Notice, TxLink, WalletGate } from './ui'

type Action = 'refund' | 'cancel'

export function OrganizerActions({ view, now, onChanged }: { view: CampaignView; now: number; onChanged: () => void }) {
  const w = useWallet()
  const tx = useTxAction()
  const [pending, setPending] = useState<Action>()
  const [lastHash, setLastHash] = useState<string>()
  const c = view.campaign
  const state = campaignState(c, now)
  const refundable = refundableOf(c, now)
  const canCancel = state === 'scheduled'

  if (!w.address || w.address.toLowerCase() !== c.creator.toLowerCase()) return null

  async function perform(action: Action) {
    if (!w.address) return
    const owner = w.address
    const res = await tx.run(async (_s, write) => {
      const { request } = await publicClient.simulateContract({
        account: owner,
        address: contractAddress(),
        abi: flowAbi,
        functionName: action === 'refund' ? 'refund' : 'cancelCampaign',
        args: [view.id],
      })
      return write(request)
    })
    setPending(undefined)
    if (res) {
      setLastHash(res.transactionHash)
      toast.success(action === 'refund' ? 'Refund confirmed onchain' : 'Campaign cancelled and refunded')
      onChanged()
    }
  }

  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Organizer actions</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Only the wallet that created this campaign can use these.</p>
      </div>
      {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
      {lastHash ? <div><TxLink hash={lastHash} label="Latest transaction confirmed" /></div> : null}
      <WalletGate>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={refundable === 0n || tx.busy} onClick={() => setPending('refund')}>
            <Undo2 className="size-4" /> Refund ${fmtUsd(refundable)}
          </button>
          {canCancel ? (
            <button type="button" className="btn btn-secondary" disabled={tx.busy} onClick={() => setPending('cancel')}>
              <Ban className="size-4" /> Cancel campaign
            </button>
          ) : null}
        </div>
      </WalletGate>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {c.cancelled
          ? 'This campaign was cancelled and its funds were returned.'
          : refundable > 0n
            ? 'The claim window has closed. You can take back everything that was not claimed.'
            : state === 'expired' || state === 'completed'
              ? 'Nothing is left to refund.'
              : `Refunds open after the claim deadline (${fmtDate(c.claimDeadline)}).${canCancel ? ' Until claims open you can cancel for a full refund.' : ''}`}
      </p>

      <ConfirmDialog
        open={pending === 'refund'}
        title="Refund unclaimed funds?"
        description="The unclaimed USDC returns to your wallet. This can only be done once."
        rows={[['Refund', `${fmtUsd(refundable)} USDC`], ['Campaign', view.meta?.n || `#${view.id}`]]}
        confirmLabel="Refund"
        busy={tx.busy}
        onCancel={() => setPending(undefined)}
        onConfirm={() => void perform('refund')}
      />
      <ConfirmDialog
        open={pending === 'cancel'}
        title="Cancel this campaign?"
        description="All funds return to your wallet and recipients can no longer claim. This cannot be undone."
        rows={[['Refund', `${fmtUsd(c.totalAllocation)} USDC`], ['Campaign', view.meta?.n || `#${view.id}`]]}
        confirmLabel="Cancel campaign"
        danger
        busy={tx.busy}
        onCancel={() => setPending(undefined)}
        onConfirm={() => void perform('cancel')}
      />
    </section>
  )
}
