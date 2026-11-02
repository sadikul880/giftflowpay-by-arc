import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { CampaignRow } from '@/components/CampaignRow'
import { ConnectWalletButton, EmptyState, PageHeader, Skeleton, Stat } from '@/components/ui'
import { useCampaignPages, useGlobals, useNow, useWallet } from '@/hooks/useFlow'
import { campaignState, remainingOf } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'

export default function Dashboard() {
  const w = useWallet()
  const now = useNow()
  const me = w.address?.toLowerCase()
  const globals = useGlobals()
  const mine = useCampaignPages(`mine:${me}`, (c) => c.creator.toLowerCase() === me, Boolean(me))
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = mine

  // The overview totals need every campaign, so keep paging until the list is complete.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const rows = useMemo(() => mine.data?.pages.flatMap((p) => p.rows) ?? [], [mine.data])
  const complete = mine.isSuccess && !hasNextPage

  const totals = useMemo(() => {
    let funded = 0n, distributed = 0n, unclaimed = 0n, pending = 0
    const counts = { scheduled: 0, active: 0, completed: 0, expired: 0, cancelled: 0 }
    for (const { campaign: c } of rows) {
      const s = campaignState(c, now)
      counts[s]++
      if (!c.cancelled) funded += c.totalAllocation
      distributed += c.claimed
      unclaimed += remainingOf(c)
      if (s === 'active' || s === 'scheduled') pending += c.recipientCount - c.claimedCount
    }
    return { funded, distributed, unclaimed, pending, counts }
  }, [rows, now])

  return (
    <div className="space-y-10">
      <PageHeader
        title="Overview"
        subtitle="Your campaigns, read live from the GiftFlow contract."
        actions={<Link to="/campaigns/new" className="btn btn-primary"><Plus className="size-4" /> Create campaign</Link>}
      />

      {!w.isConnected ? (
        <EmptyState title="Connect your wallet" body="Connect the wallet you create campaigns with to see your totals and campaigns." action={<ConnectWalletButton />} />
      ) : (
        <>
          <section className="card grid grid-cols-2 gap-x-6 gap-y-6 p-5 sm:p-6 lg:grid-cols-5">
            {!complete ? (
              [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : (
              <>
                <Stat label="Campaigns" value={rows.length} />
                <Stat label="USDC funded" value={`$${fmtUsd(totals.funded)}`} />
                <Stat label="USDC distributed" value={`$${fmtUsd(totals.distributed)}`} />
                <Stat label="Pending allocations" value={totals.pending} hint="In open campaigns" />
                <Stat label="Unclaimed rewards" value={`$${fmtUsd(totals.unclaimed)}`} hint="Still in the contract" />
              </>
            )}
          </section>

          {complete && rows.length > 0 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'var(--muted)' }}>
              {(Object.keys(totals.counts) as Array<keyof typeof totals.counts>).map((k) => (
                <span key={k} className="tabular-nums"><strong style={{ color: 'var(--ink)' }}>{totals.counts[k]}</strong> {k}</span>
              ))}
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Recent campaigns</h2>
              <Link to="/campaigns" className="text-sm font-medium underline-offset-2 hover:underline" style={{ color: 'var(--green)' }}>View all</Link>
            </div>
            {!mine.isSuccess ? (
              <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-xl" />)}</div>
            ) : rows.length === 0 ? (
              <EmptyState title="No campaigns yet" body="Create your first campaign to fund USDC rewards for a list of recipients." action={<Link to="/campaigns/new" className="btn btn-primary">Create campaign</Link>} />
            ) : (
              <ul className="space-y-3">
                {rows.slice(0, 5).map((r) => <CampaignRow key={r.id.toString()} id={r.id} campaign={r.campaign} now={now} />)}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">All of GiftFlow on {`Arc`}</h2>
        <div className="card grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          {globals.data ? (
            <>
              <Stat label="Campaigns" value={globals.data.campaignCount.toString()} />
              <Stat label="Funded" value={`$${fmtUsd(globals.data.totalFunded)}`} />
              <Stat label="Claimed" value={`$${fmtUsd(globals.data.totalClaimed)}`} />
              <Stat label="Refunded" value={`$${fmtUsd(globals.data.totalRefunded)}`} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)
          )}
        </div>
      </section>
    </div>
  )
}
