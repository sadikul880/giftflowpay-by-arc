import { useEffect, useState, type ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, Loader2, Wallet } from 'lucide-react'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { ACTIVE } from '@/lib/network'
import { shortAddr } from '@/lib/format'
import type { CampaignState } from '@/lib/flow'
import { useWallet } from '@/hooks/useFlow'

const STATE_STYLE: Record<CampaignState, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: '#364152', bg: 'rgba(54,65,82,0.1)' },
  active: { label: 'Active', color: '#17803d', bg: 'rgba(23,128,61,0.12)' },
  completed: { label: 'Completed', color: '#14181f', bg: 'rgba(20,24,31,0.08)' },
  expired: { label: 'Expired', color: '#8f6410', bg: 'rgba(143,100,16,0.12)' },
  cancelled: { label: 'Cancelled', color: '#b4283f', bg: 'rgba(180,40,63,0.1)' },
}

export function StateBadge({ state }: { state: CampaignState }) {
  const s = STATE_STYLE[state]
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'warn' }) {
  const c = tone === 'green' ? ['#17803d', 'rgba(23,128,61,0.1)'] : tone === 'warn' ? ['#8f6410', 'rgba(143,100,16,0.12)'] : ['#364152', 'rgba(54,65,82,0.09)']
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: c[0], background: c[1] }}>
      {children}
    </span>
  )
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function CopyButton({
  value,
  label = 'Copy',
  disabled,
  className = 'btn btn-secondary',
}: {
  value: string
  label?: string
  disabled?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || !value}
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          })
          .catch(() => setCopied(false))
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function TxLink({ hash, label = 'View transaction' }: { hash: string; label?: string }) {
  return (
    <a
      href={buildTxExplorerUrl(ACTIVE.chainId, hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
      style={{ color: 'var(--green)' }}
    >
      {label} <ExternalLink className="size-3.5" />
    </a>
  )
}

export function AddressLink({ address, full = false }: { address: string; full?: boolean }) {
  return (
    <a
      href={buildAddressExplorerUrl(ACTIVE.chainId, address)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono text-[12.5px] underline-offset-2 hover:underline"
      title={address}
    >
      {full ? address : shortAddr(address)}
    </a>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const color = tone === 'error' ? 'var(--danger)' : tone === 'success' ? 'var(--success)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)'
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)', color }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="inset flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      <div className="text-base font-semibold">{title}</div>
      <p className="max-w-sm text-sm" style={{ color: 'var(--muted)' }}>
        {body}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ProgressBar({ claimed, refunded, total }: { claimed: bigint; refunded: bigint; total: bigint }) {
  const pct = (v: bigint) => (total > 0n ? Number((v * 10000n) / total) / 100 : 0)
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--surface-muted)' }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct(claimed))}
      aria-label="Share of the campaign claimed"
    >
      <div style={{ width: `${pct(claimed)}%`, background: 'var(--green)' }} />
      <div style={{ width: `${pct(refunded)}%`, background: 'var(--subtle)' }} />
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>{hint}</div> : null}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-2xl sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-prose text-sm sm:text-base" style={{ color: 'var(--muted)' }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function ConnectWalletButton({ className = 'btn btn-primary', label = 'Connect wallet' }) {
  return (
    <ConnectKitButton.Custom>
      {({ show, isConnecting }) => (
        <button type="button" className={className} onClick={show} disabled={isConnecting}>
          {isConnecting ? <Spinner /> : <Wallet className="size-4" />}
          {isConnecting ? 'Connecting…' : label}
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

/** Renders the right wallet prerequisite (connect, switch network) or the children once ready. */
export function WalletGate({ children, connectLabel, className = 'btn btn-primary w-full' }: { children: ReactNode; connectLabel?: string; className?: string }) {
  const w = useWallet()
  if (!w.isConnected) return <ConnectWalletButton className={className} label={connectLabel} />
  if (w.wrongChain) {
    return (
      <button type="button" className={className} onClick={() => void w.switchToTarget().catch(() => undefined)} disabled={w.isSwitching}>
        {w.isSwitching ? <Spinner /> : null}
        Switch to {ACTIVE.label}
      </button>
    )
  }
  return <>{children}</>
}

export type StepStatus = 'todo' | 'active' | 'done' | 'error'

export function StepList({ steps }: { steps: Array<{ label: string; hint?: string; status: StepStatus }> }) {
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.label} className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              background: s.status === 'done' ? 'var(--green)' : s.status === 'error' ? 'var(--danger)' : s.status === 'active' ? 'var(--accent)' : 'var(--surface-muted)',
              color: s.status === 'todo' ? 'var(--subtle)' : '#fff',
              border: s.status === 'todo' ? '1px solid var(--border-strong)' : 'none',
            }}
          >
            {s.status === 'done' ? <Check className="size-3" /> : s.status === 'active' ? <Spinner className="size-3" /> : s.status === 'error' ? '!' : ''}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: s.status === 'todo' ? 'var(--subtle)' : 'var(--ink)' }}>{s.label}</div>
            {s.hint && s.status !== 'todo' ? <div className="text-xs" style={{ color: 'var(--muted)' }}>{s.hint}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export interface ConfirmProps {
  open: boolean
  title: string
  description?: ReactNode
  rows?: Array<[string, ReactNode]>
  confirmLabel: string
  busy?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/** Confirmation modal for important transactions. Escape and the backdrop cancel unless a request is in flight. */
export function ConfirmDialog({ open, title, description, rows, confirmLabel, busy, danger, onConfirm, onCancel, children }: ConfirmProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => !busy && onCancel()} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card relative w-full max-w-md space-y-4 p-5 shadow-xl"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              {description ? <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{description}</p> : null}
            </div>
            {rows ? (
              <dl className="inset divide-y text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5" style={{ borderColor: 'var(--border)' }}>
                    <dt style={{ color: 'var(--muted)' }}>{k}</dt>
                    <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {children}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                style={danger ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                disabled={busy}
                onClick={onConfirm}
                autoFocus
              >
                {busy ? <Spinner /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
