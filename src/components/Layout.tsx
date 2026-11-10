import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { Activity, BadgeCheck, CirclePlus, Gift, HandCoins, Layers, LayoutDashboard, Menu, Send, Settings, TriangleAlert, Users, Wallet, X } from 'lucide-react'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ACTIVE } from '@/lib/network'
import { fmtUsd, shortAddr } from '@/lib/format'
import { useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { Spinner } from './ui'

const APP_NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/gifts/new', label: 'Gift cards', Icon: Gift, end: true },
  { to: '/send', label: 'Send payment', Icon: Send, end: true },
  { to: '/payroll', label: 'Payroll', Icon: Users, end: true },
  { to: '/campaigns', label: 'Campaigns', Icon: Layers, end: false },
  { to: '/campaigns/new', label: 'Create campaign', Icon: CirclePlus, end: true },
  { to: '/activity', label: 'Activity', Icon: Activity, end: false },
  { to: '/settings', label: 'Settings', Icon: Settings, end: false },
]

const APP_LINKS = [
  { to: '/claim', label: 'Claim USDC', Icon: HandCoins },
  { to: '/verify', label: 'Verify a campaign', Icon: BadgeCheck },
]

const PUBLIC_NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About', end: false },
  { to: '/claim', label: 'Claim', end: false },
  { to: '/verify', label: 'Verify', end: false },
]

function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="GiftFlowPay home">
      <img src="/logo.jpg" alt="" width={36} height={36} className="size-9 rounded-full" />
      <span className="text-lg font-semibold tracking-tight">GiftFlowPay</span>
    </Link>
  )
}

function NetworkPill() {
  return (
    <span className="hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex" style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)' }}>
      <span className="size-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
      {ACTIVE.label}
    </span>
  )
}

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
      <div className="px-4 py-2 text-center text-sm" style={{ background: 'rgba(255,107,129,0.12)', color: 'var(--danger)' }}>
        The GiftFlowPay contract address is not configured for {ACTIVE.label}.
      </div>
    )
  }
  if (!w.wrongChain) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-sm" style={{ background: 'rgba(243,184,75,0.14)', color: 'var(--warn)' }}>
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

function Footer() {
  return (
    <footer className="border-t px-4 py-8 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
      <nav className="mb-3 flex items-center justify-center gap-4 text-sm" aria-label="Footer">
        <Link to="/about" className="underline-offset-2 hover:underline">About</Link>
        <Link to="/privacy" className="underline-offset-2 hover:underline">Privacy</Link>
      </nav>
      <p>GiftFlowPay is non-custodial. Campaign funds sit in a smart contract on {ACTIVE.label}; there is no database or backend.</p>
      {ACTIVE.contract ? (
        <a className="mono mt-1 inline-block underline underline-offset-2" href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer">
          Contract {shortAddr(ACTIVE.contract)}
        </a>
      ) : null}
    </footer>
  )
}

const publicLink = ({ isActive }: { isActive: boolean }) =>
  `btn btn-ghost !min-h-9 shrink-0 !px-3 ${isActive ? '!bg-[var(--green-soft)] !text-[var(--green)]' : ''}`

/** Marketing and recipient-facing pages: landing, about, privacy, claim and verify. No sidebar. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollTop />
      <NetworkBanner />
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(5,10,8,0.82)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {PUBLIC_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={publicLink}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="btn btn-primary !min-h-10 !px-4">Launch app</Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Main">
          {PUBLIC_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={publicLink}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="px-2 pt-1">
        <Brand to="/dashboard" />
      </div>
      <nav className="flex flex-col gap-1" aria-label="App">
        {APP_NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `sidebar-link ${isActive && !(to === '/campaigns' && pathname === '/campaigns/new') ? 'active' : ''}`}>
            <Icon className="size-[18px]" /> {label}
          </NavLink>
        ))}
        <div className="label mt-4 px-3.5 pb-1">Public pages</div>
        {APP_LINKS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} className="sidebar-link">
            <Icon className="size-[18px]" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="card mt-auto space-y-1.5 p-4 text-xs" style={{ color: 'var(--muted)' }}>
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          <span className="size-2 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          {ACTIVE.label}
        </div>
        <p>Non-custodial USDC payments. Funds stay in a smart contract you can verify.</p>
        {ACTIVE.contract ? (
          <a className="mono inline-block underline underline-offset-2" href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer">
            {shortAddr(ACTIVE.contract)}
          </a>
        ) : null}
      </div>
    </div>
  )
}

/** The signed-in product: fixed sidebar on desktop, slide-over menu on phones. */
export function AppLayout() {
  const { pathname } = useLocation()
  // The menu belongs to the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string>()
  const open = openOn === pathname
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : undefined)

  return (
    <div className="min-h-dvh lg:pl-64">
      <ScrollTop />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r p-4 lg:block" style={{ borderColor: 'var(--border)', background: 'rgba(5,10,8,0.7)' }}>
        <SidebarContent />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="relative h-full w-72 max-w-[85vw] overflow-y-auto border-r p-4" style={{ borderColor: 'var(--border-strong)', background: 'var(--surface)' }}>
            <button type="button" className="btn btn-ghost absolute right-2 top-2 !min-h-9 !px-2" aria-label="Close menu" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh flex-col">
        <NetworkBanner />
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur" style={{ borderColor: 'var(--border)', background: 'rgba(5,10,8,0.82)' }}>
          <div className="flex items-center gap-2 lg:hidden">
            <button type="button" className="btn btn-secondary !min-h-10 !px-2.5" aria-label="Open menu" onClick={() => setOpen(true)}>
              <Menu className="size-5" />
            </button>
            <img src="/logo.jpg" alt="" width={32} height={32} className="size-8 rounded-full" />
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NetworkPill />
            <WalletPill />
          </div>
        </header>
        <main className="w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  )
}
