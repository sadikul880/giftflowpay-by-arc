import { giftDesign } from '@/lib/gift'

/** On-screen gift card. Mirrors the downloadable PNG so the preview matches what the recipient receives. */
export function GiftCardArt({
  design,
  amount,
  from,
  to,
  message,
  className = '',
}: {
  design: string | undefined
  amount: string
  from?: string
  to?: string
  message?: string
  className?: string
}) {
  const d = giftDesign(design)
  return (
    <div
      className={`relative aspect-[1.6/1] w-full overflow-hidden rounded-3xl border p-5 sm:p-6 ${className}`}
      style={{
        color: d.text,
        borderColor: `${d.accent}66`,
        background: `linear-gradient(135deg, ${d.from} 0%, ${d.to} 100%)`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      }}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 size-52 rounded-full" style={{ background: `radial-gradient(closest-side, ${d.accent}55, transparent)` }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.jpg" alt="" width={28} height={28} className="size-7 rounded-full" />
          <span className="text-sm font-semibold">GiftFlowPay</span>
        </div>
        <span className="text-[11px] font-medium" style={{ color: d.accent }}>USDC gift card on Arc</span>
      </div>
      <div className="relative mt-5 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">${amount || '0'}</span>
        <span className="text-base font-medium" style={{ color: d.accent }}>USDC</span>
      </div>
      {message?.trim() ? <p className="relative mt-3 line-clamp-3 text-sm italic opacity-90">{message.trim()}</p> : null}
      <div className="absolute bottom-5 left-5 right-5 flex justify-between gap-4 text-xs sm:bottom-6 sm:left-6 sm:right-6">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">To</div>
          <div className="truncate text-sm font-semibold">{to?.trim() || 'Someone special'}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">From</div>
          <div className="truncate text-sm font-semibold">{from?.trim() || 'A friend'}</div>
        </div>
      </div>
    </div>
  )
}
