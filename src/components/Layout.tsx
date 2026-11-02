import { useEffect, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { TriangleAlert, Wallet, Waypoints } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ACTIVE } from '@/lib/network'
import { fmtUsd, shortAddr } from '@/lib/format'
import { useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { Spinner } from './ui'

const NAV = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/campaigns/new', label: 'Create' },
  { to: '/activity', label: 'Activity' },
  { to: '/verify', label: 'Verify' },
  { to: '/settings', label: 'Settings' },
]

function WalletPill() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnected, isConnecting, address }) => (
        <button type="button" className="btn btn-secondary !min-h-10 !px-3" onClick={show}>
          {isConnecting ? <Spinner /> : <Wallet className="size-4" />}
          {isConnected && address ? (
            <span className="flex items-center gap-2">
              <span className="mono text-[12.5px]">{shortAddr(address)}</span>
              {balance.data !== undefined && !w.wrongChain ? (
                <span className="hidden border-l pl-2 tabular-nums sm:inline" style={{ borderColor: 'var(--border)' }}>
                  {fmtUsd(balance.data)} USDC
                </span>
              ) : null}
            </span>
          ) : (
            'Connect wallet'
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

function NetworkBanner() {
  const w = useWallet()
  if (!ACTIVE.contract) {
    return (
      <div className="px-4 py-2 text-center text-sm" style={{ background: 'rgba(180,40,63,0.08)', color: 'var(--danger)' }}>
        The GiftFlow contract address is not configured for {ACTIVE.label}.
      </div>
    )
  }
  if (!w.wrongChain) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm" style={{ background: 'rgba(143,100,16,0.1)', color: 'var(--warn)' }}>
      <span className="inline-flex items-center gap-1.5">
        <TriangleAlert className="size-4" /> Your wallet is on a different network.
      </span>
      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void w.switchToTarget().catch(() => undefined)}>
        Switch to {ACTIVE.label}
      </button>
    </div>
  )
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `btn btn-ghost !min-h-9 shrink-0 !px-3 ${isActive ? '!bg-[var(--surface-muted)] !text-[var(--ink)]' : ''}`

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollTop />
      <NetworkBanner />
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(248,248,246,0.92)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2" aria-label="GiftFlow home">
            <span className="flex size-8 items-center justify-center rounded-lg" style={{ background: 'var(--green)', color: '#fff' }}>
              <Waypoints className="size-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">GiftFlow</span>
            {ACTIVE.isTestnet ? (
              <span className="hidden rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline" style={{ borderColor: 'var(--border-strong)', color: 'var(--muted)' }}>
                {ACTIVE.label}
              </span>
            ) : null}
          </Link>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/campaigns'} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <WalletPill />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-0.5 overflow-x-auto px-3 pb-2 lg:hidden" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/campaigns'} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <footer className="border-t px-4 py-8 pb-20 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
        <p>GiftFlow is non-custodial. Campaign funds sit in a smart contract on {ACTIVE.label}; there is no database or backend.</p>
        {ACTIVE.contract ? (
          <a className="mono mt-1 inline-block underline underline-offset-2" href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer">
            Contract {shortAddr(ACTIVE.contract)}
          </a>
        ) : null}
      </footer>
    </div>
  )
}
