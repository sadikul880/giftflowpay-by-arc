import { Link } from 'react-router-dom'
import { ArrowRight, Landmark, ListChecks, ShieldCheck, Undo2 } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useGlobals } from '@/hooks/useFlow'
import { fmtUsd } from '@/lib/format'
import { ACTIVE } from '@/lib/network'

const STEPS = [
  { n: '1', title: 'Create', body: 'Name the campaign, set the claim window, and import recipients from a CSV or add them one by one.' },
  { n: '2', title: 'Fund', body: 'Deposit the full USDC total in one transaction. The contract commits to every allocation and holds the funds.' },
  { n: '3', title: 'Distribute', body: 'Recipients claim with their wallet or a personal link, or you send directly to listed wallets in batches.' },
]

const FEATURES = [
  { Icon: Landmark, title: 'Escrow by contract', body: 'Funds are locked onchain at creation. Only claims by committed recipients and a refund to you can move them.' },
  { Icon: ListChecks, title: 'Scales to a full roster', body: 'Allocations are committed as a Merkle tree, so one campaign can carry hundreds of recipients at a flat funding cost.' },
  { Icon: ShieldCheck, title: 'Publicly verifiable', body: 'Every campaign has a verification page anyone can use to check funding, claims and status without a wallet.' },
  { Icon: Undo2, title: 'Refunds after expiry', body: 'Unclaimed USDC returns to the creator once the claim window closes. It can be refunded once and only by the creator.' },
]

export default function Landing() {
  const g = useGlobals()
  return (
    <div className="space-y-20 sm:space-y-24">
      <section className="max-w-3xl space-y-6 pt-4 sm:pt-10">
        <p className="label" style={{ color: 'var(--green)' }}>The programmable distribution layer for USDC on Arc</p>
        <h1 className="display text-4xl leading-[1.08] sm:text-5xl">Create once. Fund once. Distribute by rules.</h1>
        <p className="max-w-xl text-base sm:text-lg" style={{ color: 'var(--muted)' }}>
          Run reward campaigns for hackathons, DAOs and communities. Deposit USDC, allocate it to many recipients, and let the contract enforce who can claim what, and when.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/campaigns/new" className="btn btn-primary !min-h-12 !px-6">Create a campaign <ArrowRight className="size-4" /></Link>
          <Link to="/claim" className="btn btn-secondary !min-h-12 !px-6">Claim USDC</Link>
          <Link to="/verify" className="btn btn-ghost !min-h-12 !px-4">Verify a campaign</Link>
        </div>
      </section>

      <section aria-label="Live totals" className="card grid grid-cols-2 gap-6 p-5 sm:grid-cols-4 sm:p-6">
        {g.data ? (
          <>
            {[
              ['Campaigns created', g.data.campaignCount.toString()],
              ['USDC funded', `$${fmtUsd(g.data.totalFunded)}`],
              ['USDC claimed', `$${fmtUsd(g.data.totalClaimed)}`],
              ['USDC refunded', `$${fmtUsd(g.data.totalRefunded)}`],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="label">{k}</div>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{v}</div>
              </div>
            ))}
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)
        )}
        <p className="col-span-2 text-xs sm:col-span-4" style={{ color: 'var(--muted)' }}>Read live from the contract on {ACTIVE.label}.</p>
      </section>

      <section className="space-y-6">
        <h2 className="display text-xl sm:text-2xl">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <span className="flex size-7 items-center justify-center rounded-full text-xs font-semibold" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>{s.n}</span>
              <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {FEATURES.map(({ Icon, title, body }) => (
          <div key={title} className="flex gap-3.5">
            <Icon className="mt-0.5 size-5 shrink-0" style={{ color: 'var(--green)' }} />
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="max-w-2xl text-sm" style={{ color: 'var(--muted)' }}>
        <h2 className="mb-2 text-base font-semibold" style={{ color: 'var(--ink)' }}>What a contract can and cannot check</h2>
        <p>
          A smart contract cannot see whether someone finished a course, merged a pull request or attended an event. GiftFlow campaigns therefore pay the allocations you commit to. Rewards that depend on real-world actions need an approver, a multisig or a signed attestation, which are planned extensions and not part of this release.
        </p>
      </section>
    </div>
  )
}
