import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { CampaignState } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'
import type { Leaf } from '@/lib/tree'
import { AddressLink, CopyButton, Pill } from './ui'

const PAGE = 25

interface Props {
  leaves: Leaf[]
  /** Claimed flags per index from the contract bitmap. */
  flags?: boolean[]
  state: CampaignState
  labels?: Map<number, string>
  links?: Map<number, string>
  me?: string
}

export function RecipientsTable({ leaves, flags, state, labels, links, me }: Props) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leaves.filter((l) => {
      if (!needle) return true
      return l.account.toLowerCase().includes(needle) || (labels?.get(l.index) ?? '').toLowerCase().includes(needle) || String(l.index + 1) === needle
    })
  }, [leaves, q, labels])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const safePage = Math.min(page, pages - 1)
  const slice = rows.slice(safePage * PAGE, safePage * PAGE + PAGE)

  const statusOf = (l: Leaf) => {
    if (flags === undefined) return <span className="skeleton inline-block h-4 w-16" />
    if (flags[l.index]) return <Pill tone="green">Claimed</Pill>
    if (state === 'cancelled') return <Pill>Cancelled</Pill>
    if (state === 'expired') return <Pill tone="warn">Expired</Pill>
    if (state === 'scheduled') return <Pill>Scheduled</Pill>
    return <Pill>Pending</Pill>
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--subtle)' }} />
        <input
          className="field !min-h-10 !pl-9"
          placeholder="Search wallet or name"
          aria-label="Search recipients"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
        />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Recipient</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              {links ? <th>Claim link</th> : null}
            </tr>
          </thead>
          <tbody>
            {slice.map((l) => {
              const label = labels?.get(l.index)
              const mine = me && l.walletBound && l.account.toLowerCase() === me.toLowerCase()
              return (
                <tr key={l.index} style={mine ? { background: 'var(--green-soft)' } : undefined}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>{l.index + 1}</td>
                  <td>
                    <div className="flex flex-col">
                      {label ? <span className="font-medium">{label}</span> : null}
                      {l.walletBound ? <AddressLink address={l.account} /> : <span className="text-xs" style={{ color: 'var(--muted)' }}>Link-based allocation</span>}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">${fmtUsd(l.amount)}</td>
                  <td>{statusOf(l)}</td>
                  {links ? (
                    <td>
                      {links.get(l.index) ? <CopyButton value={links.get(l.index) ?? ''} label="Copy" className="btn btn-ghost !min-h-8 !px-2 text-xs" /> : <span style={{ color: 'var(--subtle)' }}>-</span>}
                    </td>
                  ) : null}
                </tr>
              )
            })}
            {slice.length === 0 ? (
              <tr>
                <td colSpan={links ? 5 : 4} className="py-8 text-center" style={{ color: 'var(--muted)' }}>No recipients match your search.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--muted)' }}>
          <span className="tabular-nums">{rows.length} recipients · page {safePage + 1} of {pages}</span>
          <div className="flex gap-1">
            <button type="button" className="btn btn-secondary !min-h-9 !px-2.5" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className="btn btn-secondary !min-h-9 !px-2.5" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
