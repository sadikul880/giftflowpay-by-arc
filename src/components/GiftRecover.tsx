import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import QRCode from 'qrcode'
import { useSignMessage } from 'wagmi'
import { GiftShare, type GiftShareData } from '@/components/GiftShare'
import { Notice, Spinner } from '@/components/ui'
import type { CampaignView } from '@/lib/chain'
import { keyMessage, masterFromSignature, openLink } from '@/lib/flow'
import { explainError, fmtUsd } from '@/lib/format'
import { giftDesign, methodFromMode, recoverGift } from '@/lib/gift'
import { ACTIVE, contractAddress } from '@/lib/network'
import { buildShareLink } from '@/lib/share'

/**
 * Brings a gift's link, code, QR and image back after the creation screen is gone. The funding wallet signs the same
 * free message it signed when creating the gift; nothing is stored anywhere.
 */
export function GiftRecover({ view }: { view: CampaignView }) {
  const { signMessageAsync } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [data, setData] = useState<GiftShareData>()

  const g = view.meta?.g
  const leaf = view.leaves?.[0]
  if (!g || !view.meta) return null
  if (!leaf || !view.salt) return <Notice tone="warn">This gift&rsquo;s details could not be loaded from the chain, so its link cannot be rebuilt here.</Notice>

  async function show() {
    if (!g || !leaf || !view.salt || !view.meta) return
    setBusy(true)
    setError(undefined)
    try {
      const method = methodFromMode(view.meta.k)
      const needsKey = method !== 'wallet'
      const master = needsKey ? masterFromSignature(await signMessageAsync({ message: keyMessage(contractAddress(), ACTIVE.chainId, view.salt) })) : undefined
      const { code } = recoverGift(method, leaf, master ?? '0x', view.salt)
      const claimPage = await buildShareLink(`/claim/${view.id}`)
      const shareLink = method === 'link' && master ? await openLink(view.id, master) : method === 'wallet' ? `${claimPage}?r=${leaf.account}` : claimPage
      setData({
        id: view.id,
        method,
        amount: fmtUsd(view.campaign.totalAllocation),
        from: g.f,
        to: g.t,
        message: view.meta.m,
        design: giftDesign(g.d).id,
        claimPage,
        shareLink,
        code,
        wallet: method === 'wallet' ? leaf.account : undefined,
        qr: await QRCode.toDataURL(shareLink, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#04110a', light: '#ffffff' } }),
      })
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  if (data) return <GiftShare data={data} />

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> Share this gift</div>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Get the link, QR code, secret code and card image back. You sign a free message with the wallet that funded this gift; no funds move.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void show()}>
        {busy ? <Spinner /> : <KeyRound className="size-4" />} Show link, QR and card
      </button>
    </section>
  )
}
