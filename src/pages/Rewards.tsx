import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Award, Coins, Handshake, Link2, ListChecks, Trophy } from 'lucide-react'
import { CampaignRow } from '@/components/CampaignRow'
import { ConnectWalletButton, EmptyState, Skeleton } from '@/components/ui'
import { PageHeader } from '@/components/ui'
import { useDraft } from '@/hooks/useDraft'
import { useCampaignMeta, useCampaignPages, useNow, useWallet } from '@/hooks/useFlow'
import type { Campaign } from '@/lib/chain'
import { isRewardType, REWARD_PRESETS } from '@/lib/rewards'

const ICONS: Record<string, typeof Trophy> = { hackathon: Trophy, airdrop: Coins, giveaway: Link2, grants: Handshake, bounties: Award, contributors: ListChecks }

/** A campaign row that hides itself once its public metadata says it is a gift or a payroll run. */
function RewardItem({ id, campaign, now }: { id: bigint; campaign: Campaign; now: number }) {
  const meta = useCampaignMeta(id, campaign.createdAt)
  if (!isRewardType(meta.data?.t)) return null
  return <CampaignRow id={id} campaign={campaign} now={now} />
}

export default function Rewards() {
  const w = useWallet()
  const now = useNow()
  const nav = useNavigate()
  const { reset, patch } = useDraft()
  const me = w.address?.toLowerCase()
  const mine = useCampaignPages(`mine:${me}`, (c) => c.creator.toLowerCase() === me, Boolean(me))
  const rows = useMemo(() => (mine.data?.pages.flatMap((p) => p.rows) ?? []).slice(0, 15), [mine.data])

  const start = (type: (typeof REWARD_PRESETS)[number]['type'], mode: (typeof REWARD_PRESETS)[number]['mode']) => {
    reset()
    patch({ type, mode })
    void nav('/campaigns/new')
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Community rewards" subtitle="Run prizes, airdrops, grants and bounties. Fund once, and the contract pays only the people you commit to." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Reward campaign types">
        {REWARD_PRESETS.map((p) => {
          const Icon = ICONS[p.id] ?? Trophy
          return (
            <button key={p.id} type="button" onClick={() => start(p.type, p.mode)} className="card group flex flex-col gap-3 p-5 text-left transition-transform hover:-translate-y-0.5">
              <span className="icon-chip size-11"><Icon className="size-5" /></span>
              <div>
                <div className="text-base font-semibold">{p.title}</div>
                <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{p.body}</p>
              </div>
              <div className="mt-auto flex items-center justify-between text-sm">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>{p.how}</span>
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--green)' }}>Start <ArrowRight className="size-4" /></span>
              </div>
            </button>
          )
        })}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Your latest campaigns</h2>
          <Link to="/campaigns" className="text-sm font-medium underline-offset-2 hover:underline" style={{ color: 'var(--green)' }}>View all</Link>
        </div>
        {!w.isConnected ? (
          <EmptyState title="Connect your wallet" body="Connect the wallet you create campaigns with to see them here." action={<ConnectWalletButton />} />
        ) : !mine.isSuccess ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="No campaigns yet" body="Pick a type above to create your first reward campaign." />
        ) : (
          <>
            <ul className="space-y-3">{rows.map((r) => <RewardItem key={r.id.toString()} id={r.id} campaign={r.campaign} now={now} />)}</ul>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Gift cards and payroll runs have their own pages and are hidden here.</p>
          </>
        )}
      </section>
    </div>
  )
}
