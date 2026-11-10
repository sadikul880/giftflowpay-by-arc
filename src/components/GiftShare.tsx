import { useState } from 'react'
import { Download } from 'lucide-react'
import { GiftCardArt } from '@/components/GiftCardArt'
import { CopyButton, Notice, Spinner } from '@/components/ui'
import type { GiftDesignId, GiftMethod } from '@/lib/gift'
import { downloadBlob, renderGiftPng } from '@/lib/giftPng'
import { shortAddr } from '@/lib/format'

/** Everything needed to share one gift. Built right after funding, or later by signing with the funding wallet. */
export interface GiftShareData {
  id: bigint
  method: GiftMethod
  amount: string
  from: string
  to: string
  message: string
  design: string
  claimPage: string
  /** What the QR and the copy button share: the claim page, or for link gifts the private link. */
  shareLink: string
  code?: string
  wallet?: string
  qr: string
}

/** The gift card, its code (if any), the link, the QR code and the PNG download. Secrets stay out of anything public. */
export function GiftShare({ data }: { data: GiftShareData }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const isLink = data.method === 'link'

  async function download() {
    setBusy(true)
    setError(undefined)
    try {
      const blob = await renderGiftPng({
        design: data.design as GiftDesignId,
        amount: data.amount,
        from: data.from,
        to: data.to,
        message: data.message,
        // A link gift's QR is the secret itself, so its image carries none.
        qrDataUrl: isLink ? undefined : data.qr,
        qrCaption: isLink ? undefined : data.claimPage.replace(/^https?:\/\//, ''),
        footnote: isLink ? 'Your sender will share the private claim link with you.' : undefined,
      })
      downloadBlob(blob, `giftflowpay-gift-${data.id}.png`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the image')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <GiftCardArt design={data.design} amount={data.amount} from={data.from} to={data.to} message={data.message} />

      {data.method === 'code' && data.code ? (
        <section className="card space-y-3 p-5">
          <div className="label">Secret code</div>
          <div className="inset mono px-4 py-3 text-2xl tracking-widest">{data.code}</div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Send this code to the recipient in a different message from the link or image. Anyone with both can claim the gift.</p>
          <CopyButton value={data.code} label="Copy code" className="btn btn-secondary" />
        </section>
      ) : null}

      {isLink ? <Notice tone="warn">This link and its QR code contain the claim secret. Anyone who has them can claim the gift, so share them only with the recipient. The downloaded image has no QR for that reason.</Notice> : null}
      {data.method === 'wallet' ? <Notice>Only {shortAddr(data.wallet ?? '')} can claim this gift. The link and QR hold no secret.</Notice> : null}

      <section className="card grid gap-6 p-5 sm:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <img src={data.qr} alt="QR code that opens the claim page" width={220} height={220} className="rounded-xl bg-white p-2" />
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>{isLink ? 'Private: contains the claim secret' : 'Opens the claim page'}</p>
        </div>
        <div className="min-w-0 space-y-3">
          <div className="label">{isLink ? 'Private claim link' : 'Claim link'}</div>
          <div className="inset mono break-all px-3.5 py-3 text-xs">{data.shareLink}</div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>The link and the QR open the same claim page.</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={data.shareLink} label="Copy link" className="btn btn-primary" />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void download()}>
              {busy ? <Spinner /> : <Download className="size-4" />} Download gift card (PNG)
            </button>
          </div>
          {error ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
