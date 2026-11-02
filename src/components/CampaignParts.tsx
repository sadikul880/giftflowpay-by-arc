import { Link } from 'react-router-dom'
import { ArrowDownLeft, CircleCheck, Plus, Undo2, Ban } from 'lucide-react'
import type { CampaignView } from '@/lib/chain'
import type { FlowEvent } from '@/lib/events'
import { campaignState, refundableOf, remainingOf, typeLabel } from '@/lib/flow'
import { fmtDate, fmtUsd, timeLeft } from '@/lib/format'
import { AddressLink, Pill, ProgressBar, Stat, StateBadge, TxLink } from './ui'

export function CampaignSummary({ view, now }: { view: CampaignView; now: number }) {
  const c = view.campaign
  const state = campaignState(c, now)
  const remaining = remainingOf(c)
  const refundable = refundableOf(c, now)
  return (
    <section className="card space-y-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{view.meta?.n || `Campaign #${view.id}`}</h2>
            <StateBadge state={state} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {view.meta ? <Pill>{typeLabel(view.meta.t)}</Pill> : null}
            <Pill tone={c.isPublic ? 'green' : 'neutral'}>{c.isPublic ? 'Public list' : 'Private list'}</Pill>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Created by <AddressLink address={c.creator} />
            </span>
          </div>
        </div>
        <span className="mono text-xs" style={{ color: 'var(--subtle)' }}>#{view.id.toString()}</span>
      </div>

      {view.meta?.d ? <p className="max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>{view.meta.d}</p> : null}

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Funded" value={`$${fmtUsd(c.totalAllocation)}`} />
        <Stat label="Claimed" value={`$${fmtUsd(c.claimed)}`} hint={`${c.claimedCount} of ${c.recipientCount} recipients`} />
        <Stat label="Remaining" value={`$${fmtUsd(remaining)}`} />
        <Stat label="Refundable" value={`$${fmtUsd(refundable)}`} hint={c.refunded > 0n && !c.cancelled ? `$${fmtUsd(c.refunded)} already refunded` : undefined} />
      </div>
      <ProgressBar claimed={c.claimed} refunded={c.refunded} total={c.totalAllocation} />

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="label">Claims open</dt>
          <dd className="mt-1">{fmtDate(c.startTime)}{state === 'scheduled' ? ` (in ${timeLeft(c.startTime, now)})` : ''}</dd>
        </div>
        <div>
          <dt className="label">Claim deadline</dt>
          <dd className="mt-1">{fmtDate(c.claimDeadline)}{state === 'active' || state === 'scheduled' ? ` (${timeLeft(c.claimDeadline, now)} left)` : ''}</dd>
        </div>
      </dl>
    </section>
  )
}

function describe(e: FlowEvent, me?: string): { title: string; sub: React.ReactNode; Icon: typeof Plus } {
  const mine = (a?: string) => Boolean(me && a && a.toLowerCase() === me.toLowerCase())
  switch (e.kind) {
    case 'created':
      return { title: mine(e.creator) ? 'You created and funded a campaign' : 'Campaign created and funded', sub: e.creator ? <AddressLink address={e.creator} /> : null, Icon: Plus }
    case 'claimed':
      return {
        title: mine(e.recipient) ? 'You received a reward' : e.direct ? 'Reward sent directly' : 'Reward claimed',
        sub: e.recipient ? <AddressLink address={e.recipient} /> : null,
        Icon: e.direct ? CircleCheck : ArrowDownLeft,
      }
    case 'refunded':
      return { title: mine(e.creator) ? 'You refunded unclaimed funds' : 'Unclaimed funds refunded', sub: e.creator ? <AddressLink address={e.creator} /> : null, Icon: Undo2 }
    case 'cancelled':
      return { title: mine(e.creator) ? 'You cancelled a campaign' : 'Campaign cancelled', sub: e.creator ? <AddressLink address={e.creator} /> : null, Icon: Ban }
    default:
      return { title: 'Recipients published', sub: null, Icon: Plus }
  }
}

export function EventList({ events, me, showCampaign = true }: { events: FlowEvent[]; me?: string; showCampaign?: boolean }) {
  return (
    <ul className="divide-y rounded-xl border bg-white" style={{ borderColor: 'var(--border)' }}>
      {events.map((e) => {
        const d = describe(e, me)
        return (
          <li key={`${e.txHash}:${e.logIndex}`} className="flex items-center gap-3.5 px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--surface-muted)' }}>
              <d.Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                <span>{d.title}</span>
                {showCampaign ? (
                  <Link to={`/campaigns/${e.campaignId}`} className="mono text-xs underline underline-offset-2" style={{ color: 'var(--green)' }}>
                    #{e.campaignId.toString()}
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-xs" style={{ color: 'var(--muted)' }}>
                {d.sub}
                {e.timestamp ? <span>{fmtDate(e.timestamp)}</span> : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">${fmtUsd(e.amount)}</div>
              <TxLink hash={e.txHash} label="Tx" />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
