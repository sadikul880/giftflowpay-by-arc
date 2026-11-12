import { useDeferredValue, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ArrowLeft, Inbox, LayoutDashboard, LogOut, Search, ShieldCheck, Users } from 'lucide-react'
import { ConnectWalletButton, EmptyState, Notice, PageHeader, Skeleton, Spinner, Stat } from '@/components/ui'
import { Pager, Thread, TicketRow } from '@/components/SupportParts'
import { authed, useAdminAddress, useIsAdmin, useSupportSession } from '@/hooks/useSupport'
import { useGlobals, useWallet } from '@/hooks/useFlow'
import { ApiError, TICKET_KINDS, timeAgo, type AdminStats, type AdminUser, type Paged, type TicketKind, type TicketStatus, type TicketSummary, type TicketThread } from '@/lib/support'
import { fmtUsd, shortAddr } from '@/lib/format'
import { AddressLink } from '@/components/ui'

type Tab = 'overview' | 'inbox' | 'users'
const TABS: Array<{ id: Tab; label: string; Icon: typeof Inbox }> = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'users', label: 'Users', Icon: Users },
]
const PAGE_SIZE = 10

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

/** Admin panel. Visible only for the admin wallet; the API checks the wallet again on every request. */
export default function Admin() {
  const w = useWallet()
  const adminAddress = useAdminAddress()
  const isAdmin = useIsAdmin()
  const { session, signIn, signOut, busy, error } = useSupportSession()

  if (adminAddress === undefined) return <Skeleton className="h-64 w-full !rounded-2xl" />
  if (w.isConnected && !isAdmin) return <Navigate to="/dashboard" replace />

  if (!w.isConnected) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Admin" subtitle="Sign in with the admin wallet to see support messages, users and statistics." />
        <div className="card space-y-3 p-5">
          <ConnectWalletButton className="btn btn-primary w-full sm:w-auto" label="Connect admin wallet" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Admin" subtitle="Sign in with the admin wallet to see support messages, users and statistics." />
        <div className="card space-y-3 p-5">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Sign one free message to open the admin panel. No transaction is sent.</p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void signIn()}>
            {busy ? <Spinner /> : <ShieldCheck className="size-4" />} {busy ? 'Waiting for your wallet…' : 'Sign in as admin'}
          </button>
        </div>
      </div>
    )
  }

  return <Panel token={session.token} onSignOut={signOut} />
}

function Panel({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="Support messages and replies, the people who signed in to support, and platform numbers."
        actions={<button type="button" className="btn btn-ghost !min-h-10" onClick={onSignOut}><LogOut className="size-4" /> Sign out</button>}
      />
      <div role="tablist" aria-label="Admin sections" className="mb-6 flex flex-wrap gap-2">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn !min-h-10 ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'overview' ? <Overview token={token} onOpenInbox={() => setTab('inbox')} /> : null}
      {tab === 'inbox' ? <InboxTab token={token} /> : null}
      {tab === 'users' ? <UsersTab token={token} /> : null}
    </div>
  )
}

