import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import { Notice, Pill, Spinner } from '@/components/ui'
import { kindLabel, MESSAGE_MAX, pageCount, timeAgo, type TicketSummary, type TicketThread } from '@/lib/support'
import { shortAddr } from '@/lib/format'

/** Previous and next with the current page, for any paginated list. */
export function Pager({ page, pageSize, total, onPage, label = 'Pagination' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; label?: string }) {
  const pages = pageCount(total, pageSize)
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={label}>
      <span style={{ color: 'var(--muted)' }}>
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-secondary !min-h-9 !px-3" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums" aria-live="polite">
          Page {page} of {pages}
        </span>
        <button type="button" className="btn btn-secondary !min-h-9 !px-3" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  )
}

export function StatusPill({ t }: { t: Pick<TicketSummary, 'status' | 'awaitingAdmin'> }) {
  if (t.status === 'closed') return <Pill>Closed</Pill>
  return <Pill tone={t.awaitingAdmin ? 'warn' : 'green'}>{t.awaitingAdmin ? 'Waiting for reply' : 'Answered'}</Pill>
}

/** One row of a conversation list. `who` is shown to the admin (the wallet that wrote). */
export function TicketRow({ t, active, onOpen, who }: { t: TicketSummary; active?: boolean; onOpen: () => void; who?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className="flex w-full items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-[var(--green)]"
      style={{ borderColor: active ? 'var(--green)' : 'var(--border-strong)', background: active ? 'var(--green-soft)' : 'transparent' }}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {t.unread ? <span className="size-2 shrink-0 rounded-full" style={{ background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} aria-label="New" /> : null}
          <span className="truncate text-sm font-semibold">{t.subject}</span>
        </span>
        <span className="mt-1 block truncate text-xs" style={{ color: 'var(--muted)' }}>
          {kindLabel(t.kind)}
          {who && t.address ? ` · ${shortAddr(t.address)}` : ''} · {t.messages} {t.messages === 1 ? 'message' : 'messages'} · {timeAgo(t.updated)}
        </span>
      </span>
      <StatusPill t={t} />
    </button>
  )
}

/** The messages of one conversation and a box to answer. Used by the user and by the admin. */
export function Thread({
  ticket,
  admin = false,
  sending,
  error,
  onSend,
  extra,
}: {
  ticket: TicketThread
  admin?: boolean
  sending: boolean
  error?: string
  onSend: (text: string, close: boolean) => Promise<boolean>
  extra?: ReactNode
}) {
  const [text, setText] = useState('')
  const send = async (close: boolean) => {
    if (await onSend(text.trim(), close)) setText('')
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{ticket.subject}</h3>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            {kindLabel(ticket.kind)}
            {admin && ticket.address ? ` · ${ticket.address}` : ''} · opened {timeAgo(ticket.created)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill t={ticket} />
          {extra}
        </div>
      </div>

      <ol className="space-y-3" aria-label="Messages">
        {ticket.thread.map((m) => {
          const mine = admin ? m.author === 'admin' : m.author === 'user'
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[88%] rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: mine ? 'var(--border-strong)' : 'var(--border)', background: mine ? 'var(--green-soft)' : 'var(--surface-muted)' }}>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: m.author === 'admin' ? 'var(--green)' : 'var(--muted)' }}>
                  {m.author === 'admin' ? <ShieldCheck className="size-3.5" /> : null}
                  {m.author === 'admin' ? 'GiftFlowPay team' : admin ? 'User' : 'You'} · {timeAgo(m.created)}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </div>
            </li>
          )
        })}
      </ol>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="space-y-2">
        <label className="label" htmlFor={`reply-${ticket.id}`}>
          {admin ? 'Your reply' : ticket.status === 'closed' ? 'Write again to reopen this conversation' : 'Add a message'}
        </label>
        <textarea id={`reply-${ticket.id}`} className="field min-h-24 resize-y" maxLength={MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {text.length} / {MESSAGE_MAX}
          </span>
          <div className="flex flex-wrap gap-2">
            {admin ? (
              <button type="button" className="btn btn-secondary" disabled={sending || text.trim().length < 1} onClick={() => void send(true)}>
                Reply and close
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={sending || text.trim().length < 1} onClick={() => void send(false)}>
              {sending ? <Spinner /> : null} {admin ? 'Send reply' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
