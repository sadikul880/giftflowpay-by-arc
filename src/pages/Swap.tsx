import { useState } from 'react'
import { ArrowDownUp, ExternalLink, RefreshCw } from 'lucide-react'
import { useAccount } from 'wagmi'
import { parseUnits, type Address, type EIP1193Provider } from 'viem'
import { toast } from 'sonner'
import { Notice, PageHeader, Spinner, WalletGate } from '@/components/ui'
import { useNow, useWallet } from '@/hooks/useFlow'
import { useToken } from '@/hooks/useToken'
import { kitMessage, loadKit, walletAdapter } from '@/lib/appkit'
import { safeHttpUrl } from '@/lib/safeUrl'
import { fmtToken, isWrappedBitcoin, parseTokenAddress, ARC_CIRBTC, ARC_EURC, ARC_USDC } from '@/lib/tokens'
import { ACTIVE } from '@/lib/network'
import type { SwapEstimate, SwapResult } from '@circle-fin/app-kit'

type Choice = 'USDC' | 'EURC' | 'cirBTC' | 'custom'
/** Most decimals the amount box accepts: the token's own, never more than 8. */
const MAX_INPUT_DECIMALS = 8
const SLIPPAGE = [
  { bps: 50, label: '0.5%' },
  { bps: 100, label: '1%' },
  { bps: 300, label: '3%' },
]
/** A quote older than this is not trusted: prices move, so the swap button asks for a fresh review. */
const QUOTE_TTL_SECONDS = 60

interface Reviewed {
  estimate: SwapEstimate
  key: string
  at: number
  account: Address
}

/** A positive amount with no more decimals than the token has. */
function amountOk(v: string, decimals: number): boolean {
  const x = v.trim()
  if (!/^d*.?d*$/.test(x) || x === '' || x === '.') return false
  if ((x.split('.')[1] ?? '').length > decimals) return false
  try {
    return parseUnits(x, decimals) > 0n
  } catch {
    return false
  }
}

