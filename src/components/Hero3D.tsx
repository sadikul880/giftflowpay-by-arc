import { useEffect, useRef, useState } from 'react'
import { HeroCard } from '@/components/HeroCard'
import { prefersReducedMotion, webglAvailable } from '@/lib/motion'

/**
 * The 3D hero. three.js is loaded only here (this file is lazy-loaded by the landing page), and if WebGL is missing
 * or the scene fails to start, the flat CSS card is shown instead, so the page never breaks.
 */
export default function Hero3D() {
  const host = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(() => !webglAvailable())

  useEffect(() => {
    const el = host.current
    if (!el || fallback) return
    let dispose: (() => void) | undefined
    let cancelled = false
    import('@/lib/heroScene')
      .then(({ createHeroScene }) => {
        if (cancelled) return
        const scene = createHeroScene(el, { reducedMotion: prefersReducedMotion() })
        dispose = () => scene.dispose()
      })
      .catch(() => {
        if (!cancelled) setFallback(true)
      })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [fallback])

  if (fallback) return <HeroCard />
  return <div ref={host} className="relative mx-auto aspect-[1.08/1] w-full max-w-[640px] sm:aspect-[1.2/1]" role="img" aria-label="A 3D GiftFlowPay card with USDC coins" />
}
