import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, ExternalLink } from 'lucide-react'
import { ConnectWalletButton, EmptyState, Notice, PageHeader, Skeleton, Spinner } from '@/components/ui'
import { useWallet } from '@/hooks/useFlow'
import { direction, fetchTransactions, fetchTransfers, labelTx, type ApiTransfer, type ApiTx } from '@/lib/explorerApi'
import { fmtDate, shortAddr, trimFee } from '@/lib/format'
import { ACTIVE } from '@/lib/network'
import { ARC_EURC, ARC_USDC, fmtToken } from '@/lib/tokens'
import { buildTxExplorerUrl } from '@/onchain-facts'

type Tab = 'transactions' | 'transfers'

const KNOWN_TOKENS = [ARC_USDC.address, ARC_EURC.address].map((a) => a.toLowerCase())

function TxLinkIcon({ hash }: { hash: string }) {
  return (
    <a href={buildTxExplorerUrl(ACTIVE.chainId, hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2" style={{ color: 'var(--green)' }}>
      {shortAddr(hash)} <ExternalLink className="size-3" />
    </a>
  )
}

function TxRow({ tx }: { tx: ApiTx }) {
  const { label } = labelTx(tx)
  return (
    <tr>
      <td className="whitespace-nowrap text-xs" style={{ color: 'var(--muted)' }}>{tx.timestamp ? fmtDate(tx.timestamp) : '-'}</td>
      <td className="font-medium">{label}</td>
      <td>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: tx.ok ? 'var(--green)' : 'var(--danger)', background: tx.ok ? 'var(--green-soft)' : 'rgba(255,107,129,0.14)' }}>{tx.ok ? 'Confirmed' : 'Failed'}</span>
      </td>
      <td className="whitespace-nowrap text-right tabular-nums text-xs" style={{ color: 'var(--muted)' }}>{tx.fee > 0n ? `${trimFee(tx.fee)} USDC` : '-'}</td>
      <td className="text-right"><TxLinkIcon hash={tx.hash} /></td>
    </tr>
  )
}

function TransferRow({ t, me }: { t: ApiTransfer; me: `0x${string}` }) {
  const dir = direction(t, me)
  const known = KNOWN_TOKENS.includes(t.token.address.toLowerCase())
  const other = dir === 'in' ? t.from : t.to
  return (
    <tr>
      <td className="whitespace-nowrap text-xs" style={{ color: 'var(--muted)' }}>{t.timestamp ? fmtDate(t.timestamp) : '-'}</td>
      <td>
        <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: dir === 'in' ? 'var(--green)' : 'var(--ink)' }}>
          {dir === 'in' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
          {dir === 'in' ? 'Received' : dir === 'out' ? 'Sent' : 'Self transfer'}
        </span>
      </td>
      <td className="tabular-nums">
        {dir === 'in' ? '+' : dir === 'out' ? '-' : ''}{fmtToken(t.value, t.token.decimals)} {t.token.symbol}
        {!known ? <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(243,184,75,0.14)', color: 'var(--warn)' }}>unverified token</span> : null}
      </td>
      <td className="mono text-xs">{shortAddr(other)}</td>
      <td className="text-right"><TxLinkIcon hash={t.txHash} /></td>
    </tr>
  )
}

export default function Transactions() {
  const w = useWallet()
  const [tab, setTab] = useState<Tab>('transactions')
  const me = w.address

  const txs = useInfiniteQuery({
    queryKey: ['wallet-txs', me],
    enabled: Boolean(me) && tab === 'transactions',
    initialPageParam: undefined as Record<string, string> | undefined,
    queryFn: ({ pageParam }) => fetchTransactions(me as string, pageParam),
    getNextPageParam: (last) => last.next,
    retry: 1,
  })
  const transfers = useInfiniteQuery({
    queryKey: ['wallet-transfers', me],
    enabled: Boolean(me) && tab === 'transfers',
    initialPageParam: undefined as Record<string, string> | undefined,
    queryFn: ({ pageParam }) => fetchTransfers(me as string, pageParam),
    getNextPageParam: (last) => last.next,
    retry: 1,
  })

  const q = tab === 'transactions' ? txs : transfers
  const rows = tab === 'transactions' ? txs.data?.pages.flatMap((p) => p.items) ?? [] : transfers.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div>
      <PageHeader title="Transactions" subtitle="Everything your wallet has done on Arc Testnet: campaigns, payouts, claims and swaps." />

      {!w.isConnected || !me ? (
        <EmptyState title="Connect your wallet" body="Connect a wallet to see its history." action={<ConnectWalletButton />} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="tablist" aria-label="History type">
              {([['transactions', 'Transactions'], ['transfers', 'Token transfers']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn !min-h-9 ${tab === id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Read from the Arc block explorer&rsquo;s public index. Every row links to the transaction.</p>
          </div>

          {q.isError ? <Notice tone="error">{q.error instanceof Error ? q.error.message : 'Could not load the history.'} <button type="button" className="font-semibold underline" onClick={() => void q.refetch()}>Try again</button></Notice> : null}

          {q.isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
          ) : rows.length === 0 && !q.isError ? (
            <EmptyState title="Nothing yet" body="This wallet has no activity on Arc Testnet yet." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  {tab === 'transactions' ? (
                    <tr><th>Time</th><th>Action</th><th>Status</th><th className="text-right">Network fee</th><th className="text-right">Transaction</th></tr>
                  ) : (
                    <tr><th>Time</th><th>Direction</th><th>Amount</th><th>Counterparty</th><th className="text-right">Transaction</th></tr>
                  )}
                </thead>
                <tbody>
                  {tab === 'transactions'
                    ? (rows as ApiTx[]).map((t) => <TxRow key={t.hash} tx={t} />)
                    : (rows as ApiTransfer[]).map((t) => <TransferRow key={`${t.txHash}:${t.logIndex}`} t={t} me={me} />)}
                </tbody>
              </table>
            </div>
          )}

          {q.hasNextPage ? (
            <button type="button" className="btn btn-secondary" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
              {q.isFetchingNextPage ? <Spinner /> : null} Load older
            </button>
          ) : rows.length > 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>End of history.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
