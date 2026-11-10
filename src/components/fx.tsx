import { useEffect, useRef, type CSSProperties, type ElementType, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { damp, hasFinePointer, magnetOffset, prefersReducedMotion } from '@/lib/motion'

/**
 * A soft ring that trails the mouse, grows over links and buttons and fades over text fields. The native cursor stays,
 * so nothing about pointing gets harder. It is not created on touch screens or for reduced motion.
 */
export function CursorFx() {
  const ring = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasFinePointer() || prefersReducedMotion()) return
    const r = ring.current
    const d = dot.current
    if (!r || !d) return
    const pos = { x: -100, y: -100 }
    const lag = { x: -100, y: -100 }
    let scale = 1
    let scaleTarget = 1
    let shown = false
    let raf = 0
    let last = performance.now()

    const onMove = (e: PointerEvent | MouseEvent) => {
      pos.x = e.clientX
      pos.y = e.clientY
      if (!shown) {
        shown = true
        lag.x = pos.x
        lag.y = pos.y
        r.style.opacity = '1'
        d.style.opacity = '1'
      }
      const t = e.target instanceof Element ? e.target : null
      const field = t?.closest('input, textarea, select, [contenteditable="true"]')
      const link = t?.closest('a, button, [role="button"], [role="tab"], label, summary')
      r.dataset.state = field ? 'field' : link ? 'link' : 'idle'
      scaleTarget = field ? 0.4 : link ? 1.9 : 1
    }
    const onLeave = () => {
      shown = false
      r.style.opacity = '0'
      d.style.opacity = '0'
    }
    const onDown = () => (scaleTarget *= 0.78)
    const onUp = () => (scaleTarget = r.dataset.state === 'link' ? 1.9 : r.dataset.state === 'field' ? 0.4 : 1)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      lag.x = damp(lag.x, pos.x, 14, dt)
      lag.y = damp(lag.y, pos.y, 14, dt)
      scale = damp(scale, scaleTarget, 12, dt)
      r.style.transform = `translate3d(${lag.x}px, ${lag.y}px, 0) translate(-50%, -50%) scale(${scale})`
      d.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div aria-hidden="true">
      <div ref={ring} className="cursor-ring" data-state="idle" />
      <div ref={dot} className="cursor-dot" />
    </div>
  )
}

/** Pulls its children a little toward the mouse when it is close, and lets go smoothly. For the main buttons. */
export function Magnetic({ children, strength = 0.28, radius = 140, className = '' }: { children: ReactNode; strength?: number; radius?: number; className?: string }) {
  const wrap = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = wrap.current
    if (!el || reduce || !hasFinePointer()) return
    const cur = { x: 0, y: 0 }
    const goal = { x: 0, y: 0 }
    let raf = 0
    let last = performance.now()
    const move = (e: PointerEvent) => {
      const b = el.getBoundingClientRect()
      const o = magnetOffset({ x: e.clientX, y: e.clientY }, { x: b.left + b.width / 2, y: b.top + b.height / 2 }, radius, strength)
      goal.x = o.x
      goal.y = o.y
    }
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      cur.x = damp(cur.x, goal.x, 10, dt)
      cur.y = damp(cur.y, goal.y, 10, dt)
      el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
    }
  }, [reduce, radius, strength])

  return <span ref={wrap} className={`inline-block will-change-transform ${className}`}>{children}</span>
}

/** A card with a light that follows the mouse across its surface (see `.spot` in index.css). */
export function SpotCard<T extends ElementType = 'div'>({ as, className = '', children, style, ...rest }: { as?: T; className?: string; children: ReactNode; style?: CSSProperties } & Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'>) {
  const Tag: ElementType = as ?? 'div'
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - b.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - b.top}px`)
  }
  return (
    <Tag className={`spot ${className}`} style={style} onPointerMove={onMove} {...rest}>
      {children}
    </Tag>
  )
}

/** Fades and lifts its children into view the first time they scroll on screen. */
export function Reveal({ children, delay = 0, y = 26, className = '' }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
