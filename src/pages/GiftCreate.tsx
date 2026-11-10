import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { erc20Abi, isAddress, parseEventLogs, type Address, type Hex } from 'viem'
import { useSignMessage } from 'wagmi'
import { CheckCircle2, Download, Gift, KeyRound, Link2, Lock, Wallet } from 'lucide-react'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { GiftCardArt } from '@/components/GiftCardArt'
import { ConfirmDialog, CopyButton, Notice, PageHeader, Spinner, StepList, TxLink, WalletGate, type StepStatus } from '@/components/ui'
import { useAllowance, useGlobals, useNow, useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { flowAbi } from '@/lib/abi'
import { publicClient } from '@/lib/events'
import { encodeMeta, encodePublished, keyMessage, masterFromSignature, openLink, randomSalt } from '@/lib/flow'
import { fmtDate, fmtUsd, shortAddr } from '@/lib/format'
import {
  GIFT_DESIGNS,
  GIFT_EXPIRY_DAYS,
  GIFT_LIMITS,
  GIFT_MODE,
  GIFT_PRESETS,
  giftPlan,
  type GiftDesignId,
  type GiftMethod,
} from '@/lib/gift'
import { downloadBlob, renderGiftPng } from '@/lib/giftPng'
import { ACTIVE, contractAddress } from '@/lib/network'
import { buildShareLink } from '@/lib/share'
import { buildTree } from '@/lib/tree'
import { parseUsdc } from '@/onchain-money'

const METHODS: Array<{ id: GiftMethod; title: string; body: string; Icon: typeof KeyRound; note: string }> = [
  { id: 'code', title: 'Secret code', body: 'The link and QR open the claim page. The recipient types a code you send separately.', Icon: KeyRound, note: 'Safest to share: the link, QR and image contain no secret.' },
  { id: 'wallet', title: 'Specific wallet', body: 'Only the wallet you name can claim. Anyone can see the link without being able to take the gift.', Icon: Wallet, note: 'No secret at all. The recipient needs the wallet address.' },
  { id: 'link', title: 'Anyone with the link', body: 'Whoever opens the link or scans its QR can claim. Share it privately.', Icon: Link2, note: 'The link and its QR are the secret. The image carries no QR.' },
]

interface GiftResult {
  id: bigint
  txHash: string
  method: GiftMethod
  amount: string
  from: string
  to: string
  message: string
  design: GiftDesignId
  expiresAt: number
  claimPage: string
  /** What the QR and the copy button share: the claim page, or for link gifts the private link. */
  shareLink: string
  code?: string
  wallet?: Address
  qr: string
}

type Stage = 'idle' | 'key' | 'approve' | 'create'

const qrOptions = { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#04110a', light: '#ffffff' } } as const

function parseAmount(v: string): bigint | undefined {
  try {
    const raw = parseUsdc(v.trim())
    return raw > 0n ? raw : undefined
  } catch {
    return undefined
  }
}

export default function GiftCreate() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  const allowance = useAllowance(w.address)
  const globals = useGlobals()
  const { signMessageAsync } = useSignMessage()
  const tx = useTxAction()
  const now = useNow(30000)

  const [amount, setAmount] = useState('25')
  const [design, setDesign] = useState<GiftDesignId>('emerald')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [days, setDays] = useState(30)
  const [method, setMethod] = useState<GiftMethod>('code')
  const [wallet, setWallet] = useState('')
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<GiftResult>()

  const raw = useMemo(() => parseAmount(amount), [amount])
  const max = globals.data?.maxTotalAllocation
  const walletOk = method !== 'wallet' || (isAddress(wallet.trim()) && wallet.trim().toLowerCase() !== '0x0000000000000000000000000000000000000000')
  const amountError = raw === undefined ? 'Enter an amount in USDC (up to 6 decimals).' : max !== undefined && raw > max ? `The limit is ${fmtUsd(max)} USDC per gift.` : undefined
  const short = raw !== undefined && balance.data !== undefined && balance.data < raw
  const blocked = Boolean(amountError) || !walletOk || short || Boolean(globals.data?.paused) || !ACTIVE.contract
  const needsApproval = raw !== undefined && (allowance.data === undefined || allowance.data < raw)

  async function launch() {
    if (!w.address || raw === undefined) return
    const owner = w.address
    const contract = contractAddress()
    const done = await tx.run(async (s, write) => {
      const head = await publicClient.getBlock()
      const now = Number(head.timestamp)
      const deadline = now + days * 86400
      const salt = randomSalt()

      let master: Hex | undefined
      if (method !== 'wallet') {
        setStage('key')
        s.phase('signing')
        master = masterFromSignature(await signMessageAsync({ message: keyMessage(contract, ACTIVE.chainId, salt) }))
      }
      const plan = giftPlan(method, raw, { wallet: method === 'wallet' ? (wallet.trim() as Address) : undefined, master, salt })
      const tree = buildTree([plan.leaf])

      const current = await publicClient.readContract({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'allowance', args: [owner, contract] })
      if (current < raw) {
        setStage('approve')
        await write({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'approve', args: [contract, raw] })
      }

      setStage('create')
      const toName = to.trim()
      const metadata = encodeMeta({
        n: toName ? `Gift card for ${toName}` : 'Gift card',
        d: '',
        t: 'gift',
        m: message.trim(),
        k: GIFT_MODE[method],
        g: { f: from.trim(), t: toName, d: design },
      })
      const { request } = await publicClient.simulateContract({
        account: owner,
        address: contract,
        abi: flowAbi,
        functionName: 'createCampaign',
        args: [
          { merkleRoot: tree.root, totalAllocation: raw, recipientCount: 1, startTime: BigInt(now), claimDeadline: BigInt(deadline), isPublic: true, salt },
          metadata,
          encodePublished([plan.leaf]),
        ],
      })
      const receipt = await write(request)
      const [created] = parseEventLogs({ abi: flowAbi, eventName: 'CampaignCreated', logs: receipt.logs })
      if (!created) throw new Error('The gift could not be confirmed. Check the transaction on the explorer.')
      const id = created.args.campaignId

      // Only now, after the funding transaction is confirmed, are links, QR and image produced.
      const claimPage = await buildShareLink(`/claim/${id}`)
      const shareLink =
        method === 'link' && master ? await openLink(id, master) : method === 'wallet' ? `${claimPage}?r=${wallet.trim()}` : claimPage
      return {
        id,
        txHash: receipt.transactionHash,
        method,
        amount: fmtUsd(raw),
        from: from.trim(),
        to: toName,
        message: message.trim(),
        design,
        expiresAt: deadline,
        claimPage,
        shareLink,
        code: plan.code,
        wallet: method === 'wallet' ? (wallet.trim() as Address) : undefined,
        qr: await QRCode.toDataURL(shareLink, qrOptions),
      } satisfies GiftResult
    })
    setStage('idle')
    setOpen(false)
    if (done) {
      toast.success('Gift card funded and confirmed onchain')
      setResult(done)
      void balance.refetch()
    }
  }

  if (result) return <GiftDone result={result} onAnother={() => setResult(undefined)} />

  const status = (order: number): StepStatus => {
    const idx = ['idle', 'key', 'approve', 'create'].indexOf(stage)
    return idx > order ? 'done' : idx === order ? 'active' : 'todo'
  }
  const steps = [
    ...(method !== 'wallet' ? [{ label: 'Create claim key', hint: 'Sign a free message. No funds move.', status: status(1) }] : []),
    ...(needsApproval ? [{ label: 'Approve USDC', hint: 'Confirm the approval in your wallet.', status: status(2) }] : []),
    { label: 'Fund the gift card', hint: tx.phase === 'confirming' ? 'Waiting for the network to confirm…' : 'Confirm the transaction in your wallet.', status: status(3) },
  ]
  const chosen = METHODS.find((m) => m.id === method)

  return (
    <div>
      <PageHeader title="Create gift card" subtitle="Lock USDC in the contract and send a gift the recipient claims with their own wallet." />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-7">
          <section className="space-y-3">
            <div className="label">Amount (USDC)</div>
            <div className="flex flex-wrap gap-2">
              {GIFT_PRESETS.map((a) => (
                <button key={a} type="button" aria-pressed={amount === a} className={`btn tabular-nums ${amount === a ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAmount(a)}>
                  ${a}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--muted)' }}>$</span>
              <input
                className="field !pl-7 tabular-nums"
                inputMode="decimal"
                placeholder="Custom amount"
                aria-label="Gift amount in USDC"
                value={GIFT_PRESETS.includes(amount as (typeof GIFT_PRESETS)[number]) ? '' : amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
                }}
              />
            </div>
            {amountError ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{amountError}</p> : null}
          </section>

          <section className="space-y-3">
            <div className="label">Design</div>
            <div className="flex flex-wrap gap-3">
              {GIFT_DESIGNS.map((d) => (
                <button key={d.id} type="button" aria-pressed={design === d.id} aria-label={`${d.name} design`} onClick={() => setDesign(d.id)} className="flex flex-col items-center gap-1.5">
                  <span className="block size-12 rounded-xl border-2" style={{ background: `linear-gradient(135deg, ${d.from}, ${d.to})`, borderColor: design === d.id ? 'var(--green)' : 'var(--border)', boxShadow: design === d.id ? '0 0 0 3px rgba(52,240,138,0.25)' : 'none' }} />
                  <span className="text-xs font-medium" style={{ color: design === d.id ? 'var(--ink)' : 'var(--muted)' }}>{d.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="label">From</span>
              <input className="field" maxLength={GIFT_LIMITS.name} placeholder="Your name" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="space-y-1.5">
              <span className="label">To</span>
              <input className="field" maxLength={GIFT_LIMITS.name} placeholder="Recipient name" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="label flex justify-between"><span>Message</span><span className="tabular-nums normal-case tracking-normal">{message.length}/{GIFT_LIMITS.message}</span></span>
              <textarea className="field min-h-20 resize-y" maxLength={GIFT_LIMITS.message} placeholder="Happy birthday! Enjoy." value={message} onChange={(e) => setMessage(e.target.value)} />
              <span className="block text-xs" style={{ color: 'var(--muted)' }}>Names and message are written to a public onchain event. Do not include private information.</span>
            </label>
          </section>

          <section className="space-y-3">
            <div className="label">How does the recipient claim?</div>
            <div className="grid gap-3 sm:grid-cols-3">
              {METHODS.map(({ id, title, body, Icon }) => (
                <label key={id} className="flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3.5 text-sm" style={{ borderColor: method === id ? 'var(--green)' : 'var(--border-strong)', background: method === id ? 'var(--green-soft)' : 'transparent' }}>
                  <input type="radio" name="method" className="sr-only" checked={method === id} onChange={() => setMethod(id)} />
                  <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" /> {title}</span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>{body}</span>
                </label>
              ))}
            </div>
            {chosen ? <p className="text-xs" style={{ color: 'var(--muted)' }}>{chosen.note}</p> : null}
            {method === 'wallet' ? (
              <div className="space-y-1.5">
                <input className="field mono !text-[13px]" placeholder="0x… recipient wallet" aria-label="Recipient wallet address" value={wallet} onChange={(e) => setWallet(e.target.value)} />
                {wallet && !walletOk ? <p className="text-sm" style={{ color: 'var(--danger)' }}>Enter a valid wallet address.</p> : null}
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Double-check the address. The gift cannot be redirected after funding; you can only refund it after it expires.</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="label">Expires after</div>
            <div className="flex flex-wrap gap-2">
              {GIFT_EXPIRY_DAYS.map((d) => (
                <button key={d.days} type="button" aria-pressed={days === d.days} className={`btn ${days === d.days ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDays(d.days)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>If nobody claims it by then, you can refund the full amount to your wallet.</p>
          </section>

          {short ? <Notice tone="error">Your balance is lower than the gift. You also need a little USDC for network fees. <a className="font-semibold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC</a></Notice> : null}
          {globals.data?.paused ? <Notice tone="error">GiftFlowPay is paused, so new gifts cannot be funded right now.</Notice> : null}
          {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
          {tx.busy ? <div className="card p-5"><StepList steps={steps} /></div> : null}

          <WalletGate connectLabel="Connect wallet to fund">
            <button type="button" className="btn btn-primary w-full sm:w-auto sm:min-w-64" disabled={blocked || tx.busy} onClick={() => setOpen(true)}>
              {tx.busy ? <Spinner /> : <Lock className="size-4" />} Fund ${raw !== undefined ? fmtUsd(raw) : '0'} gift card
            </button>
          </WalletGate>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Your link, QR and image are created only after the network confirms the funding transaction.</p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="label mb-3">Live preview</div>
          <GiftCardArt design={design} amount={raw !== undefined ? fmtUsd(raw) : ''} from={from} to={to} message={message} />
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>Balance: {balance.data !== undefined ? `$${fmtUsd(balance.data)} USDC` : w.isConnected ? '…' : 'connect a wallet'}</p>
        </aside>
      </div>

      <ConfirmDialog
        open={open}
        title="Fund this gift card?"
        description="Your USDC moves into the GiftFlowPay contract in one transaction. You can only take it back by refunding after it expires."
        rows={[
          ['Amount', `${raw !== undefined ? fmtUsd(raw) : '0'} USDC`],
          ['Claim method', chosen?.title ?? ''],
          ...(method === 'wallet' ? ([['Recipient', shortAddr(wallet.trim())]] as Array<[string, string]>) : []),
          ['Expires', fmtDate(now + days * 86400)],
        ]}
        confirmLabel={needsApproval ? 'Approve and fund' : 'Fund gift card'}
        busy={tx.busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void launch()}
      />
    </div>
  )
}

function GiftDone({ result, onAnother }: { result: GiftResult; onAnother: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const isLink = result.method === 'link'

  async function download() {
    setBusy(true)
    setError(undefined)
    try {
      const blob = await renderGiftPng({
        design: result.design,
        amount: result.amount,
        from: result.from,
        to: result.to,
        message: result.message,
        // A link gift's QR is the secret itself, so its image carries none.
        qrDataUrl: isLink ? undefined : result.qr,
        qrCaption: isLink ? undefined : result.claimPage.replace(/^https?:\/\//, ''),
        footnote: isLink ? 'Your sender will share the private claim link with you.' : undefined,
      })
      downloadBlob(blob, `giftflowpay-gift-${result.id}.png`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the image')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-6 shrink-0" style={{ color: 'var(--green)' }} />
        <div>
          <h1 className="display text-2xl">Gift card funded</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            ${result.amount} USDC is now held by the contract until {fmtDate(result.expiresAt)}. <TxLink hash={result.txHash} label="Confirmed onchain" />
          </p>
        </div>
      </div>

      <GiftCardArt design={result.design} amount={result.amount} from={result.from} to={result.to} message={result.message} />

      {result.method === 'code' && result.code ? (
        <section className="card space-y-3 p-5">
          <div className="label">Secret code</div>
          <div className="inset mono px-4 py-3 text-2xl tracking-widest">{result.code}</div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Send this code to the recipient in a different message from the link or image. Anyone with both can claim the gift. You can get the code again from this campaign&rsquo;s Recipients page by signing with this wallet.</p>
          <CopyButton value={result.code} label="Copy code" className="btn btn-secondary" />
        </section>
      ) : null}

      {isLink ? <Notice tone="warn">This link and its QR code contain the claim secret. Anyone who has them can claim the gift, so share them only with the recipient. The downloaded image has no QR for that reason.</Notice> : null}
      {result.method === 'wallet' ? <Notice>Only {shortAddr(result.wallet ?? '')} can claim this gift. The link and QR hold no secret.</Notice> : null}

      <section className="card grid gap-6 p-5 sm:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <img src={result.qr} alt="QR code that opens the claim page" width={220} height={220} className="rounded-xl bg-white p-2" />
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>{isLink ? 'Private: contains the claim secret' : 'Opens the claim page'}</p>
        </div>
        <div className="space-y-3">
          <div className="label">{isLink ? 'Private claim link' : 'Claim link'}</div>
          <div className="inset mono break-all px-3.5 py-3 text-xs">{result.shareLink}</div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>The link and the QR open the same claim page.</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={result.shareLink} label="Copy link" className="btn btn-primary" />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void download()}>
              {busy ? <Spinner /> : <Download className="size-4" />} Download gift card (PNG)
            </button>
          </div>
          {error ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to={`/campaigns/${result.id}`} className="btn btn-secondary">Manage gift</Link>
        <Link to={`/verify/${result.id}`} className="btn btn-ghost">Public verification page</Link>
        <button type="button" className="btn btn-ghost" onClick={onAnother}><Gift className="size-4" /> Create another gift</button>
      </div>
    </div>
  )
}