export default function Swap() {
  const w = useWallet()
  const { connector } = useAccount()
  const now = useNow(5000)

  const [from, setFrom] = useState<Choice>('USDC')
  const [to, setTo] = useState<Choice>('EURC')
  const [custom, setCustom] = useState('')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(100)
  const [reviewed, setReviewed] = useState<Reviewed>()
  const [busy, setBusy] = useState<'review' | 'swap'>()
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<SwapResult>()

  const customAddress = parseTokenAddress(custom)
  const customToken = useToken(customAddress ? { address: customAddress, chainId: ACTIVE.chainId } : undefined, w.address)
  const usdc = useToken(ARC_USDC, w.address)
  const eurc = useToken(ARC_EURC, w.address)
  const cirbtc = useToken(ARC_CIRBTC, w.address)

  const info = (c: Choice) =>
    c === 'USDC' ? { label: 'USDC', sdk: 'USDC', read: usdc }
    : c === 'EURC' ? { label: 'EURC', sdk: 'EURC', read: eurc }
    : c === 'cirBTC' ? { label: 'cirBTC', sdk: 'cirBTC', read: cirbtc }
    : { label: customToken.symbol ?? 'Custom token', sdk: customAddress ?? '', read: customToken }
  const a = info(from)
  const b = info(to)

  const usesCustom = from === 'custom' || to === 'custom'
  const customProblem = usesCustom && (!customAddress ? 'Enter the token contract address.' : !customToken.isLoading && !customToken.isToken ? 'That address is not an ERC-20 token on Arc Testnet.' : undefined)
  const sameToken = from === to
  const request = { tokenIn: a.sdk, tokenOut: b.sdk, amountIn: amount.trim(), config: { slippageBps: slippage } }
  const key = JSON.stringify(request)
  const inputDecimals = Math.min(a.read.decimals ?? 6, MAX_INPUT_DECIMALS)
  const ready = amountOk(amount, a.read.decimals ?? 6) && !sameToken && !customProblem && !customToken.isLoading
  const stale = reviewed ? reviewed.key !== key || reviewed.account !== w.address || now - reviewed.at > QUOTE_TTL_SECONDS : false
  const balance = a.read.balance !== undefined && a.read.decimals !== undefined ? fmtToken(a.read.balance, a.read.decimals) : undefined
  const short = ready && a.read.balance !== undefined && a.read.decimals !== undefined && parseUnits(amount.trim(), a.read.decimals) > a.read.balance

  async function provider(): Promise<EIP1193Provider> {
    if (!connector) throw new Error('Wallet not connected')
    if (w.wrongChain) await w.switchToTarget()
    return (await connector.getProvider()) as EIP1193Provider
  }

  async function review() {
    if (!w.address) return
    setBusy('review')
    setError(undefined)
    setDone(undefined)
    try {
      const [kit, adapter] = await Promise.all([loadKit(), provider().then(walletAdapter)])
      const estimate = await kit.estimateSwap({ from: { adapter, chain: 'Arc_Testnet' }, ...request })
      setReviewed({ estimate, key, at: Math.floor(Date.now() / 1000), account: w.address })
    } catch (e) {
      setReviewed(undefined)
      setError(kitMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  async function swap() {
    if (!reviewed || stale || !w.address) return
    setBusy('swap')
    setError(undefined)
    try {
      const [kit, adapter] = await Promise.all([loadKit(), provider().then(walletAdapter)])
      const result = await kit.swap({ from: { adapter, chain: 'Arc_Testnet' }, ...request })
      setDone(result)
      setReviewed(undefined)
      if (result.progress.status === 'DONE') toast.success('Swap confirmed onchain')
    } catch (e) {
      setError(kitMessage(e))
    } finally {
      setBusy(undefined)
    }
  }

  const flip = () => {
    setFrom(to)
    setTo(from)
    setReviewed(undefined)
  }

  const pick = (which: 'from' | 'to') => (
    <select
      className="field !w-auto min-w-32 font-semibold"
      aria-label={which === 'from' ? 'Token to sell' : 'Token to receive'}
      value={which === 'from' ? from : to}
      onChange={(e) => (which === 'from' ? setFrom : setTo)(e.target.value as Choice)}
    >
      <option value="USDC">USDC</option>
      <option value="EURC">EURC</option>
      <option value="cirBTC">cirBTC</option>
      <option value="custom">Other token…</option>
    </select>
  )

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Swap" subtitle={`Swap USDC, EURC and cirBTC on ${ACTIVE.label}. You see a live quote before anything is signed, and your wallet signs the swap.`} />
      <div className="card space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="label">You pay</span><span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>Balance {balance ?? '-'}</span></div>
          <div className="flex gap-2">
            {pick('from')}
            <input className="field tabular-nums" inputMode="decimal" placeholder="0.00" aria-label="Amount to sell" value={amount} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (new RegExp(`^\\d*\\.?\\d{0,${inputDecimals}}$`).test(v)) setAmount(v) }} />
          </div>
        </div>
        <div className="flex justify-center">
          <button type="button" className="btn btn-secondary !min-h-9 !px-3" aria-label="Swap the two tokens" onClick={flip}><ArrowDownUp className="size-4" /></button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="label">You receive (estimate)</span></div>
          <div className="flex gap-2">
            {pick('to')}
            <div className="field flex items-center tabular-nums" style={{ color: reviewed && !stale ? 'var(--ink)' : 'var(--subtle)' }} aria-live="polite">
              {reviewed && !stale ? reviewed.estimate.estimatedOutput.amount : '-'}
            </div>
          </div>
        </div>

        {usesCustom ? (
          <div className="space-y-1.5">
            <input className="field mono !text-[13px]" placeholder="Token contract address (0x…)" aria-label="Token contract address" value={custom} onChange={(e) => setCustom(e.target.value)} />
            {customProblem && custom ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{customProblem}</p> : null}
            {customToken.isToken ? <p className="text-sm">{customToken.symbol} with {customToken.decimals} decimals</p> : null}
            <Notice tone="warn">This token is not verified by GiftFlowPay. Check the address yourself: a look-alike token is worth nothing.</Notice>
            {isWrappedBitcoin(customToken.symbol) ? <Notice>cirBTC is wrapped Bitcoin on Arc, not native BTC. Its value depends on the wrapping contract and the reserve behind it.</Notice> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="label">Slippage tolerance</div>
          <div className="flex gap-2">
            {SLIPPAGE.map((s) => (
              <button key={s.bps} type="button" aria-pressed={slippage === s.bps} className={`btn !min-h-9 ${slippage === s.bps ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSlippage(s.bps)}>{s.label}</button>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>The swap fails instead of paying a worse price than this. Tighter protects you more but fails more often.</p>
        </div>

        {from === 'cirBTC' || to === 'cirBTC' ? <Notice>cirBTC is wrapped Bitcoin on Arc, not native BTC. Its value depends on the wrapping contract and the reserve behind it. Testnet cirBTC has no real value.</Notice> : null}
        {sameToken ? <Notice tone="error">Pick two different tokens.</Notice> : null}
        {amount && (amount.split('.')[1] ?? '').length > (a.read.decimals ?? 6) ? <Notice tone="error">{a.label} supports at most {a.read.decimals ?? 6} decimals.</Notice> : null}
        {short ? <Notice tone="error">Your {a.label} balance is lower than this amount.</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}

        {reviewed && !stale ? <QuoteReview r={reviewed} slippageLabel={SLIPPAGE.find((s) => s.bps === slippage)?.label ?? ''} /> : null}
        {reviewed && stale ? <Notice tone="warn">This quote is out of date. Review it again to get a current price.</Notice> : null}

        <WalletGate connectLabel="Connect wallet to swap">
          {reviewed && !stale ? (
            <button type="button" className="btn btn-primary w-full" disabled={busy !== undefined} onClick={() => void swap()}>
              {busy === 'swap' ? <Spinner /> : <ArrowDownUp className="size-4" />}
              {busy === 'swap' ? 'Confirm in wallet…' : `Swap ${reviewed.estimate.amountIn} ${a.label} for about ${reviewed.estimate.estimatedOutput.amount} ${b.label}`}
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full" disabled={!ready || short || busy !== undefined} onClick={() => void review()}>
              {busy === 'review' ? <Spinner /> : <RefreshCw className="size-4" />}
              {busy === 'review' ? 'Getting a quote…' : stale ? 'Review quote again' : 'Review quote'}
            </button>
          )}
        </WalletGate>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Swaps are routed through a third-party DEX aggregator (currently LiFi), which can change by route and has its own terms of service. These are testnet tokens with no real value.
        </p>
      </div>

      {done ? <SwapDone result={done} /> : null}
    </div>
  )
}

function QuoteReview({ r, slippageLabel }: { r: Reviewed; slippageLabel: string }) {
  const e = r.estimate
  return (
    <dl className="inset divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
      {[
        ['You pay', `${e.amountIn} ${e.tokenIn}`],
        ['You receive about', `${e.estimatedOutput.amount} ${e.estimatedOutput.token}`],
        [`Minimum after ${slippageLabel} slippage`, `${e.stopLimit.amount} ${e.stopLimit.token}`],
        ['Network', e.chainIn.replace('_', ' ')],
        ...(e.fees ?? []).map((f): [string, string] => [`${f.type} fee`, `${f.amount ?? '0'} ${f.token ?? ''}`]),
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
          <dt style={{ color: 'var(--muted)' }}>{k}</dt>
          <dd className="text-right font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function SwapDone({ result }: { result: SwapResult }) {
  const finished = result.progress.status === 'DONE'
  return (
    <div className="card mt-5 space-y-2 p-5 text-sm">
      <div className="font-semibold" style={{ color: finished ? 'var(--green)' : 'var(--warn)' }}>{finished ? 'Swap confirmed' : `Swap submitted (${result.progress.status})`}</div>
      <p>{result.amountIn} {result.tokenIn}{result.amountOut ? ` for ${result.amountOut} ${result.tokenOut}` : ''}</p>
      {safeHttpUrl(result.explorerUrl) ? (
        <a className="inline-flex items-center gap-1 font-medium underline underline-offset-2" style={{ color: 'var(--green)' }} href={safeHttpUrl(result.explorerUrl)} target="_blank" rel="noopener noreferrer">
          View transaction <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  )
}
