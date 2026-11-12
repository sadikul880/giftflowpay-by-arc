import { afterEach, describe, expect, test } from 'bun:test'
import { api, ApiError, getSession, kindLabel, pageCount, setSession, timeAgo } from './support'

describe('pagination and time', () => {
  test('page count is never below one and rounds up', () => {
    expect(pageCount(0, 10)).toBe(1)
    expect(pageCount(10, 10)).toBe(1)
    expect(pageCount(11, 10)).toBe(2)
    expect(pageCount(95, 10)).toBe(10)
    expect(pageCount(5, 0)).toBe(5)
  })

  test('time ago reads naturally and falls back to a date', () => {
    const now = Date.parse('2026-11-12T12:00:00Z')
    expect(timeAgo(now - 10_000, now)).toBe('just now')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(now - 3 * 3600_000, now)).toBe('3 h ago')
    expect(timeAgo(now - 2 * 86400_000, now)).toBe('2 d ago')
    expect(timeAgo(now - 30 * 86400_000, now)).toBe('2026-10-13')
    expect(timeAgo(now + 5000, now)).toBe('just now')
  })

  test('kind labels', () => {
    expect(kindLabel('issue')).toBe('Report an issue')
    expect(kindLabel('nonsense')).toBe('Message')
  })
})

describe('session store', () => {
  afterEach(() => setSession(undefined))

  test('keeps a live session and drops an expired one', () => {
    setSession({ token: 't', address: '0xabc', expires: Date.now() + 60_000, isAdmin: false })
    expect(getSession()?.token).toBe('t')
    setSession({ token: 't', address: '0xabc', expires: Date.now() - 1, isAdmin: false })
    expect(getSession()).toBeUndefined()
  })
})

describe('api client', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const stub = (res: Response) => {
    globalThis.fetch = (() => Promise.resolve(res)) as unknown as typeof fetch
  }

  test('returns JSON and sends the bearer token', async () => {
    let seen: Headers | undefined
    globalThis.fetch = ((_: unknown, init: RequestInit) => {
      seen = new Headers(init.headers)
      return Promise.resolve(new Response(JSON.stringify({ ok: 1 }), { status: 200 }))
    }) as unknown as typeof fetch
    expect(await api<{ ok: number }>('/x', { token: 'abc' })).toEqual({ ok: 1 })
    expect(seen?.get('authorization')).toBe('Bearer abc')
  })

  test('turns server errors into ApiError with the server message', async () => {
    stub(new Response(JSON.stringify({ error: 'Admin only.' }), { status: 403 }))
    const e = await api('/admin/stats').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(403)
    expect((e as ApiError).message).toBe('Admin only.')
  })

  test('a non-JSON answer or a network failure says the service is unavailable', async () => {
    stub(new Response('<html></html>', { status: 200 }))
    expect(((await api('/config').catch((x: unknown) => x)) as ApiError).message).toContain('not available')
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(((await api('/config').catch((x: unknown) => x)) as ApiError).message).toContain('not reachable')
  })
})
