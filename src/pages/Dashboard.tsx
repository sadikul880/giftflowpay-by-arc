import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ArrowRight, BadgeCheck, CirclePlus, ExternalLink, Gift, HandCoins, Plus, Send, Users, Waypoints } from 'lucide-react'
import { CampaignRow } from '@/components/CampaignRow'
import { HeroCard } from '@/components/HeroCard'
import { ConnectWalletButton, CopyButton, EmptyState, Skeleton, Stat } from '@/components/ui'
import { useCampaignPages, useGlobals, useNow, useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useToken } from '@/hooks/useToken'
import { ARC_EURC, BASE_SEPOLIA_USDC, fmtToken } from '@/lib/tokens'
import { campaignState, remainingOf } from '@/lib/flow'
import { fmtUsd, shortAddr } from '@/lib/format'
import { ACTIVE } from '@/lib/network'
import { buildAddressExplorerUrl } from '@/onchain-facts'

function OtherBalances({ owner }: { owner: `0x${string}` }) {
  const eurc = useToken(ARC_EURC, owner)
  const base = useToken(BASE_SEPOLIA_USDC, owner)
  const rows = [
    { label: 'EURC on Arc', t: eurc },
    { label: 'USDC on Base Sepolia', t: base },
  ]
  return (
    <ul className="space-y-1.5 text-sm" aria-label="Other balances">
      {rows.map(({ label, t }) => (
        <li key={label} className="flex items-center justify-between gap-3">
          <span style={{ color: 'var(--muted)' }}>{label}</span>
          <span className="tabular-nums">{t.balance !== undefined && t.decimals !== undefined ? fmtToken(t.balance, t.decimals) : t.isLoading ? '…' : '-'}</span>
        </li>
      ))}
    </ul>
  )
}

function WalletPanel() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  return (
    <section className="card flex flex-col gap-4 p-5" aria-label="Wallet">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Wallet</h2>
        <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium" style={{ borderColor: 'var(--border-strong)', color: 'var(--green)' }}>{ACTIVE.label}</span>
      </div>
      {!w.isConnected || !w.address ? (
        <>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect an Arc wallet to create campaigns and see your USDC balance.</p>
          <ConnectWalletButton className="btn btn-primary w-full" />
        </>
      ) : (
        <>
          <div className="inset flex items-center justify-between gap-2 px-3 py-2">
            <span className="mono text-[13px]">{shortAddr(w.address)}</span>
            <span className="flex items-center gap-1">
              <CopyButton value={w.address} label="" className="btn btn-ghost !min-h-8 !px-2" />
              <a className="btn btn-ghost !min-h-8 !px-2" href={buildAddressExplorerUrl(ACTIVE.chainId, w.address)} target="_blank" rel="noopener noreferrer" aria-label="View wallet on the explorer">
                <ExternalLink className="size-4" />
              </a>
            </span>
          </div>
          <div>
            <div className="label">USDC balance</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {w.wrongChain ? '-' : balance.data !== undefined ? fmtUsd(balance.data) : <Skeleton className="inline-block h-8 w-28 align-middle" />}
              <span className="ml-1.5 text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
            {w.wrongChain ? (
              <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => void w.switchToTarget().catch(() => undefined)} disabled={w.isSwitching}>
                Switch to {ACTIVE.label}
              </button>
            ) : (
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>On Arc, USDC also pays network fees.</p>
            )}
          </div>
          <OtherBalances owner={w.address} />
        </>
      )}
    </section>
  )
}

