import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, LogOut, MessageSquarePlus } from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { ConnectWalletButton, EmptyState, Notice, PageHeader, Skeleton, Spinner } from '@/components/ui'
import { Pager, Thread, TicketRow } from '@/components/SupportParts'
import { SOCIALS } from '@/components/Socials'
import { authed, useSupportSession } from '@/hooks/useSupport'
import { ApiError, MESSAGE_MAX, SUBJECT_MAX, TICKET_KINDS, type Paged, type TicketKind, type TicketSummary, type TicketThread } from '@/lib/support'
import { ACTIVE } from '@/lib/network'
import { shortAddr } from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const PAGE_SIZE = 5

const HELP: Array<{ q: string; a: string }> = [
  {
    q: 'My claim link does not work',
    a: 'Open the full link exactly as it was sent, including everything after the # sign: the claim secret lives there and a shortened or edited link loses it. Check on the Verify page that the campaign has started and has not expired, and that your wallet is on Arc Testnet. If the link was for one specific wallet, connect that wallet.',
  },
  {
    q: 'My transaction is pending or failed',
    a: 'Arc fees are paid in USDC, so keep a little USDC in the wallet for gas. A pending request needs your confirmation in the wallet window. You can look up any transaction on the Transactions page or in the block explorer before trying again, so you do not pay twice.',
  },
  {
    q: 'My wallet shows the wrong network',
    a: `GiftFlowPay runs on ${ACTIVE.label}. Use the Switch button in the yellow bar at the top of the page, or add the network in your wallet and reload.`,
  },
  {
    q: 'Swap says there is no route',
    a: 'Swap quotes come live from Circle App Kit and a third-party aggregator. Testnet liquidity is thin, so a pair or size can have no route at a given moment. Try a smaller amount, a different pair (USDC, EURC or cirBTC) or try again later. Asking for a quote costs nothing.',
  },
  {
    q: 'I lost a gift card link or QR',
    a: 'Open Gift cards from the wallet that created it. A funded gift card can show its link, QR and code again after you sign a message in your wallet. An unclaimed, expired card can be refunded from the same page.',
  },
]

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

