import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Link2, Send, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { RecipientsTable } from '@/components/RecipientsTable'
import { ConfirmDialog, CopyButton, EmptyState, Notice, PageHeader, Skeleton, Spinner, WalletGate } from '@/components/ui'
import { useCampaign, useClaimedFlags, useNow, useWallet } from '@/hooks/useFlow'
import { useRecipientSource } from '@/hooks/useRecipients'
import { useTxAction } from '@/hooks/useTx'
import { flowAbi } from '@/lib/abi'
import { publicClient } from '@/lib/events'
import { campaignState, csvEscape, LIMITS } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'
import { downloadText } from '@/lib/links'
import { contractAddress } from '@/lib/network'
import { proofFor } from '@/lib/tree'

export default function Recipients() {
  const { id } = useParams()
  if (!id || !/^\d+$/.test(id)) return <EmptyState title="Campaign not found" body="This campaign number is not valid." action={<Link to="/campaigns" className="btn btn-secondary">All campaigns</Link>} />
  return <Manage id={BigInt(id)} />
}

function Manage({ id }: { id: bigint }) {
  const w = useWallet()
  const now = useNow()
  const q = useCampaign(id)
  const view = q.data
  const rec = useRecipientSource(view)
  const flags = useClaimedFlags(rec.source ? id : undefined, rec.source?.leaves.length, view?.campaign.claimedCount)
  const tx = useTxAction()
  const file = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState(false)
  const [progress, setProgress] = useState<string>()

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full !rounded-2xl" /></div>
  if (q.isError || !view) return <EmptyState title="Campaign not found" body="No campaign with this number exists on the current network." action={<Link to="/campaigns" className="btn btn-secondary">All campaigns</Link>} />

  const c = view.campaign
  const state = campaignState(c, now)
  const isOwner = w.address?.toLowerCase() === c.creator.toLowerCase()
  const src = rec.source
  const pending = src && flags.data ? src.leaves.filter((l) => l.walletBound && !flags.data?.[l.index]) : []
  const pendingTotal = pending.reduce((s, l) => s + l.amount, 0n)
  const canDistribute = isOwner && state === 'active' && pending.length > 0

  async function distribute() {
    if (!src || !w.address) return
    const owner = w.address
    const batches: (typeof pending)[] = []
    for (let i = 0; i < pending.length; i += LIMITS.batch) batches.push(pending.slice(i, i + LIMITS.batch))
    const ok = await tx.run(async (_s, write) => {
      for (let b = 0; b < batches.length; b++) {
        setProgress(`Batch ${b + 1} of ${batches.length}`)
        const entries = batches[b].map((l) => ({
          a: { index: BigInt(l.index), account: l.account, amount: l.amount, walletBound: true },
          proof: proofFor(src.tree, l.index),
        }))
        const { request } = await publicClient.simulateContract({ account: owner, address: contractAddress(), abi: flowAbi, functionName: 'distribute', args: [id, entries] })
        await write(request)
      }
      return true
    })
    setProgress(undefined)
    setConfirm(false)
    if (ok) {
      toast.success(`Sent ${pending.length} rewards directly`)
      void q.refetch()
      void flags.refetch()
    }
  }

  const exportLinks = () => {
    if (!src || !rec.links) return
    const lines = ['index,label,wallet,amount_usdc,code,claim_link', ...src.leaves.map((l) => [l.index + 1, csvEscape(src.labels.get(l.index) ?? ''), l.walletBound ? l.account : '', fmtUsd(l.amount).replace(/,/g, ''), rec.codes?.get(l.index) ?? '', csvEscape(rec.links?.get(l.index) ?? '')].join(','))]
    downloadText(`giftflow-campaign-${id}-claim-links.csv`, lines.join('\n'))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to={`/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> {view.meta?.n || `Campaign #${id}`}
      </Link>
      <PageHeader title="Recipients" subtitle={`${c.recipientCount} recipients · ${c.claimedCount} claimed · $${fmtUsd(c.totalAllocation)} allocated`} />

      {!src ? (
        <div className="card space-y-4 p-5">
          <h2 className="text-base font-semibold">{c.isPublic ? 'Recipient list unavailable' : 'Private recipient list'}</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {c.isPublic
              ? 'The published list could not be loaded or does not match the campaign commitment.'
              : 'This campaign did not publish its recipients. To manage it, load the exact CSV you funded it with (same order and amounts). GiftFlow rebuilds the commitment in your browser and only accepts the file if it matches the onchain root.'}
          </p>
          {isOwner ? (
            <>
              <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Recipient CSV" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(rec.importCsv); if (file.current) file.current.value = '' }} />
              <WalletGate className="btn btn-primary" connectLabel="Connect creator wallet">
                <button type="button" className="btn btn-primary" disabled={rec.busy} onClick={() => file.current?.click()}>
                  {rec.busy ? <Spinner /> : <Upload className="size-4" />} Load recipient CSV
                </button>
              </WalletGate>
            </>
          ) : (
            <Notice>Only the campaign creator can load the private list.</Notice>
          )}
        </div>
      ) : (
        <>
          {rec.error ? <Notice tone="error">{rec.error}</Notice> : null}
          {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
          {isOwner ? (
            <div className="flex flex-wrap gap-2">
              {!rec.links ? (
                <WalletGate className="btn btn-secondary" connectLabel="Connect creator wallet">
                  <button type="button" className="btn btn-secondary" disabled={rec.busy} onClick={() => void rec.generateLinks()}>
                    {rec.busy ? <Spinner /> : <Link2 className="size-4" />} Generate claim links
                  </button>
                </WalletGate>
              ) : (
                <button type="button" className="btn btn-secondary" onClick={exportLinks}><Download className="size-4" /> Download claim links (CSV)</button>
              )}
              <WalletGate className="btn btn-primary" connectLabel="Connect creator wallet">
                <button type="button" className="btn btn-primary" disabled={!canDistribute || tx.busy} onClick={() => setConfirm(true)}>
                  <Send className="size-4" /> Send directly to {pending.length} wallets
                </button>
              </WalletGate>
            </div>
          ) : null}
          {rec.shared ? (
            <div className="card space-y-3 p-5">
              <div className="label">Shared claim link</div>
              <div className="inset mono break-all px-3.5 py-3 text-xs">{rec.shared}</div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Anyone with this link can claim one equal share until all are taken.</p>
              <CopyButton value={rec.shared} label="Copy shared link" className="btn btn-primary" />
            </div>
          ) : null}
          {isOwner && !canDistribute && pending.length > 0 ? <p className="text-xs" style={{ color: 'var(--muted)' }}>Direct sending is available while claims are open.</p> : null}
          <RecipientsTable leaves={src.leaves} flags={flags.data} state={state} labels={src.labels} links={rec.links} me={w.address} />
        </>
      )}

      <ConfirmDialog
        open={confirm}
        title="Send rewards directly?"
        description="USDC goes straight from the campaign to each listed wallet, with no claim needed. Recipients with a link-based allocation are not included."
        rows={[['Wallets', String(pending.length)], ['Total', `${fmtUsd(pendingTotal)} USDC`], ['Transactions', String(Math.ceil(pending.length / LIMITS.batch))]]}
        confirmLabel={progress ?? 'Send'}
        busy={tx.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void distribute()}
      />
    </div>
  )
}
