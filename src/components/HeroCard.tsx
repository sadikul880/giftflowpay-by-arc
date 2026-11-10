import { Gift } from 'lucide-react'

/** Decorative card art. It shows no amounts or balances, so nothing here can be mistaken for real data. */
export function HeroCard({ className = '' }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-md ${className}`} aria-hidden="true">
      <div
        className="absolute -inset-6 rounded-[40px] blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(52,240,138,0.28), transparent)' }}
      />
      <div
        className="relative aspect-[1.6/1] overflow-hidden rounded-3xl border p-6"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'linear-gradient(140deg, #0f5f35 0%, #0a2a1b 45%, #06110c 100%)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(52,240,138,0.12) inset',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.jpg" alt="" width={28} height={28} className="size-7 rounded-full" />
            <span className="text-sm font-semibold">GiftFlowPay</span>
          </div>
          <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium" style={{ borderColor: 'var(--border-strong)', color: 'var(--green)' }}>
            USDC on Arc
          </span>
        </div>
        <div className="absolute bottom-6 left-6 space-y-1">
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>USDC gift card</div>
          <div className="text-2xl font-semibold tracking-tight">A gift in USDC</div>
        </div>
        <div className="icon-chip absolute bottom-5 right-5 size-24 !rounded-3xl" style={{ background: 'rgba(52,240,138,0.16)' }}>
          <Gift className="size-12" strokeWidth={1.5} />
        </div>
        <div className="absolute -right-10 -top-10 size-40 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(52,240,138,0.35), transparent)' }} />
      </div>
    </div>
  )
}
