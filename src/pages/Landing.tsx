import { lazy, Suspense, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, ArrowLeftRight, BadgeCheck, Building2, CheckCircle2, ChevronDown, Gift, KeyRound, Landmark, Link2, ListChecks, Lock,
  ShieldCheck, Trophy, Undo2, Users, Waypoints,
} from 'lucide-react'
import { HeroCard } from '@/components/HeroCard'
import { Magnetic, Reveal, SpotCard } from '@/components/fx'
import { Skeleton } from '@/components/ui'
import { useGlobals } from '@/hooks/useFlow'
import { fmtUsd } from '@/lib/format'
import { ACTIVE } from '@/lib/network'

// three.js is large, so the 3D hero is fetched separately; the flat card shows until (or instead of) it.
const Hero3D = lazy(() => import('@/components/Hero3D'))

const CAPABILITIES = ['Gift cards', 'Payroll', 'Community rewards', 'Secret codes', 'QR claim links', 'CSV import', 'Swap', 'Bridge', 'Refund after expiry', 'Public verification', 'Direct payments', 'Wallet history']

const USE_CASES = [
  { Icon: Users, title: 'Teams and payroll', body: 'Pay a whole team from a CSV. Fund once, and every wallet is paid in batches, with a receipt you can download.', to: '/payroll', cta: 'Run payroll' },
  { Icon: Trophy, title: 'Hackathons and grants', body: 'Announce prizes by wallet list with the totals public, so anyone can check that the money is really there.', to: '/rewards', cta: 'Start a reward' },
  { Icon: Link2, title: 'Communities and airdrops', body: 'Give equal shares through one link, or one secret code per person when each person must get exactly one.', to: '/rewards', cta: 'Plan an airdrop' },
  { Icon: Gift, title: 'Gifts that feel like gifts', body: 'Pick a design, add a message, and send a card as a link, a QR code or an image. The recipient claims with their own wallet.', to: '/gifts/new', cta: 'Create a gift card' },
]

const STEPS = [
  { n: '1', title: 'Create', body: 'Name the campaign, set the claim window, and choose wallets, one shared link or secret codes.' },
  { n: '2', title: 'Fund', body: 'Deposit the full USDC total in one transaction. The contract commits to every allocation and holds the funds.' },
  { n: '3', title: 'Distribute', body: 'Recipients claim with their wallet, a link or a code, or you send directly to listed wallets in batches.' },
]

const MODES = [
  { id: 'list', label: 'Wallet list', Icon: ListChecks, title: 'You know the wallets', body: 'Add each wallet and amount, by hand or from a CSV. Everyone opens one page, connects and claims, or you push the money to all of them yourself.', points: ['Salaries, DAO payouts, hackathon prizes', 'Amounts can differ per person', 'Direct send in batches of 50'] },
  { id: 'open', label: 'One shared link', Icon: Link2, title: 'One link for a crowd', body: 'Set a number of people and an amount each. Whoever opens the link claims one share until every share is gone.', points: ['Open giveaways and community drops', 'Nothing to collect from recipients first', 'Share it only with people you trust'] },
  { id: 'codes', label: 'Secret codes', Icon: KeyRound, title: 'One code, one share', body: 'Every person gets a personal code. Each code works once, so each person gets exactly one share, and the page, QR and image never contain the code.', points: ['Strictly one share per person', 'Codes can be recreated later by signing', 'Names stay in your browser'] },
] as const

const TRUST = [
  { Icon: Lock, title: 'Funds sit in a contract', body: 'Not with us. The owner cannot withdraw campaign money or edit a campaign.' },
  { Icon: Undo2, title: 'Refunds never get stuck', body: 'Unclaimed USDC returns to you after the deadline, even if the contract is paused.' },
  { Icon: BadgeCheck, title: 'Check it yourself', body: 'Every campaign has a public page that rebuilds the recipient list in your browser and compares it with the chain.' },
  { Icon: ShieldCheck, title: 'Tested hard', body: '123 contract tests at 10,000 fuzz runs, and the app itself run against the real contract on a local chain.' },
]

const FAQ = [
  { q: 'Who holds the money?', a: 'The GiftFlowPay smart contract holds it from the moment you fund a campaign. There is no account with us, no database and no server that can move your funds.' },
  { q: 'What happens if nobody claims?', a: 'After the claim deadline you can refund everything that was not claimed to your wallet, once. Before a campaign starts you can cancel it for a full refund.' },
  { q: 'Do recipients need crypto already?', a: 'They need a wallet and a small amount of USDC to pay the network fee, because Arc uses USDC for gas. Everything else comes with the claim link.' },
  { q: 'Can the owner take the funds or change a campaign?', a: 'No. The owner can pause the contract and set a spending cap for new campaigns. There is no withdrawal function, and refunds and cancellations keep working while paused.' },
  { q: 'Is this ready for real money?', a: 'Not yet. It runs on Arc Testnet, where USDC has no real value, and the contract has not had an independent audit. Mainnet comes only after an audit and an explicit decision.' },
  { q: 'Can it pay people for finishing a task?', a: 'A smart contract cannot see real-world actions such as finishing a course or merging a pull request. Campaigns pay the allocations you commit to. Rewards tied to tasks would need an approver, a multisig or a signed attestation, which are planned, not built.' },
]