const ACTIONS = [
  { to: '/gifts/new', title: 'Create gift card', body: 'Send USDC as a gift with a link, a QR code and a card image.', Icon: Gift, cta: 'Create gift' },
  { to: '/campaigns/new', title: 'Create campaign', body: 'Fund a payout for a team, a community or a giveaway.', Icon: CirclePlus, cta: 'Create now' },
  { to: '/send', title: 'Send payment', body: 'Send USDC straight to one wallet.', Icon: Send, cta: 'Send' },
  { to: '/payroll', title: 'Payroll', body: 'Pay a team from a CSV or a list, in one run.', Icon: Users, cta: 'Run payroll' },
  { to: '/swap', title: 'Swap', body: 'Swap USDC and EURC on Arc with a live quote.', Icon: ArrowLeftRight, cta: 'Swap' },
  { to: '/bridge', title: 'Bridge', body: 'Move USDC between Base Sepolia and Arc.', Icon: Waypoints, cta: 'Bridge' },
  { to: '/claim', title: 'Claim USDC', body: 'Open a claim link or enter a secret code.', Icon: HandCoins, cta: 'Claim' },
  { to: '/verify', title: 'Verify', body: 'Check any campaign onchain, no wallet needed.', Icon: BadgeCheck, cta: 'Verify' },
]

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
    let funded = 0n, distributed = 0n, unclaimed = 0n, refunded = 0n, pending = 0
    const counts = { scheduled: 0, active: 0, completed: 0, expired: 0, cancelled: 0 }
    for (const { campaign: c } of rows) {
      const s = campaignState(c, now)
      counts[s]++
      if (!c.cancelled) funded += c.totalAllocation
      distributed += c.claimed
      refunded += c.refunded
      unclaimed += remainingOf(c)
      if (s === 'active' || s === 'scheduled') pending += c.recipientCount - c.claimedCount
    }
    return { funded, distributed, unclaimed, refunded, pending, counts }
  }, [rows, now])

  const pct = (v: bigint) => (totals.funded > 0n ? Number((v * 10000n) / totals.funded) / 100 : 0)

  return (
    <div className="space-y-8">
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <section className="card relative overflow-hidden p-6 sm:p-8">
          <div className="relative z-10 max-w-md space-y-4">
            <h1 className="display text-3xl leading-tight sm:text-4xl">
              Send, reward and pay with <span className="text-neon">USDC on Arc</span>
            </h1>
            <p className="text-sm sm:text-base" style={{ color: 'var(--muted)' }}>
              Create a campaign, fund it once, and let recipients claim with a wallet, a link or a code.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/campaigns/new" className="btn btn-primary">Create campaign <ArrowRight className="size-4" /></Link>
              <Link to="/about" className="btn btn-secondary">Learn more</Link>
            </div>
          </div>
          <HeroCard className="pointer-events-none absolute -right-16 top-6 hidden w-[360px] max-w-none rotate-[-6deg] opacity-90 2xl:block" />
        </section>
        <WalletPanel />
      </div>

      {!w.isConnected ? (
        <EmptyState title="Connect your wallet" body="Connect the wallet you create campaigns with to see your totals and campaigns." action={<ConnectWalletButton />} />
      ) : (
        <section className="card grid grid-cols-2 gap-x-6 gap-y-6 p-5 sm:p-6 lg:grid-cols-5" aria-label="Your totals">
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
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Quick actions">
        {ACTIONS.map(({ to, title, body, Icon, cta }) => (
          <Link key={to} to={to} className="card group flex flex-col gap-3 p-5 transition-transform hover:-translate-y-0.5">
            <span className="icon-chip size-11"><Icon className="size-5" /></span>
            <div>
              <div className="text-base font-semibold">{title}</div>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--green)' }}>{cta} <ArrowRight className="size-4" /></span>
          </Link>
        ))}
      </section>

      {w.isConnected && complete && rows.length > 0 ? (
        <section className="card space-y-4 p-5 sm:p-6" aria-label="Funding breakdown">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Where your funded USDC is</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'var(--muted)' }}>
              {(Object.keys(totals.counts) as Array<keyof typeof totals.counts>).map((k) => (
                <span key={k} className="tabular-nums"><strong style={{ color: 'var(--ink)' }}>{totals.counts[k]}</strong> {k}</span>
              ))}
            </div>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }} role="img" aria-label="Claimed, refunded and still held">
            <div style={{ width: `${pct(totals.distributed)}%`, background: 'var(--green)' }} />
            <div style={{ width: `${pct(totals.refunded)}%`, background: 'var(--warn)' }} />
            <div style={{ width: `${pct(totals.unclaimed)}%`, background: 'rgba(52,240,138,0.28)' }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: 'var(--green)' }} />Claimed ${fmtUsd(totals.distributed)}</span>
            <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: 'var(--warn)' }} />Refunded ${fmtUsd(totals.refunded)}</span>
            <span><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: 'rgba(52,240,138,0.4)' }} />Held in the contract ${fmtUsd(totals.unclaimed)}</span>
          </div>
        </section>
      ) : null}

      {w.isConnected ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Recent campaigns</h2>
            <Link to="/campaigns" className="text-sm font-medium underline-offset-2 hover:underline" style={{ color: 'var(--green)' }}>View all</Link>
          </div>
          {!mine.isSuccess ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-xl" />)}</div>
          ) : rows.length === 0 ? (
            <EmptyState title="No campaigns yet" body="Create your first campaign to fund USDC rewards for a list of recipients." action={<Link to="/campaigns/new" className="btn btn-primary"><Plus className="size-4" /> Create campaign</Link>} />
          ) : (
            <ul className="space-y-3">
              {rows.slice(0, 5).map((r) => <CampaignRow key={r.id.toString()} id={r.id} campaign={r.campaign} now={now} />)}
            </ul>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">All of GiftFlowPay on Arc</h2>
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
