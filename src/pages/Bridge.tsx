import { useState } from 'react'
import { ArrowLeftRight, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { type EIP1193Provider } from 'viem'
import { toast } from 'sonner'
import { ConnectWalletButton, Notice, PageHeader, Spinner } from '@/components/ui'
import { useNow, useWallet } from '@/hooks/useFlow'
import { useToken } from '@/hooks/useToken'
import { kitMessage, loadKit, walletAdapter } from '@/lib/appkit'
import { BRIDGE_CHAINS, fmtToken, type BridgeChain } from '@/lib/tokens'
import { parseUsdc } from '@/onchain-money'
import type { BridgeResult, EstimateResult } from '@circle-fin/app-kit'

type Direction = 'in' | 'out'
const QUOTE_TTL_SECONDS = 90

const ROUTES: Record<Direction, { from: BridgeChain; to: BridgeChain; title: string }> = {
  in: { from: BRIDGE_CHAINS.Base_Sepolia, to: BRIDGE_CHAINS.Arc_Testnet, title: 'Base Sepolia to Arc Testnet' },
  out: { from: BRIDGE_CHAINS.Arc_Testnet, to: BRIDGE_CHAINS.Base_Sepolia, title: 'Arc Testnet to Base Sepolia' },
}

type Estimate = EstimateResult<string, string>
interface Reviewed {
  estimate: Estimate
  key: string
  at: number
}
interface StepView {
  name: string
  state: string
  txHash?: string
  explorerUrl?: string
  error?: unknown
}

const STEP_LABEL: Record<string, string> = {
  approve: 'Approve USDC',
  burn: 'Burn USDC on the source chain',
  fetchAttestation: 'Wait for Circle to sign the burn',
  mint: 'Mint USDC on the destination chain',
}
const STEP_ORDER = ['approve', 'burn', 'fetchAttestation', 'mint']

export default function Bridge() {
  const w = useWallet()
  const { connector, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const now = useNow(5000)

  const [dir, setDir] = useState<Direction>('in')
  const [amount, setAmount] = useState('')
  const [forward, setForward] = useState(true)
  const [reviewed, setReviewed] = useState<Reviewed>()
  const [busy, setBusy] = useState<'review' | 'bridge' | 'retry'>()
  const [error, setError] = useState<string>()
  const [steps, setSteps] = useState<StepView[]>([])
  const [result, setResult] = useState<BridgeResult>()

  const route = ROUTES[dir]
  const src = useToken(route.from.usdc, w.address)
  const dst = useToken(route.to.usdc, w.address)

  let valid = false
  let raw = 0n
  try {
    raw = parseUsdc(amount.trim())
    valid = raw > 0n
  } catch {
    valid = false
  }
  const short = valid && src.balance !== undefined && src.balance < raw
  // Circle's forwarding service completes the mint for you. It matters most when the destination is Arc, where a new wallet has no USDC for gas.
  const useForwarder = forward
  const key = JSON.stringify({ dir, amount: amount.trim(), useForwarder })
  const stale = reviewed ? reviewed.key !== key || now - reviewed.at > QUOTE_TTL_SECONDS : false
  const doneOk = result?.state === 'success'

  async function context() {
    if (!connector) throw new Error('Wallet not connected')
    // The wallet must be on the source chain before the first transaction is requested.
    if (chainId !== route.from.chainId) await switchChainAsync({ chainId: route.from.chainId })
    const provider = (await connector.getProvider()) as EIP1193Provider
    const adapter = await walletAdapter(provider)
    return {
      from: { adapter, chain: route.from.key },
      to: { adapter, chain: route.to.key, ...(useForwarder ? { useForwarder: true } : {}) },
      adapter,
    } as const
  }

  async function review() {
    setBusy('review')
    setError(undefined)
    setResult(undefined)
    setSteps([])
    try {
      const [kit, ctx] = await Promise.all([loadKit(), context()])
      const estimate = await kit.estimateBridge({ from: ctx.from, to: ctx.to, amount: amount.trim() })
      setReviewed({ estimate, key, at: Math.floor(Date.now() / 1000) })
    } catch (e) {
      setReviewed(undefined)
      setError(kitMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  const apply = (r: BridgeResult) => {
    setResult(r)
    setSteps(r.steps.map((s) => ({ name: s.name, state: s.state, txHash: s.txHash, explorerUrl: s.explorerUrl, error: s.error })))
  }

  async function run(kind: 'bridge' | 'retry') {
    if (kind === 'bridge' && (!reviewed || stale)) return
    setBusy(kind)
    setError(undefined)
    const kit = await loadKit()
    // Live progress: each CCTP step reports as it happens.
    const onEvent = (payload: { action: string; values?: { state?: string; txHash?: string; explorerUrl?: string } }) => {
      const name = payload.action.replace(/^bridge\./, '')
      if (!STEP_ORDER.includes(name)) return
      setSteps((cur) => [...cur.filter((s) => s.name !== name), { name, state: payload.values?.state ?? 'success', txHash: payload.values?.txHash, explorerUrl: payload.values?.explorerUrl }])
    }
    kit.on('*', onEvent as never)
    try {
      const ctx = await context()
      const r = kind === 'retry' && result
        ? await kit.retryBridge(result, { from: ctx.adapter, to: ctx.adapter })
        : await kit.bridge({ from: ctx.from, to: ctx.to, amount: amount.trim() })
      apply(r)
      setReviewed(undefined)
      if (r.state === 'success') {
        toast.success('Bridge complete')
      } else {
        const failed = r.steps.find((s) => s.state === 'error')
        setError(`${failed ? `${STEP_LABEL[failed.name] ?? failed.name} did not finish: ${kitMessage(failed.error)} ` : 'The bridge did not finish. '}Nothing is lost: use Continue to resume from the step that failed.`)
      }
    } catch (e) {
      setError(kitMessage(e))
    } finally {
      kit.off('*', onEvent as never)
      setBusy(undefined)
    }
  }

  const ordered = [...steps].sort((a, b) => STEP_ORDER.indexOf(a.name) - STEP_ORDER.indexOf(b.name))

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Bridge USDC" subtitle="Move USDC between Base Sepolia and Arc Testnet with Circle's CCTP: the USDC is burned on one chain and minted on the other, never wrapped." />
      <div className="card space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ROUTES) as Direction[]).map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3.5 text-sm font-semibold" style={{ borderColor: dir === d ? 'var(--green)' : 'var(--border-strong)', background: dir === d ? 'var(--green-soft)' : 'transparent' }}>
              <input type="radio" name="dir" className="sr-only" checked={dir === d} onChange={() => { setDir(d); setReviewed(undefined) }} />
              <ArrowLeftRight className="size-4" /> {ROUTES[d].title}
            </label>
          ))}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="inset px-4 py-3"><div className="label">On {route.from.label}</div><div className="mt-1 font-semibold tabular-nums">{src.balance !== undefined && src.decimals !== undefined ? `${fmtToken(src.balance, src.decimals)} USDC` : w.isConnected ? '…' : '-'}</div></div>
          <div className="inset px-4 py-3"><div className="label">On {route.to.label}</div><div className="mt-1 font-semibold tabular-nums">{dst.balance !== undefined && dst.decimals !== undefined ? `${fmtToken(dst.balance, dst.decimals)} USDC` : w.isConnected ? '…' : '-'}</div></div>
        </div>

        <label className="block space-y-1.5">
          <span className="label">Amount (USDC)</span>
          <input className="field tabular-nums" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v) }} />
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--green)]" checked={forward} onChange={(e) => { setForward(e.target.checked); setReviewed(undefined) }} />
          <span>
            <span className="font-semibold">Let Circle complete the transfer for me</span>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>Circle&rsquo;s forwarding service submits the final mint, so you need no gas on {route.to.label}. It adds a small fee, shown in the quote.</span>
          </span>
        </label>

        {short ? <Notice tone="error">Your USDC balance on {route.from.label} is lower than this amount. <a className="font-semibold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC</a></Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Notice>
          You need gas on {route.from.label} ({route.from.key === 'Arc_Testnet' ? 'USDC' : 'Base Sepolia ETH'}){forward ? '' : ` and on ${route.to.label} (${route.to.key === 'Arc_Testnet' ? 'USDC' : 'Base Sepolia ETH'})`}. Testnet USDC has no real value.
        </Notice>

        {reviewed && !stale ? <QuoteReview estimate={reviewed.estimate} from={route.from.label} to={route.to.label} /> : null}
        {reviewed && stale ? <Notice tone="warn">This quote is out of date. Review it again.</Notice> : null}

        {!w.isConnected ? (
          <ConnectWalletButton className="btn btn-primary w-full" label="Connect wallet to bridge" />
        ) : reviewed && !stale ? (
          <button type="button" className="btn btn-primary w-full" disabled={busy !== undefined} onClick={() => void run('bridge')}>
            {busy === 'bridge' ? <Spinner /> : <ArrowLeftRight className="size-4" />}
            {busy === 'bridge' ? 'Bridging… confirm each step in your wallet' : `Bridge ${amount.trim()} USDC to ${route.to.label}`}
          </button>
        ) : (
          <button type="button" className="btn btn-primary w-full" disabled={!valid || short || busy !== undefined} onClick={() => void review()}>
            {busy === 'review' ? <Spinner /> : <RefreshCw className="size-4" />}
            {busy === 'review' ? 'Getting a quote…' : stale ? 'Review quote again' : 'Review quote'}
          </button>
        )}
      </div>

      {ordered.length > 0 ? (
        <section className="card mt-5 space-y-3 p-5" aria-label="Bridge progress">
          <div className="flex items-center gap-2 font-semibold">
            {doneOk ? <CheckCircle2 className="size-5" style={{ color: 'var(--green)' }} /> : busy ? <Spinner /> : null}
            {doneOk ? 'Bridge complete' : result?.state === 'error' ? 'Bridge paused' : 'Bridge in progress'}
          </div>
          <ol className="space-y-2 text-sm">
            {STEP_ORDER.map((name) => {
              const s = ordered.find((x) => x.name === name)
              return (
                <li key={name} className="flex flex-wrap items-center justify-between gap-2">
                  <span style={{ color: s ? 'var(--ink)' : 'var(--subtle)' }}>{STEP_LABEL[name]}</span>
                  <span className="flex items-center gap-2 text-xs">
                    <span style={{ color: s?.state === 'error' ? 'var(--danger)' : s?.state === 'success' ? 'var(--green)' : 'var(--muted)' }}>{s ? s.state : 'waiting'}</span>
                    {s?.explorerUrl ? <a href={s.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: 'var(--green)' }}>view <ExternalLink className="size-3" /></a> : null}
                  </span>
                </li>
              )
            })}
          </ol>
          {result?.state === 'error' ? (
            <button type="button" className="btn btn-secondary" disabled={busy !== undefined} onClick={() => void run('retry')}>
              {busy === 'retry' ? <Spinner /> : <RefreshCw className="size-4" />} Continue from the failed step
            </button>
          ) : null}
          {busy ? <p className="text-xs" style={{ color: 'var(--muted)' }}>Keep this page open until it finishes. If you close it, the transaction hashes above stay on the chain; start over only after checking the explorer so you do not bridge twice.</p> : null}
        </section>
      ) : null}
    </div>
  )
}

function QuoteReview({ estimate, from, to }: { estimate: Estimate; from: string; to: string }) {
  const rows: Array<[string, string]> = [
    ['You send', `${estimate.amount} USDC on ${from}`],
    ['Arrives on', to],
    ...estimate.fees.map((f): [string, string] => [`${f.type} fee`, `${f.amount ?? '0'} ${f.token}`]),
    ...estimate.gasFees.map((g): [string, string] => [`${g.name} gas on ${g.blockchain.replace('_', ' ')}`, g.fees ? `${g.fees.fee} ${g.token}` : 'unavailable']),
  ]
  return (
    <dl className="inset divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
      {rows.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="flex justify-between gap-4 px-4 py-2.5">
          <dt style={{ color: 'var(--muted)' }}>{k}</dt>
          <dd className="text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
