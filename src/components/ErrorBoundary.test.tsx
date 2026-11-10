import { describe, expect, test } from 'bun:test'
import type { ReactElement } from 'react'
import { ErrorBoundary, isStaleBundleError } from './ErrorBoundary'

const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as ReactElement<{ children?: unknown }>).props.children)
  return ''
}

describe('error boundary', () => {
  test('captures the error that a child throws', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('boom')).error?.message).toBe('boom')
  })

  test('renders the children while nothing is wrong', () => {
    const b = new ErrorBoundary({ children: 'page' })
    expect(b.render()).toBe('page')
  })

  test('shows an alert with the message and a reload action once an error is set', () => {
    const b = new ErrorBoundary({ children: 'page' })
    b.state = { error: new Error('render failed') }
    const el = b.render() as ReactElement<{ role?: string }>
    expect(el.props.role).toBe('alert')
    const text = textOf(el)
    expect(text).toContain('Something went wrong on this page')
    expect(text).toContain('render failed')
    expect(text).toContain('Reload')
  })

  test('a page that failed because the app was updated asks for a reload instead of showing a stack', () => {
    const e = new Error('Failed to fetch dynamically imported module: https://x/assets/Swap-abc.js')
    expect(isStaleBundleError(e)).toBe(true)
    const b = new ErrorBoundary({ children: 'page' })
    b.state = { error: e }
    expect(textOf(b.render())).toContain('A new version is available')
    expect(isStaleBundleError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isStaleBundleError(undefined)).toBe(false)
  })
})
