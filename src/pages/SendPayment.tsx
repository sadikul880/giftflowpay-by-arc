import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, getAddress, isAddress, type Address } from 'viem'
import { CheckCircle2, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { AddressLink, ConfirmDialog, Notice, PageHeader, Spinner, TxLink, WalletGate } from '@/components/ui'
import { useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { publicClient } from '@/lib/events'
import { fmtUsd, shortAddr, trimFee, ZERO_ADDRESS } from '@/lib/format'
import { ACTIVE } from '@/lib/network'
import { parseUsdc } from '@/onchain-money'

function parseAmount(v: string): bigint | undefined {
  try {
    const raw = parseUsdc(v.trim())
    return raw > 0n ? raw : undefined
  } catch {
    return undefined
  }
}

export default function SendPayment() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  const tx = useTxAction()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<{ hash: string; to: Address; amount: bigint }>()

  const raw = parseAmount(amount)
  const target = isAddress(to.trim()) ? getAddress(to.trim()) : undefined
  const reserved = [ZERO_ADDRESS, ACTIVE.usdc, ACTIVE.contract ?? ZERO_ADDRESS].map((a) => a.toLowerCase())
  const toError =
    to.trim() === '' ? undefined
    : !target ? 'Enter a valid wallet address.'
    : reserved.includes(target.toLowerCase()) ? 'That is a contract or burn address, not a wallet. Funds sent there would be lost.'
    : undefined
  const self = Boolean(target && w.address && target.toLowerCase() === w.address.toLowerCase())
  const amountError = amount !== '' && raw === undefined ? 'Enter an amount in USDC (up to 6 decimals).' : undefined
  const short = raw !== undefined && balance.data !== undefined && balance.data < raw
  const ready = Boolean(target) && !toError && raw !== undefined && !short && !self

  const fee = useQuery({
    queryKey: ['send-fee', w.address, target, raw?.toString()],
    enabled: Boolean(ready && w.address && !w.wrongChain),
    retry: false,
    staleTime: 15000,
    queryFn: async () => {
      const [gas, fees] = await Promise.all([
        publicClient.estimateContractGas({ account: w.address as Address, address: ACTIVE.usdc, abi: erc20Abi, functionName: 'transfer', args: [target as Address, raw as bigint] }),
        publicClient.estimateFeesPerGas().catch(async () => ({ maxFeePerGas: await publicClient.getGasPrice() })),
      ])
      return gas * (fees.maxFeePerGas ?? 0n)
    },
  })

  async function send() {
    if (!w.address || !target || raw === undefined) return
    const owner = w.address
    const receipt = await tx.run(async (_s, write) => {
      const { request } = await publicClient.simulateContract({ account: owner, address: ACTIVE.usdc, abi: erc20Abi, functionName: 'transfer', args: [target, raw] })
      return write(request)
    })
    setOpen(false)
    if (receipt) {
      toast.success(`${fmtUsd(raw)} USDC sent and confirmed onchain`)
      setDone({ hash: receipt.transactionHash, to: target, amount: raw })
      void balance.refetch()
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-6 shrink-0" style={{ color: 'var(--green)' }} />
          <div>
            <h1 className="display text-2xl">Payment sent</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>The network confirmed the transfer.</p>
          </div>
        </div>
        <dl className="card divide-y text-sm">
          {([
            ['Amount', `${fmtUsd(done.amount)} USDC`],
            ['To', <AddressLink key="to" address={done.to} full />],
            ['Transaction', <TxLink key="tx" hash={done.hash} label="View on the explorer" />],
          ] as Array<[string, ReactNode]>).map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
              <dt style={{ color: 'var(--muted)' }}>{k}</dt>
              <dd className="min-w-0 break-all text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => { setDone(undefined); setAmount('') }}>Send another</button>
          <Link to="/dashboard" className="btn btn-secondary">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Send payment" subtitle="Send USDC straight to one wallet. There is no escrow and no claim step: the transfer is final once the network confirms it." />
      <div className="card space-y-5 p-5 sm:p-6">
        <label className="block space-y-1.5">
          <span className="label">Recipient wallet</span>
          <input className="field mono !text-[13px]" placeholder="0x…" autoComplete="off" spellCheck={false} value={to} onChange={(e) => setTo(e.target.value)} />
          {toError ? <span className="block text-sm" style={{ color: 'var(--danger)' }}>{toError}</span> : null}
          {self ? <span className="block text-sm" style={{ color: 'var(--warn)' }}>That is your own wallet.</span> : null}
        </label>

        <label className="block space-y-1.5">
          <span className="label flex justify-between">
            <span>Amount (USDC)</span>
            <span className="normal-case tracking-normal tabular-nums">Balance {balance.data !== undefined ? `$${fmtUsd(balance.data)}` : '-'}</span>
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>$</span>
            <input
              className="field !pl-7 tabular-nums"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
              }}
            />
          </div>
          {amountError ? <span className="block text-sm" style={{ color: 'var(--danger)' }}>{amountError}</span> : null}
        </label>

        {short ? <Notice tone="error">Your balance is lower than this amount. You also need a little USDC for the network fee. <a className="font-semibold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC</a></Notice> : null}
        {ready ? (
          <div className="inset flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span style={{ color: 'var(--muted)' }}>Estimated network fee (paid in USDC)</span>
            <span className="tabular-nums">{fee.isLoading ? <Spinner /> : fee.data !== undefined ? `≈ ${trimFee(fee.data)} USDC` : 'unavailable'}</span>
          </div>
        ) : null}
        {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}

        <WalletGate connectLabel="Connect wallet to send">
          <button type="button" className="btn btn-primary w-full" disabled={!ready || tx.busy} onClick={() => setOpen(true)}>
            {tx.busy ? <Spinner /> : <Send className="size-4" />}
            {tx.phase === 'wallet' ? 'Confirm in wallet…' : tx.phase === 'confirming' ? 'Confirming…' : `Send ${raw !== undefined ? `$${fmtUsd(raw)}` : 'USDC'}`}
          </button>
        </WalletGate>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Paying several people? <Link to="/payroll" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"><Users className="size-3.5" /> Use payroll</Link>
        </p>
      </div>

      <ConfirmDialog
        open={open}
        title="Send this payment?"
        description="USDC goes directly to this wallet and cannot be recalled. Check the address carefully."
        rows={[['Amount', `${raw !== undefined ? fmtUsd(raw) : '0'} USDC`], ['To', target ? shortAddr(target) : ''], ['Network', ACTIVE.label]]}
        confirmLabel="Send"
        busy={tx.busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void send()}
      />
    </div>
  )
}
