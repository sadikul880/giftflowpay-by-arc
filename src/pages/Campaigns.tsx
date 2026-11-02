import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { CampaignRow } from '@/components/CampaignRow'
import { ConnectWalletButton, EmptyState, Notice, PageHeader, Skeleton, Spinner } from '@/components/ui'
import { useCampaignPages, useNow, useWallet } from '@/hooks/useFlow'
import { campaignState, type CampaignState } from '@/lib/flow'

const FILTERS: Array<{ id: 'all' | CampaignState; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'completed', label: 'Completed' },
  { id: 'expired', label: 'Expired' },
  { id: 'cancelled', label: 'Cancelled' },
]

export default function Campaigns() {
  const w = useWallet()
  const now = useNow()
  const me = w.address?.toLowerCase()
  const [tab, setTab] = useState<'mine' | 'public'>('mine')
  const [filter, setFilter] = useState<'all' | CampaignState>('all')

  const mine = useCampaignPages(`mine:${me}`, (c) => c.creator.toLowerCase() === me, tab === 'mine' && Boolean(me))
  const pub = useCampaignPages('public', (c) => c.isPublic, tab === 'public')
  const q = tab === 'mine' ? mine : pub

  const rows = useMemo(() => (q.data?.pages.flatMap((p) => p.rows) ?? []).filter((r) => filter === 'all' || campaignState(r.campaign, now) === filter), [q.data, filter, now])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle="Newest first, read directly from the contract."
        actions={<Link to="/campaigns/new" className="btn btn-primary"><Plus className="size-4" /> Create campaign</Link>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1">
          {([['mine', 'My campaigns'], ['public', 'Public campaigns']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} type="button" className={`btn !min-h-10 ${tab === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} className={`btn !min-h-8 !px-3 text-xs ${filter === f.id ? 'btn-secondary !border-[var(--ink)]' : 'btn-ghost'}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>

      {tab === 'mine' && !w.isConnected ? (
        <EmptyState title="Connect your wallet" body="Connect the wallet you create campaigns with to see them here." action={<ConnectWalletButton />} />
      ) : q.isError ? (
        <Notice tone="error">Could not read campaigns from the contract. <button type="button" className="font-semibold underline" onClick={() => void q.refetch()}>Retry</button></Notice>
      ) : !q.isSuccess ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'No campaigns yet' : `No ${filter} campaigns loaded`}
          body={tab === 'mine' ? 'Campaigns you create appear here.' : 'Public campaigns appear here once someone creates one with a public recipient list.'}
          action={q.hasNextPage ? <button type="button" className="btn btn-secondary" onClick={() => void q.fetchNextPage()}>Load older campaigns</button> : tab === 'mine' ? <Link to="/campaigns/new" className="btn btn-primary">Create campaign</Link> : undefined}
        />
      ) : (
        <>
          <ul className="space-y-3">{rows.map((r) => <CampaignRow key={r.id.toString()} id={r.id} campaign={r.campaign} now={now} />)}</ul>
          {q.hasNextPage ? (
            <div className="flex justify-center">
              <button type="button" className="btn btn-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                {q.isFetchingNextPage ? <Spinner /> : null} Load older campaigns
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