function Section({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-8">
      <Reveal className="max-w-2xl space-y-3">
        <p className="label" style={{ color: 'var(--green)' }}>{eyebrow}</p>
        <h2 className="display text-3xl leading-tight sm:text-4xl">{title}</h2>
        {intro ? <p className="text-base" style={{ color: 'var(--muted)' }}>{intro}</p> : null}
      </Reveal>
      {children}
    </section>
  )
}

/** A product screenshot that tilts toward the mouse. */
function TiltFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const reduce = useReducedMotion()
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch') return
    const b = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - b.left) / b.width - 0.5
    const y = (e.clientY - b.top) / b.height - 0.5
    e.currentTarget.style.transform = `perspective(1100px) rotateY(${x * 9}deg) rotateX(${-y * 7}deg) translateZ(0)`
  }
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'perspective(1100px) rotateY(0deg) rotateX(0deg)'
  }
  return (
    <div className={`transition-transform duration-300 ease-out will-change-transform ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--border-strong)', boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 60px rgba(52,240,138,0.08)' }}>
        <img src={src} alt={alt} width={1400} height={840} loading="lazy" className="block w-full" />
      </div>
    </div>
  )
}

export default function Landing() {
  const g = useGlobals()
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('list')
  const active = MODES.find((m) => m.id === mode) ?? MODES[0]

  return (
    <div className="space-y-28 sm:space-y-36">
      {/* Hero */}
      <section className="relative -mt-4 pt-2 sm:-mt-8 sm:pt-6">
        <div className="grid-fade pointer-events-none absolute inset-x-[-10%] -top-24 h-[640px]" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-[520px] rounded-full opacity-60 blur-3xl" aria-hidden="true" style={{ background: 'radial-gradient(closest-side, rgba(52,240,138,0.22), transparent)' }} />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-7">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)', background: 'rgba(52,240,138,0.06)' }}>
                <span className="size-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} /> Non-custodial USDC payments on Arc
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="display text-5xl leading-[1.04] sm:text-6xl xl:text-7xl">
                Send, reward and pay with <span className="text-gradient">USDC on Arc</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="max-w-xl text-base sm:text-lg" style={{ color: 'var(--muted)' }}>
                Fund a campaign once and let the smart contract decide who can claim what, and when. Pay a team, reward a community or hand out USDC with a link, a code or a QR.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Magnetic><Link to="/campaigns/new" className="btn btn-primary !min-h-12 !px-6">Create a campaign <ArrowRight className="size-4" /></Link></Magnetic>
                <Magnetic><Link to="/claim" className="btn btn-secondary !min-h-12 !px-6">Claim USDC</Link></Magnetic>
                <Link to="/verify" className="btn btn-ghost !min-h-12 !px-4">Verify a campaign</Link>
              </div>
            </Reveal>
            <Reveal delay={0.32}>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'var(--muted)' }}>
                {['No database', 'Funds held by the contract', 'Refund after expiry', 'Public verification'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" style={{ color: 'var(--green)' }} /> {t}</li>
                ))}
              </ul>
            </Reveal>
          </div>
          <Suspense fallback={<HeroCard />}>
            <Hero3D />
          </Suspense>
        </div>
      </section>

      {/* Capabilities strip */}
      <div className="marquee -mx-4 overflow-hidden border-y py-4" style={{ borderColor: 'var(--border)', maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }} aria-label="What you can do with GiftFlowPay">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {CAPABILITIES.map((c) => (
                <li key={c} className="flex items-center gap-8 pr-8 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                  {c} <span className="size-1.5 rounded-full" style={{ background: 'var(--green)' }} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* Live totals */}
      <Reveal>
        <section aria-label="Live totals" className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-4 sm:p-8">
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
                  <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{v}</div>
                </div>
              ))}
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)
          )}
          <p className="col-span-2 text-xs sm:col-span-4" style={{ color: 'var(--muted)' }}>Read live from the contract on {ACTIVE.label}. Testnet USDC has no real value.</p>
        </section>
      </Reveal>

      {/* Use cases */}
      <Section eyebrow="Built for" title="One platform for every way you pay people" intro="The same funded, verifiable contract sits under payroll, prizes, airdrops and gifts.">
        <div className="grid gap-4 sm:grid-cols-2">
          {USE_CASES.map(({ Icon, title, body, to, cta }, i) => (
            <Reveal key={title} delay={i * 0.07}>
              <SpotCard className="card h-full p-6">
                <span className="icon-chip size-12"><Icon className="size-6" /></span>
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
                <Link to={to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--green)' }}>{cta} <ArrowRight className="size-4" /></Link>
              </SpotCard>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section eyebrow="How it works" title="Create once. Fund once. Distribute by rules.">
        <ol className="relative grid gap-4 sm:grid-cols-3">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[34px] hidden h-px sm:block" aria-hidden="true" style={{ background: 'linear-gradient(90deg, transparent, rgba(52,240,138,0.5), transparent)' }} />
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <li className="card relative h-full p-6">
                <span className="flex size-10 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: '0 0 24px rgba(52,240,138,0.4)' }}>{s.n}</span>
                <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      {/* Payout modes */}
      <Section eyebrow="Ways to pay" title="Pick how people get paid" intro="Same contract, same guarantees. Choose per campaign.">
        <Reveal>
          <div className="card overflow-hidden">
            <div className="flex flex-wrap gap-2 border-b p-3" style={{ borderColor: 'var(--border)' }} role="tablist" aria-label="Payout modes">
              {MODES.map(({ id, label, Icon }) => (
                <button key={id} type="button" role="tab" aria-selected={mode === id} className={`btn !min-h-10 ${mode === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(id)}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1.1fr_0.9fr]" role="tabpanel">
                <div className="space-y-3">
                  <h3 className="text-2xl font-semibold">{active.title}</h3>
                  <p className="text-sm sm:text-base" style={{ color: 'var(--muted)' }}>{active.body}</p>
                </div>
                <ul className="space-y-3">
                  {active.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--green)' }} /> {p}</li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </Section>

      {/* Product showcase */}
      <Section eyebrow="The product" title="Everything in one dashboard" intro="Wallet, balances, gift cards, payroll, swap and bridge, with live data from Arc.">
        <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <Reveal><TiltFrame src="/landing/dashboard.webp" alt="The GiftFlowPay dashboard showing a wallet, balances and actions" /></Reveal>
          <div className="space-y-6">
            <Reveal delay={0.1}><TiltFrame src="/landing/gift.webp" alt="The gift card creator with a live card preview" /></Reveal>
            <Reveal delay={0.18}><TiltFrame src="/landing/swap.webp" alt="The swap page with a live quote button" /></Reveal>
          </div>
        </div>
        <Reveal>
          <ul className="grid gap-3 text-sm sm:grid-cols-3">
            {[[ArrowLeftRight, 'Swap USDC and EURC on Arc with a live quote'], [Waypoints, 'Bridge USDC between Base Sepolia and Arc'], [Building2, 'Payroll for a team, from a CSV']].map(([Icon, text]) => {
              const I = Icon as typeof Building2
              return <li key={text as string} className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border)' }}><I className="size-5 shrink-0" style={{ color: 'var(--green)' }} /> {text as string}</li>
            })}
          </ul>
        </Reveal>
      </Section>

      {/* Trust */}
      <Section eyebrow="Trust" title="Built so you do not have to trust us" intro="The rules live in the contract. The page that proves it is public.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.07}>
              <SpotCard className="card h-full p-5">
                <Icon className="size-6" style={{ color: 'var(--green)' }} />
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
              </SpotCard>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-5 text-sm" style={{ borderColor: 'var(--border-strong)', background: 'rgba(52,240,138,0.05)' }}>
            <Landmark className="size-5 shrink-0" style={{ color: 'var(--green)' }} />
            <span style={{ color: 'var(--ink-2)' }}>Honest status: this is a testnet product and the contract has not had an independent audit yet. See exactly what is built and what is not.</span>
            <Link to="/about" className="ml-auto inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--green)' }}>Read about it <ArrowRight className="size-4" /></Link>
          </div>
        </Reveal>
      </Section>

      {/* FAQ */}
      <Section eyebrow="Questions" title="Things people ask first">
        <Reveal>
          <div className="card divide-y" style={{ borderColor: 'var(--border)' }}>
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)' }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDown className="size-5 shrink-0 transition-transform duration-300 group-open:rotate-180" style={{ color: 'var(--green)' }} />
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* Final call to action */}
      <Reveal>
        <section className="relative overflow-hidden rounded-3xl border p-8 text-center sm:p-14" style={{ borderColor: 'var(--border-strong)', background: 'linear-gradient(145deg, rgba(15,95,53,0.55), rgba(6,17,12,0.9))' }}>
          <div className="pointer-events-none absolute left-1/2 top-0 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" aria-hidden="true" style={{ background: 'radial-gradient(closest-side, rgba(52,240,138,0.35), transparent)' }} />
          <div className="relative mx-auto max-w-2xl space-y-5">
            <h2 className="display text-3xl leading-tight sm:text-5xl">Ready to send your first campaign?</h2>
            <p style={{ color: 'var(--ink-2)' }}>Connect a wallet, fund a campaign in one transaction, and share the claim link. It takes a few minutes on Arc Testnet.</p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Magnetic><Link to="/campaigns/new" className="btn btn-primary !min-h-12 !px-7">Create a campaign <ArrowRight className="size-4" /></Link></Magnetic>
              <Magnetic><Link to="/gifts/new" className="btn btn-secondary !min-h-12 !px-7"><Gift className="size-4" /> Send a gift card</Link></Magnetic>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
