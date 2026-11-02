import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useCampaignMeta } from '@/hooks/useFlow'
import type { Campaign } from '@/lib/chain'
import { campaignState, typeLabel } from '@/lib/flow'
import { fmtDate, fmtUsd } from '@/lib/format'
import { Pill, ProgressBar, StateBadge } from './ui'

export function CampaignRow({ id, campaign, now, to }: { id: bigint; campaign: Campaign; now: number; to?: string }) {
  const meta = useCampaignMeta(id, campaign.createdAt)
  const state = campaignState(campaign, now)
  return (
    <li>
      <Link to={to ?? `/campaigns/${id}`} className="card flex items-center gap-4 p-4 transition-colors hover:bg-[var(--surface-muted)]">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{meta.data?.n || (meta.isLoading ? 'Loading name…' : `Campaign #${id}`)}</span>
            <StateBadge state={state} />
            {meta.data ? <Pill>{typeLabel(meta.data.t)}</Pill> : null}
          </div>
          <ProgressBar claimed={campaign.claimed} refunded={campaign.refunded} total={campaign.totalAllocation} />
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            <span>${fmtUsd(campaign.claimed)} of ${fmtUsd(campaign.totalAllocation)} claimed</span>
            <span>{campaign.claimedCount}/{campaign.recipientCount} recipients</span>
            <span>Deadline {fmtDate(campaign.claimDeadline)}</span>
          </div>
        </div>
        <span className="mono hidden text-xs sm:inline" style={{ color: 'var(--subtle)' }}>#{id.toString()}</span>
        <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
      </Link>
    </li>
  )
}