/** Write to the GiftFlowPay team inside the site and read the replies. The conversation is tied to your wallet. */
export default function Support() {
  const { isConnected } = useAccount()
  const { session, signIn, signOut, busy, error } = useSupportSession()

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Support" subtitle="Ask a question, report an issue or suggest an idea. The team replies here, and you can read the answer any time you come back." />

      {!isConnected ? (
        <section className="card space-y-3 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Connect your wallet to write to us</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Your wallet is how we know which conversations are yours. There is no email or account, and connecting costs nothing.
          </p>
          <ConnectWalletButton className="btn btn-primary w-full sm:w-auto" label="Connect wallet" />
        </section>
      ) : !session ? (
        <section className="card space-y-3 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Sign in to support</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Sign one free message in your wallet to prove it is yours. No transaction is sent and no gas is spent. Your conversations stay linked to this wallet.
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={busy} onClick={() => void signIn()}>
            {busy ? <Spinner /> : null} {busy ? 'Waiting for your wallet…' : 'Sign in with wallet'}
          </button>
        </section>
      ) : (
        <Inbox token={session.token} address={session.address} onSignOut={signOut} />
      )}

      <section className="mt-10 space-y-3" aria-labelledby="faq">
        <h2 id="faq" className="text-lg font-semibold">Common problems</h2>
        <div className="space-y-2">
          {HELP.map((h) => (
            <details key={h.q} className="card group p-4 sm:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                {h.q}
                <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-45" style={{ color: 'var(--green)' }}>+</span>
              </summary>
              <p className="mt-3 text-sm" style={{ color: 'var(--ink-2)' }}>{h.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="card mt-8 space-y-3 p-5 sm:p-6" aria-labelledby="contact">
        <h2 id="contact" className="text-lg font-semibold">Other ways to reach us</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map((so) => (
            <a key={so.id} href={so.href} target="_blank" rel="noopener noreferrer" className="inset flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:border-[var(--green)]">
              <span className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true" style={{ color: 'var(--green)' }}><path d={so.path} /></svg>
                <span>
                  <span className="block text-sm font-semibold">{so.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>{so.href.replace('https://', '')}</span>
                </span>
              </span>
              <ExternalLink className="size-4" style={{ color: 'var(--muted)' }} />
            </a>
          ))}
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          We will never ask for your seed phrase or private key, and we cannot move, recover or reverse anyone&rsquo;s funds. Ignore anyone who messages you first offering help.
        </p>
        <ul className="space-y-1.5 pt-1 text-sm">
          <li><Link to="/verify" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>Verify a campaign</Link> <span style={{ color: 'var(--muted)' }}>: funding, claims and status, no wallet needed.</span></li>
          {ACTIVE.contract ? (
            <li><a href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>The GiftFlowPay contract</a> <span style={{ color: 'var(--muted)' }}>: every campaign and claim is public onchain.</span></li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'thread'; id: number }

function Inbox({ token, address, onSignOut }: { token: string; address: string; onSignOut: () => void }) {
  const qc = useQueryClient()
  const [view, setView] = useState<View>({ kind: 'list' })
  const [page, setPage] = useState(1)

  const list = useQuery({
    queryKey: ['support-mine', address, page],
    queryFn: () => authed<Paged<TicketSummary>>(token, `/tickets?page=${page}&pageSize=${PAGE_SIZE}`),
    refetchInterval: 30_000,
    retry: false,
  })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['support-mine'] })
    void qc.invalidateQueries({ queryKey: ['support-unread'] })
  }

  if (view.kind === 'new') {
    return (
      <NewMessage
        token={token}
        onBack={() => setView({ kind: 'list' })}
        onCreated={(t) => {
          refresh()
          toast.success('Message sent. We will reply here.')
          setView({ kind: 'thread', id: t.id })
        }}
      />
    )
  }
  if (view.kind === 'thread') {
    return (
      <ThreadPage
        token={token}
        id={view.id}
        onBack={() => {
          refresh()
          setView({ kind: 'list' })
        }}
      />
    )
  }

  return (
    <section className="space-y-4" aria-labelledby="mine">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mine" className="text-lg font-semibold">Your conversations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-xs" style={{ color: 'var(--muted)' }}>{shortAddr(address)}</span>
          <button type="button" className="btn btn-ghost !min-h-9 !px-3" onClick={onSignOut}><LogOut className="size-4" /> Sign out</button>
          <button type="button" className="btn btn-primary !min-h-10" onClick={() => setView({ kind: 'new' })}><MessageSquarePlus className="size-4" /> New message</button>
        </div>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full !rounded-xl" />)}</div>
      ) : list.isError ? (
        <Notice tone="error">{errText(list.error)}</Notice>
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState title="No messages yet" body="When you write to us, the conversation and our replies appear here." action={<button type="button" className="btn btn-primary" onClick={() => setView({ kind: 'new' })}>Write to us</button>} />
      ) : (
        <>
          <div className="space-y-2">
            {list.data?.items.map((t) => <TicketRow key={t.id} t={t} onOpen={() => setView({ kind: 'thread', id: t.id })} />)}
          </div>
          {list.data ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={setPage} label="Your conversations" /> : null}
        </>
      )}
    </section>
  )
}

function NewMessage({ token, onBack, onCreated }: { token: string; onBack: () => void; onCreated: (t: TicketThread) => void }) {
  const [kind, setKind] = useState<TicketKind>('question')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const ready = message.trim().length >= 5

  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      onCreated(await authed<TicketThread>(token, '/tickets', { method: 'POST', body: { kind, subject, message } }))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card space-y-5 p-5 sm:p-6" aria-labelledby="new">
      <button type="button" className="btn btn-ghost !min-h-9 !px-2" onClick={onBack}><ArrowLeft className="size-4" /> Back</button>
      <h2 id="new" className="text-lg font-semibold">Write to the GiftFlowPay team</h2>
      <fieldset className="space-y-2">
        <legend className="label mb-2">What is it about?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TICKET_KINDS.map((k) => (
            <label key={k.id} className="flex cursor-pointer flex-col rounded-xl border p-3 text-sm" style={{ borderColor: kind === k.id ? 'var(--green)' : 'var(--border-strong)', background: kind === k.id ? 'var(--green-soft)' : 'transparent' }}>
              <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
              <span className="font-semibold">{k.label}</span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">Subject (optional)</span>
        <input className="field" maxLength={SUBJECT_MAX} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="A few words" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Your message</span>
        <textarea className="field min-h-36 resize-y" maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={kind === 'issue' ? 'What did you do, what did you expect, and what happened instead? Which page was it on?' : 'Tell us more.'} />
        <span className="block text-right text-xs tabular-nums" style={{ color: 'var(--muted)' }}>{message.length} / {MESSAGE_MAX}</span>
      </label>
      <Notice tone="warn">Never include a seed phrase, private key, password or a full claim link (it contains a secret). We will never ask for them. Your message is stored with your wallet address and can be read by the GiftFlowPay team.</Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={!ready || busy} onClick={() => void submit()}>
        {busy ? <Spinner /> : <MessageSquarePlus className="size-4" />} Send message
      </button>
    </section>
  )
}

function ThreadPage({ token, id, onBack }: { token: string; id: number; onBack: () => void }) {
  const qc = useQueryClient()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const q = useQuery({
    queryKey: ['support-thread', id],
    queryFn: () => authed<TicketThread>(token, `/tickets/${id}`),
    refetchInterval: 20_000,
    retry: false,
  })

  async function send(text: string): Promise<boolean> {
    setSending(true)
    setError(undefined)
    try {
      const next = await authed<TicketThread>(token, `/tickets/${id}/messages`, { method: 'POST', body: { message: text } })
      qc.setQueryData(['support-thread', id], next)
      return true
    } catch (e) {
      setError(errText(e))
      return false
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card space-y-4 p-5 sm:p-6" aria-label="Conversation">
      <button type="button" className="btn btn-ghost !min-h-9 !px-2" onClick={onBack}><ArrowLeft className="size-4" /> All conversations</button>
      {q.isLoading ? <Skeleton className="h-48 w-full !rounded-xl" /> : q.isError ? <Notice tone="error">{errText(q.error)}</Notice> : q.data ? <Thread ticket={q.data} sending={sending} error={error} onSend={(t) => send(t)} /> : null}
    </section>
  )
}
