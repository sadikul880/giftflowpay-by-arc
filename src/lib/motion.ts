/** Small, pure helpers shared by the 3D scene, the cursor and the magnetic buttons. */

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Frame-rate independent smoothing: moves `current` toward `target`, covering most of the gap in about 1/rate seconds. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/** Pointer position inside a box as -1..1 on both axes (0,0 is the centre). Values outside the box are clamped. */
export function pointerInBox(x: number, y: number, box: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp(((x - box.left) / box.width) * 2 - 1, -1, 1),
    y: clamp(((y - box.top) / box.height) * 2 - 1, -1, 1),
  }
}

/**
 * How far a magnetic element moves toward the pointer. Inside `radius` pixels of the element's centre it follows the
 * pointer with the given strength; outside it stays put, so it never jumps.
 */
export function magnetOffset(pointer: { x: number; y: number }, center: { x: number; y: number }, radius: number, strength: number): { x: number; y: number } {
  const dx = pointer.x - center.x
  const dy = pointer.y - center.y
  const dist = Math.hypot(dx, dy)
  if (dist >= radius || radius <= 0) return { x: 0, y: 0 }
  const pull = (1 - dist / radius) * strength
  return { x: dx * pull, y: dy * pull }
}

/** True for users who asked the system to reduce motion. Safe to call on the server and in tests. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True for a mouse or trackpad (not a touch screen), where a custom cursor makes sense. */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

/** Whether the browser can create a WebGL context at all. */
export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
