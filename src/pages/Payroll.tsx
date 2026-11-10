import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, parseEventLogs } from 'viem'
import { CheckCircle2, Download, Lock, Send } from 'lucide-react'
import { toast } from 'sonner'
import { RowsEditor } from '@/components/RowsEditor'
import { ConfirmDialog, Notice, PageHeader, Skeleton, Spinner, TxLink, WalletGate } from '@/components/ui'
import { useAllowance, useGlobals, useNow, useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { flowAbi } from '@/lib/abi'
import { readClaimedFlags } from '@/lib/chain'
import { publicClient } from '@/lib/events'
import { encodeMeta, leavesFromRows, LIMITS, newRow, randomSalt, type RecipientRow } from '@/lib/flow'
import { fmtDate, fmtUsd } from '@/lib/format'
import { downloadText } from '@/lib/links'
import { payrollReady, receiptCsv, splitBatches } from '@/lib/payroll'
import { ACTIVE, contractAddress } from '@/lib/network'
import { buildTree, proofFor, type Leaf, type SumTree } from '@/lib/tree'
import { parseUsdc } from '@/onchain-money'

const TEMPLATE = 'wallet,amount,label\n0x0000000000000000000000000000000000000001,2500,Alice (replace with a real wallet)\n0x0000000000000000000000000000000000000002,3100,Bob (replace with a real wallet)\n'
/** How long a payroll campaign stays open. Anything not paid by then can be refunded from the campaign page. */
const WINDOW_DAYS = 30

interface Session {
  id: bigint
  name: string
  total: bigint
  leaves: Leaf[]
  tree: SumTree
  labels: string[]
  createHash: string
  batchHashes: string[]
}

export default function Payroll() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  const allowance = useAllowance(w.address)
  const globals = useGlobals()
  const tx = useTxAction()
  const now = useNow(30000)

  const [name, setName] = useState('Payroll')
  const [rows, setRows] = useState<RecipientRow[]>(() => [newRow()])
  const [tried, setTried] = useState(false)
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<Session>()
  const [progress, setProgress] = useState<string>()

  const max = LIMITS.privateRecipients
  const total = useMemo(() => rows.reduce((s, r) => { try { return s + parseUsdc(r.amount.trim() || '0') } catch { return s } }, 0n), [rows])
  const ready = payrollReady(rows, max) && name.trim() !== ''
  const batches = Math.ceil(rows.length / LIMITS.batch)
  const short = balance.data !== undefined && balance.data < total
  const overCap = globals.data !== undefined && total > globals.data.maxTotalAllocation
  const needsApproval = allowance.data === undefined || allowance.data < total

  /** Pays every wallet that has not been paid yet, in batches, reading the chain before each one. */
  async function pay(s: Session) {
    const owner = w.address
    if (!owner) return false
    const contract = contractAddress()
    const ok = await tx.run(async (_st, write) => {
      const flags = await readClaimedFlags(s.id, s.leaves.length)
      const pending = s.leaves.filter((l) => !flags[l.index])
      const groups = splitBatches(pending, LIMITS.batch)
      for (let b = 0; b < groups.length; b++) {
        setProgress(`Sending batch ${b + 1} of ${groups.length}`)
        const entries = groups[b].map((l) => ({
          a: { index: BigInt(l.index), account: l.account, amount: l.amount, walletBound: true },
          proof: proofFor(s.tree, l.index),
        }))
        const { request } = await publicClient.simulateContract({ account: owner, address: contract, abi: flowAbi, functionName: 'distribute', args: [s.id, entries] })
        const receipt = await write(request)
        setSession((cur) => (cur ? { ...cur, batchHashes: [...cur.batchHashes, receipt.transactionHash] } : cur))
      }
      return true
    })
    setProgress(undefined)
    void balance.refetch()
    return Boolean(ok)
  }

  async function run() {
    if (!w.address || !ready) return
    const owner = w.address
    const contract = contractAddress()
    const created = await tx.run(async (_st, write) => {
      const head = await publicClient.getBlock()
      const now = Number(head.timestamp)
      const leaves = leavesFromRows(rows, undefined)
      const tree = buildTree(leaves)
      if (tree.total !== total) throw new Error('The payroll total changed unexpectedly. Please review and try again.')

      const current = await publicClient.readContract({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'allowance', args: [owner, contract] })
      if (current < total) {
        setProgress('Approve USDC in your wallet')
        await write({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'approve', args: [contract, total] })
      }
      setProgress('Fund the payroll in your wallet')
      const { request } = await publicClient.simulateContract({
        account: owner,
        address: contract,
        abi: flowAbi,
        functionName: 'createCampaign',
        args: [
          { merkleRoot: tree.root, totalAllocation: total, recipientCount: leaves.length, startTime: BigInt(now), claimDeadline: BigInt(now + WINDOW_DAYS * 86400), isPublic: false, salt: randomSalt() },
          encodeMeta({ n: name.trim(), d: '', t: 'payroll', m: '', k: 'list' }),
          '0x',
        ],
      })
      const receipt = await write(request)
      const [evt] = parseEventLogs({ abi: flowAbi, eventName: 'CampaignCreated', logs: receipt.logs })
      if (!evt) throw new Error('The payroll could not be confirmed. Check the transaction on the explorer.')
      return { id: evt.args.campaignId, name: name.trim(), total, leaves, tree, labels: rows.map((r) => r.label.trim()), createHash: receipt.transactionHash, batchHashes: [] } satisfies Session
    })
    setOpen(false)
    setProgress(undefined)
    if (!created) return
    setSession(created)
    toast.success('Payroll funded and confirmed onchain')
    if (await pay(created)) toast.success('All payments sent')
  }

  if (session) return <PayrollProgress session={session} busy={tx.busy} progress={progress} error={tx.error} onResume={() => void pay(session)} />

  return (
    <div className="max-w-4xl">
      <PageHeader title="Payroll" subtitle="Pay a team in one run. Add wallets by hand or import a CSV, fund once, and each wallet is paid directly." />
      <div className="space-y-6">
        <label className="block max-w-md space-y-1.5">
          <span className="label">Payroll name</span>
          <input className="field" maxLength={LIMITS.name} value={name} onChange={(e) => setName(e.target.value)} placeholder="Payroll, November" />
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>The name is written to a public onchain event. Employee labels stay in your browser.</span>
        </label>

        <RowsEditor
          rows={rows}
          onChange={setRows}
          max={max}
          showErrors={tried}
          requireWallet
          template={TEMPLATE}
          templateName="giftflowpay-payroll-template.csv"
          limitLabel="A payroll run"
          noun="employee"
          help={<>Columns: wallet, amount in USDC, optional label (name or handle). Every row needs a wallet. Labels are used for your receipt only and are never published.</>}
        />

        <section className="card space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 text-sm sm:grid-cols-4">
            <div><div className="label">Employees</div><div className="mt-1 text-lg font-semibold tabular-nums">{rows.length}</div></div>
            <div><div className="label">Total</div><div className="mt-1 text-lg font-semibold tabular-nums">${fmtUsd(total)}</div></div>
            <div><div className="label">Your balance</div><div className="mt-1 text-lg font-semibold tabular-nums">{balance.data !== undefined ? `$${fmtUsd(balance.data)}` : w.isConnected ? '…' : '-'}</div></div>
            <div><div className="label">Transactions</div><div className="mt-1 text-lg font-semibold tabular-nums">{(needsApproval ? 1 : 0) + 1 + batches}</div><div className="text-xs" style={{ color: 'var(--muted)' }}>{needsApproval ? 'approve, fund, ' : 'fund, '}{batches} payout{batches === 1 ? '' : 's'}</div></div>
          </div>
          {short ? <Notice tone="error">Your balance is lower than the payroll total. You also need a little USDC for network fees. <a className="font-semibold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC</a></Notice> : null}
          {overCap ? <Notice tone="error">This total is above the contract&rsquo;s per-run limit of ${fmtUsd(globals.data?.maxTotalAllocation ?? 0n)}.</Notice> : null}
          {globals.data?.paused ? <Notice tone="error">GiftFlowPay is paused, so payroll cannot be funded right now.</Notice> : null}
          {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
          {tx.busy ? <Notice><span className="inline-flex items-center gap-2"><Spinner /> {progress ?? 'Working…'}</span></Notice> : null}
          <Notice>Payments are ordinary onchain transfers: wallet addresses and amounts can be seen on the block explorer.</Notice>
          <WalletGate connectLabel="Connect wallet to run payroll">
            <button
              type="button"
              className="btn btn-primary w-full sm:w-auto sm:min-w-64"
              disabled={tx.busy || short || overCap || Boolean(globals.data?.paused) || !ACTIVE.contract}
              onClick={() => (ready ? setOpen(true) : setTried(true))}
            >
              <Lock className="size-4" /> Fund and pay ${fmtUsd(total)}
            </button>
          </WalletGate>
        </section>
      </div>

      <ConfirmDialog
        open={open}
        title="Fund and run this payroll?"
        description={`Your USDC moves into the GiftFlowPay contract, then is sent to each wallet in ${batches} transaction${batches === 1 ? '' : 's'}. If a payout fails, the rest stays in the contract: you can resume, or refund it after ${fmtDate(now + WINDOW_DAYS * 86400)}.`}
        rows={[['Employees', String(rows.length)], ['Total', `${fmtUsd(total)} USDC`], ['Transactions', String((needsApproval ? 1 : 0) + 1 + batches)]]}
        confirmLabel="Fund and pay"
        busy={tx.busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void run()}
      />
    </div>
  )
}

function PayrollProgress({ session, busy, progress, error, onResume }: { session: Session; busy: boolean; progress?: string; error?: string; onResume: () => void }) {
  const n = session.leaves.length
  const flags = useQuery({
    queryKey: ['payroll-flags', session.id.toString(), session.batchHashes.length, busy],
    queryFn: () => readClaimedFlags(session.id, n),
    refetchInterval: busy ? false : 20000,
  })
  const paid = flags.data ? flags.data.filter(Boolean).length : undefined
  const complete = paid === n
  const waiting = flags.data === undefined

  const receipt = () => {
    downloadText(`giftflowpay-payroll-${session.id}-receipt.csv`, receiptCsv(session.leaves, session.labels, flags.data ?? []))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-6 shrink-0" style={{ color: complete ? 'var(--green)' : 'var(--warn)' }} />
        <div>
          <h1 className="display text-2xl">{complete ? 'Payroll complete' : 'Payroll funded'}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            ${fmtUsd(session.total)} USDC for {n} employee{n === 1 ? '' : 's'} was moved into the contract. <TxLink hash={session.createHash} label="Funding confirmed onchain" />
          </p>
        </div>
      </div>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Paid, confirmed onchain</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">{waiting ? <Skeleton className="inline-block h-8 w-24 align-middle" /> : `${paid} of ${n}`}</div>
          </div>
          {!complete ? (
            <button type="button" className="btn btn-primary" disabled={busy || waiting} onClick={onResume}>
              {busy ? <Spinner /> : <Send className="size-4" />} {busy ? progress ?? 'Sending…' : paid === 0 ? 'Send payments' : 'Continue sending'}
            </button>
          ) : null}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-muted)' }}>
          <div className="h-full" style={{ width: `${paid !== undefined ? (paid / n) * 100 : 0}%`, background: 'var(--green)' }} />
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {!complete && !busy && paid !== undefined && paid < n && !error ? <Notice>The payments are not finished. Nothing is lost: the unpaid part is still in the contract, so continue sending, or refund it from the campaign page after the deadline.</Notice> : null}
        {session.batchHashes.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {session.batchHashes.map((h, i) => <li key={h}><TxLink hash={h} label={`Payout transaction ${i + 1}`} /></li>)}
          </ul>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" disabled={waiting} onClick={receipt}><Download className="size-4" /> Download receipt (CSV)</button>
        <Link to={`/campaigns/${session.id}`} className="btn btn-secondary">Open campaign</Link>
        <Link to={`/campaigns/${session.id}/recipients`} className="btn btn-ghost">Recipients</Link>
        <button type="button" className="btn btn-ghost" onClick={() => window.location.assign('/payroll')}>New payroll</button>
      </div>
    </div>
  )
}
