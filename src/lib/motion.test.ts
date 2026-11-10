import { describe, expect, test } from 'bun:test'
import { clamp, damp, hasFinePointer, magnetOffset, pointerInBox, prefersReducedMotion, webglAvailable } from './motion'

describe('motion helpers', () => {
  test('clamp keeps a value inside the range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
  })

  test('damp moves toward the target without overshooting, and does not move when dt is 0', () => {
    expect(damp(0, 10, 8, 0)).toBe(0)
    const a = damp(0, 10, 8, 0.016)
    const b = damp(a, 10, 8, 0.016)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThan(10)
    expect(damp(0, 10, 8, 100)).toBeCloseTo(10, 6)
  })

  test('damp gives the same result for one long step and two half steps', () => {
    const one = damp(0, 1, 6, 0.2)
    const two = damp(damp(0, 1, 6, 0.1), 1, 6, 0.1)
    expect(one).toBeCloseTo(two, 10)
  })

  test('pointerInBox maps the box to -1..1 and clamps outside it', () => {
    const box = { left: 100, top: 50, width: 200, height: 100 }
    expect(pointerInBox(200, 100, box)).toEqual({ x: 0, y: 0 })
    expect(pointerInBox(100, 50, box)).toEqual({ x: -1, y: -1 })
    expect(pointerInBox(900, 900, box)).toEqual({ x: 1, y: 1 })
    expect(pointerInBox(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })

  test('magnetOffset pulls inside the radius, fades to zero at the edge and is zero outside', () => {
    const c = { x: 0, y: 0 }
    const near = magnetOffset({ x: 20, y: 0 }, c, 100, 0.5)
    expect(near.x).toBeGreaterThan(0)
    expect(near.x).toBeLessThan(20)
    expect(near.y).toBe(0)
    expect(magnetOffset({ x: 100, y: 0 }, c, 100, 0.5)).toEqual({ x: 0, y: 0 })
    expect(magnetOffset({ x: 500, y: 500 }, c, 100, 0.5)).toEqual({ x: 0, y: 0 })
    expect(magnetOffset({ x: 10, y: 0 }, c, 0, 0.5)).toEqual({ x: 0, y: 0 })
  })

  test('environment checks are safe without a browser', () => {
    expect(prefersReducedMotion()).toBe(false)
    expect(hasFinePointer()).toBe(false)
    expect(webglAvailable()).toBe(false)
  })
})