function Overview({ token, onOpenInbox }: { token: string; onOpenInbox: () => void }) {
  const stats = useQuery({ queryKey: ['admin-stats'], queryFn: () => authed<AdminStats>(token, '/admin/stats'), refetchInterval: 30_000, retry: false })
  const globals = useGlobals()
  const s = stats.data

  if (stats.isError) return <Notice tone="error">{errText(stats.error)}</Notice>

  const max = Math.max(1, ...(s?.days.flatMap((d) => [d.tickets, d.users]) ?? [1]))
  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="support-stats">
        <h2 id="support-stats" className="text-base font-semibold">Support</h2>
        <div className="card grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          {s ? (
            <>
              <Stat label="Open" value={s.open} hint={`${s.closed} closed`} />
              <Stat label="Waiting for reply" value={s.awaitingReply} hint={s.unread > 0 ? `${s.unread} unread` : 'all read'} />
              <Stat label="Conversations" value={s.tickets} hint={`${s.messages} messages`} />
              <Stat label="Replies sent" value={s.replies} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)
          )}
        </div>
        {s && s.awaitingReply > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={onOpenInbox}>
            <Inbox className="size-4" /> {s.awaitingReply} waiting for a reply: open the inbox
          </button>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="user-stats">
        <h2 id="user-stats" className="text-base font-semibold">People</h2>
        <div className="card grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          {s ? (
            <>
              <Stat label="Users" value={s.users} hint="signed in to support" />
              <Stat label="Active, 7 days" value={s.activeUsers7d} />
              <Stat label="New, 24 hours" value={s.newUsers24h} />
              <Stat label="Sign-ins" value={s.signIns} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="chart">
        <h2 id="chart" className="text-base font-semibold">Last 14 days</h2>
        <div className="card space-y-4 p-5">
          {s ? (
            <>
              <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Conversations and new users per day for the last 14 days">
                {s.days.map((d) => (
                  <div key={d.day} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${d.day}: ${d.tickets} conversations, ${d.users} new users`}>
                    <div className="w-full max-w-3 rounded-t" style={{ height: `${(d.tickets / max) * 100}%`, minHeight: d.tickets ? 3 : 1, background: 'var(--green)' }} />
                    <div className="w-full max-w-3 rounded-t" style={{ height: `${(d.users / max) * 100}%`, minHeight: d.users ? 3 : 1, background: 'rgba(195,213,202,0.55)' }} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                <span>{s.days[0]?.day} to {s.days[s.days.length - 1]?.day}</span>
                <span className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'var(--green)' }} /> Conversations</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: 'rgba(195,213,202,0.55)' }} /> New users</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                {TICKET_KINDS.map((k) => (
                  <span key={k.id}><span style={{ color: 'var(--muted)' }}>{k.label}:</span> <span className="font-semibold tabular-nums">{s.byKind[k.id]}</span></span>
                ))}
              </div>
            </>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="chain-stats">
        <h2 id="chain-stats" className="text-base font-semibold">All of GiftFlowPay on Arc</h2>
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
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Read from the contract. The people counts above only cover wallets that signed in to support, because GiftFlowPay itself has no accounts.</p>
      </section>
    </div>
  )
}

function Filter<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <select className="field !w-auto !min-h-10 text-sm" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function InboxTab({ token }: { token: string }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<'all' | TicketStatus>('all')
  const [kind, setKind] = useState<'all' | TicketKind>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number>()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const term = useDeferredValue(search.trim())

  const list = useQuery({
    queryKey: ['admin-tickets', status, kind, term, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (status !== 'all') p.set('status', status)
      if (kind !== 'all') p.set('kind', kind)
      if (term) p.set('q', term)
      return authed<Paged<TicketSummary>>(token, `/admin/tickets?${p}`)
    },
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
    retry: false,
  })
  const thread = useQuery({
    queryKey: ['admin-thread', selected],
    queryFn: () => authed<TicketThread>(token, `/admin/tickets/${selected}`),
    enabled: selected !== undefined,
    refetchInterval: 20_000,
    retry: false,
  })

  const changed = (next: TicketThread) => {
    qc.setQueryData(['admin-thread', next.id], next)
    void qc.invalidateQueries({ queryKey: ['admin-tickets'] })
    void qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  async function reply(text: string, close: boolean): Promise<boolean> {
    if (selected === undefined) return false
    setSending(true)
    setError(undefined)
    try {
      changed(await authed<TicketThread>(token, `/admin/tickets/${selected}/reply`, { method: 'POST', body: { message: text, close } }))
      return true
    } catch (e) {
      setError(errText(e))
      return false
    } finally {
      setSending(false)
    }
  }

  async function setTicketStatus(next: TicketStatus) {
    if (selected === undefined) return
    try {
      changed(await authed<TicketThread>(token, `/admin/tickets/${selected}/status`, { method: 'POST', body: { status: next } }))
    } catch (e) {
      setError(errText(e))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <section className={`space-y-3 ${selected !== undefined ? 'hidden lg:block' : ''}`} aria-label="Conversations">
        <div className="flex flex-wrap gap-2">
          <Filter label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1) }} options={[['all', 'All statuses'], ['open', 'Open'], ['closed', 'Closed']]} />
          <Filter label="Type" value={kind} onChange={(v) => { setKind(v); setPage(1) }} options={[['all', 'All types'], ...TICKET_KINDS.map((k): [TicketKind, string] => [k.id, k.label])]} />
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input className="field !pl-9" placeholder="Search wallet, subject or text" aria-label="Search conversations" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </label>
        {list.isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full !rounded-xl" />)}</div>
        ) : list.isError ? (
          <Notice tone="error">{errText(list.error)}</Notice>
        ) : list.data && list.data.items.length === 0 ? (
          <EmptyState title="Nothing here" body="No conversation matches these filters." />
        ) : (
          <>
            <div className="space-y-2">
              {list.data?.items.map((t) => <TicketRow key={t.id} t={t} who active={selected === t.id} onOpen={() => { setSelected(t.id); setError(undefined) }} />)}
            </div>
            {list.data ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} label="Conversations" /> : null}
          </>
        )}
      </section>

      <section className={`card min-w-0 p-5 ${selected === undefined ? 'hidden lg:block' : ''}`} aria-label="Conversation">
        {selected === undefined ? (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>Pick a conversation to read it and reply.</p>
        ) : (
          <div className="space-y-4">
            <button type="button" className="btn btn-ghost !min-h-9 !px-2 lg:hidden" onClick={() => setSelected(undefined)}><ArrowLeft className="size-4" /> Back to list</button>
            {thread.isLoading ? (
              <Skeleton className="h-48 w-full !rounded-xl" />
            ) : thread.isError ? (
              <Notice tone="error">{errText(thread.error)}</Notice>
            ) : thread.data ? (
              <Thread
                admin
                ticket={thread.data}
                sending={sending}
                error={error}
                onSend={reply}
                extra={
                  <button type="button" className="btn btn-secondary !min-h-9 !px-3 text-xs" onClick={() => void setTicketStatus(thread.data.status === 'open' ? 'closed' : 'open')}>
                    {thread.data.status === 'open' ? 'Close' : 'Reopen'}
                  </button>
                }
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}

function UsersTab({ token }: { token: string }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const term = useDeferredValue(search.trim())
  const users = useQuery({
    queryKey: ['admin-users', term, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (term) p.set('q', term)
      return authed<Paged<AdminUser>>(token, `/admin/users?${p}`)
    },
    placeholderData: keepPreviousData,
    retry: false,
  })

  let body: ReactNode
  if (users.isLoading) body = <Skeleton className="h-48 w-full !rounded-xl" />
  else if (users.isError) body = <Notice tone="error">{errText(users.error)}</Notice>
  else if (!users.data || users.data.items.length === 0) body = <EmptyState title="No users yet" body="Wallets appear here after they sign in to Support." />
  else {
    body = (
      <>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Wallet</th><th>First seen</th><th>Last seen</th><th className="text-right">Sign-ins</th><th className="text-right">Conversations</th></tr>
            </thead>
            <tbody>
              {users.data.items.map((u) => (
                <tr key={u.address}>
                  <td><AddressLink address={u.address} />{u.isAdmin ? <span className="ml-2 text-xs" style={{ color: 'var(--green)' }}>admin</span> : null}</td>
                  <td className="whitespace-nowrap" title={new Date(u.firstSeen).toISOString()}>{timeAgo(u.firstSeen)}</td>
                  <td className="whitespace-nowrap" title={new Date(u.lastSeen).toISOString()}>{timeAgo(u.lastSeen)}</td>
                  <td className="text-right tabular-nums">{u.signIns}</td>
                  <td className="text-right tabular-nums">{u.tickets}{u.openTickets ? <span style={{ color: 'var(--warn)' }}> ({u.openTickets} open)</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={PAGE_SIZE} total={users.data.total} onPage={setPage} label="Users" />
      </>
    )
  }

  return (
    <section className="space-y-4" aria-label="Users">
      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
        <input className="field mono !pl-9 !text-[13px]" placeholder="Search by wallet address" aria-label="Search users" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
      </label>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Wallets that signed in to Support ({users.data ? users.data.total : '…'} in total). Most recent first. {users.data?.items[0] ? `Latest: ${shortAddr(users.data.items[0].address)}.` : ''}
      </p>
      {body}
    </section>
  )
}

