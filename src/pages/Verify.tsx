import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CircleAlert, CircleCheck, CircleMinus } from 'lucide-react'
import { CampaignSummary } from '@/components/CampaignParts'
import { EventFeed } from '@/components/EventFeed'
import { RecipientsTable } from '@/components/RecipientsTable'
import { AddressLink, EmptyState, Skeleton, TxLink } from '@/components/ui'
import { useCampaign, useClaimedFlags, useNow, useWallet } from '@/hooks/useFlow'
import type { CampaignView } from '@/lib/chain'
import { campaignState } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'

function VerifyEntry() {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const num = /(\d+)\s*$/.exec(text.trim().replace(/[?#].*$/, ''))?.[1]
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="display text-2xl sm:text-3xl">Verify a campaign</h1>
      <p className="mb-6 mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>Anyone can check a campaign&rsquo;s funding, claims and status straight from the blockchain. No wallet needed.</p>
      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (num) void nav(`/verify/${num}`) }}>
        <label className="space-y-1.5">
          <span className="label">Campaign number or link</span>
          <input className="field" placeholder="12" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={!num}>Verify <ArrowRight className="size-4" /></button>
      </form>
    </div>
  )
}

export default function Verify() {
  const { id } = useParams()
  if (!id) return <VerifyEntry />
  if (!/^\d+$/.test(id)) return <EmptyState title="Campaign not found" body="This campaign number is not valid." action={<Link to="/verify" className="btn btn-secondary">Try another</Link>} />
  return <VerifyCampaign id={BigInt(id)} />
}

type Tone = 'ok' | 'warn' | 'bad'
function Check({ tone, title, children }: { tone: Tone; title: string; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CircleCheck : tone === 'bad' ? CircleAlert : CircleMinus
  const color = tone === 'ok' ? 'var(--green)' : tone === 'bad' ? 'var(--danger)' : 'var(--warn)'
  return (
    <li className="flex gap-3 px-5 py-4" style={{ borderColor: 'var(--border)' }}>
      <Icon className="mt-0.5 size-5 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>{children}</div>
      </div>
    </li>
  )
}

function integrityCheck(view: CampaignView) {
  switch (view.integrity) {
    case 'verified':
      return <Check tone="ok" title="Allocations match the funding">The published recipient list was rebuilt in your browser. It reproduces the committed root and adds up to exactly ${fmtUsd(view.campaign.totalAllocation)} USDC. The contract also checked this when the campaign was created.</Check>
    case 'mismatch':
      return <Check tone="bad" title="Published list does not match">The recipient list in the creation event does not reproduce the committed root or the funded total. Do not rely on it.</Check>
    case 'private':
      return <Check tone="warn" title="Recipient list is private">The creator chose not to publish recipients. Each claim is still checked against the committed root onchain, but the full allocation list cannot be audited publicly.</Check>
    default:
      return <Check tone="warn" title="Recipient list unavailable">The creation event could not be located right now, so the published list could not be checked.</Check>
  }
}

function VerifyCampaign({ id }: { id: bigint }) {
  const w = useWallet()
  const now = useNow()
  const q = useCampaign(id)
  const view = q.data
  const flags = useClaimedFlags(view && view.campaign.isPublic && view.leaves ? id : undefined, view?.leaves?.length, view?.campaign.claimedCount)

  if (q.isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full !rounded-2xl" /></div>
  if (q.isError || !view) return <EmptyState title="Campaign not found" body="No campaign with this number exists on the current network." action={<Link to="/verify" className="btn btn-secondary">Try another</Link>} />

  const c = view.campaign
  const state = campaignState(c, now)
  const claimedFlags = flags.data?.filter(Boolean).length
  const flagsMatch = claimedFlags === undefined ? undefined : claimedFlags === c.claimedCount

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="display text-2xl sm:text-3xl">Public verification</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>Everything below is read directly from the GiftFlowPay contract and its events.</p>
      </div>

      <CampaignSummary view={view} now={now} />

      <section className="card overflow-hidden">
        <h2 className="border-b px-5 py-3.5 text-base font-semibold" style={{ borderColor: 'var(--border)' }}>Checks</h2>
        <ul className="divide-y">
          <Check tone="ok" title="Creator">
            Funded and controlled by <AddressLink address={c.creator} full />. {view.setup ? <TxLink hash={view.setup.created.txHash} label="Creation transaction" /> : null}
          </Check>
          <Check tone="ok" title="Funds are held in the contract">${fmtUsd(c.totalAllocation)} USDC was deposited in one transaction. ${fmtUsd(c.claimed)} claimed, ${fmtUsd(c.refunded)} refunded.</Check>
          {integrityCheck(view)}
          {c.isPublic && view.leaves ? (
            <Check tone={flagsMatch === false ? 'bad' : flagsMatch ? 'ok' : 'warn'} title="Claim records">
              {flagsMatch === undefined ? 'Reading claim records…' : flagsMatch ? `${claimedFlags} of ${c.recipientCount} allocations are marked claimed, matching the contract total.` : 'Claim records do not match the contract total.'}
            </Check>
          ) : (
            <Check tone="ok" title="Claim totals">{c.claimedCount} of {c.recipientCount} allocations claimed, as counted by the contract.</Check>
          )}
          <Check tone={state === 'cancelled' ? 'warn' : 'ok'} title="Status">
            {state === 'scheduled' ? 'Claims have not opened yet.' : state === 'active' ? 'Claims are open.' : state === 'completed' ? 'Every allocation has been claimed.' : state === 'expired' ? 'The claim window closed. Unclaimed funds are refundable to the creator only.' : 'The creator cancelled the campaign before it started and was refunded.'}
          </Check>
        </ul>
      </section>

      {c.isPublic && view.leaves ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Recipients</h2>
          <RecipientsTable leaves={view.leaves} flags={flags.data} state={state} me={w.address} />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        <EventFeed kinds={['created', 'claimed', 'refunded', 'cancelled']} campaignId={id} floor={view.setup?.created.blockNumber} enabled={Boolean(view.setup)} me={w.address} showCampaign={false} emptyTitle="No transactions yet" />
      </section>
    </div>
  )
}
