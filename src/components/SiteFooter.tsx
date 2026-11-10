import { Link } from 'react-router-dom'
import { ArrowUp, ExternalLink } from 'lucide-react'
import { ACTIVE } from '@/lib/network'
import { shortAddr } from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const YEAR = new Date().getFullYear()

const PRODUCT = [
  { to: '/gifts/new', label: 'Gift cards' },
  { to: '/payroll', label: 'Payroll' },
  { to: '/rewards', label: 'Community rewards' },
  { to: '/send', label: 'Send payment' },
  { to: '/swap', label: 'Swap' },
  { to: '/bridge', label: 'Bridge' },
]
const RESOURCES = [
  { to: '/about', label: 'About' },
  { to: '/claim', label: 'Claim USDC' },
  { to: '/verify', label: 'Verify a campaign' },
  { to: '/privacy', label: 'Privacy' },
]

const linkClass = 'text-sm underline-offset-4 transition-colors hover:text-[var(--green)] hover:underline'

/** The public site's footer: brand, product and resource links, live network and contract, and the product's promises. */
export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t" style={{ borderColor: 'var(--border)', background: 'linear-gradient(180deg, transparent, rgba(6,17,12,0.9))' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(52,240,138,0.6), transparent)' }} />
      <div className="pointer-events-none absolute left-1/2 top-0 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(closest-side, rgba(52,240,138,0.25), transparent)' }} />

      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-5">
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label="GiftFlowPay home">
              <img src="/logo.jpg" alt="" width={40} height={40} className="size-10 rounded-full" />
              <span className="text-xl font-semibold tracking-tight">GiftFlowPay</span>
            </Link>
            <p className="max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
              Send, reward and pay with USDC on Arc. Fund a campaign once and let the smart contract decide who can claim what, and when.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium" style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)' }}>
                <span className="size-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
                {ACTIVE.label}
              </span>
              {ACTIVE.contract ? (
                <a className="mono inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--green)]" style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)' }} href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer">
                  Contract {shortAddr(ACTIVE.contract)} <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </div>

          <nav aria-label="Product" className="space-y-4">
            <div className="label">Product</div>
            <ul className="space-y-2.5">
              {PRODUCT.map((l) => (
                <li key={l.to}><Link to={l.to} className={linkClass} style={{ color: 'var(--ink-2)' }}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Resources" className="space-y-4">
            <div className="label">Resources</div>
            <ul className="space-y-2.5">
              {RESOURCES.map((l) => (
                <li key={l.to}><Link to={l.to} className={linkClass} style={{ color: 'var(--ink-2)' }}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        </div>

        <ul className="mt-12 grid gap-3 text-xs sm:grid-cols-3" style={{ color: 'var(--muted)' }}>
          {['Non-custodial: funds sit in a smart contract', 'No database and no backend', 'Every campaign is publicly verifiable'].map((t) => (
            <li key={t} className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.015)' }}>{t}</li>
          ))}
        </ul>

        <div className="pointer-events-none mt-10 select-none text-center font-semibold leading-none tracking-tighter" aria-hidden="true" style={{ fontSize: 'clamp(3rem, 14vw, 9.5rem)', background: 'linear-gradient(180deg, rgba(52,240,138,0.22), rgba(52,240,138,0))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          GiftFlowPay
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
          <p>&copy; {YEAR} GiftFlowPay. Testnet product: testnet USDC has no real value, and the contract has not yet had an independent audit.</p>
          <button type="button" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition-colors hover:border-[var(--green)] hover:text-[var(--green)]" style={{ borderColor: 'var(--border-strong)' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top <ArrowUp className="size-3.5" />
          </button>
        </div>
      </div>
    </footer>
  )
}
