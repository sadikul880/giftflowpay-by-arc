import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createApp } from './app.mjs'

const admin = privateKeyToAccount(generatePrivateKey())
const alice = privateKeyToAccount(generatePrivateKey())
const bob = privateKeyToAccount(generatePrivateKey())

let base
let close
let t = 1_800_000_000_000

before(async () => {
  const { server } = createApp({ adminWallet: admin.address, clock: () => (t += 1000) })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
  close = () => server.close()
})
after(() => close())

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

async function signIn(account) {
  const n = await call('POST', '/api/auth/nonce', { body: { address: account.address } })
  assert.equal(n.status, 200)
  const signature = await account.signMessage({ message: n.body.message })
  const v = await call('POST', '/api/auth/verify', { body: { address: account.address, nonce: n.body.nonce, signature } })
  assert.equal(v.status, 200)
  return v.body
}

describe('sign-in', () => {
  test('config tells the page which wallet is the admin', async () => {
    const r = await call('GET', '/api/config')
    assert.equal(r.body.admin, admin.address.toLowerCase())
  })

  test('a valid signature gives a session, and only the admin wallet is flagged admin', async () => {
    assert.equal((await signIn(admin)).isAdmin, true)
    assert.equal((await signIn(alice)).isAdmin, false)
  })

  test('a signature from another wallet is refused', async () => {
    const n = await call('POST', '/api/auth/nonce', { body: { address: alice.address } })
    const signature = await bob.signMessage({ message: n.body.message })
    const v = await call('POST', '/api/auth/verify', { body: { address: alice.address, nonce: n.body.nonce, signature } })
    assert.equal(v.status, 401)
  })

  test('a nonce works once', async () => {
    const n = await call('POST', '/api/auth/nonce', { body: { address: alice.address } })
    const signature = await alice.signMessage({ message: n.body.message })
    const body = { address: alice.address, nonce: n.body.nonce, signature }
    assert.equal((await call('POST', '/api/auth/verify', { body })).status, 200)
    assert.equal((await call('POST', '/api/auth/verify', { body })).status, 400)
  })

  test('requests without a session are refused', async () => {
    assert.equal((await call('GET', '/api/tickets')).status, 401)
    assert.equal((await call('GET', '/api/tickets', { token: 'nope' })).status, 401)
  })
})

describe('conversations', () => {
  test('a user opens a conversation, the admin replies, the user sees it as unread and reading clears it', async () => {
    const a = await signIn(alice)
    const created = await call('POST', '/api/tickets', { token: a.token, body: { kind: 'issue', subject: 'Swap stuck', message: 'The swap button stays grey.' } })
    assert.equal(created.status, 201)
    const id = created.body.id
    assert.equal(created.body.thread.length, 1)
    assert.equal(created.body.awaitingAdmin, true)

    const adm = await signIn(admin)
    const adminView = await call('GET', `/api/admin/tickets/${id}`, { token: adm.token })
    assert.equal(adminView.body.address, alice.address.toLowerCase())
    const reply = await call('POST', `/api/admin/tickets/${id}/reply`, { token: adm.token, body: { message: 'Fixed, please try again.' } })
    assert.equal(reply.status, 201)
    assert.equal(reply.body.thread.at(-1).author, 'admin')

    const list = await call('GET', '/api/tickets', { token: a.token })
    assert.equal(list.body.items[0].unread, true)
    assert.equal(list.body.unread, 1)
    const opened = await call('GET', `/api/tickets/${id}`, { token: a.token })
    assert.equal(opened.body.thread.length, 2)
    assert.equal((await call('GET', '/api/tickets', { token: a.token })).body.unread, 0)

    const follow = await call('POST', `/api/tickets/${id}/messages`, { token: a.token, body: { message: 'Works now, thanks.' } })
    assert.equal(follow.body.thread.length, 3)
    const flagged = await call('GET', '/api/admin/tickets?status=open', { token: adm.token })
    assert.ok(flagged.body.items.find((x) => x.id === id).unread)
  })

  test('a user cannot read or write in someone else\'s conversation', async () => {
    const a = await signIn(alice)
    const b = await signIn(bob)
    const created = await call('POST', '/api/tickets', { token: a.token, body: { kind: 'question', message: 'Where do I find my claim link?' } })
    const id = created.body.id
    assert.equal((await call('GET', `/api/tickets/${id}`, { token: b.token })).status, 404)
    assert.equal((await call('POST', `/api/tickets/${id}/messages`, { token: b.token, body: { message: 'hello' } })).status, 404)
    const mine = await call('GET', '/api/tickets', { token: b.token })
    assert.equal(mine.body.total, 0)
  })

  test('input is validated and cleaned', async () => {
    const a = await signIn(alice)
    assert.equal((await call('POST', '/api/tickets', { token: a.token, body: { kind: 'issue', message: 'hi' } })).status, 400)
    const ok = await call('POST', '/api/tickets', { token: a.token, body: { kind: 'bogus', message: 'x'.repeat(3000) } })
    assert.equal(ok.body.kind, 'question')
    assert.equal(ok.body.thread[0].body.length, 2000)
  })

  test('creating conversations is rate limited per wallet', async () => {
    const carol = privateKeyToAccount(generatePrivateKey())
    const c = await signIn(carol)
    const codes = []
    for (let i = 0; i < 7; i++) codes.push((await call('POST', '/api/tickets', { token: c.token, body: { kind: 'question', message: `question number ${i}` } })).status)
    assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429])
  })
})

describe('admin', () => {
  test('only the admin wallet can use the admin routes', async () => {
    const a = await signIn(alice)
    for (const p of ['/api/admin/stats', '/api/admin/tickets', '/api/admin/users']) {
      assert.equal((await call('GET', p, { token: a.token })).status, 403, p)
      assert.equal((await call('GET', p)).status, 401, p)
    }
    assert.equal((await call('POST', '/api/admin/tickets/1/reply', { token: a.token, body: { message: 'hi' } })).status, 403)
  })

  test('tickets paginate and filter', async () => {
    const adm = await signIn(admin)
    const all = await call('GET', '/api/admin/tickets?pageSize=2&page=1', { token: adm.token })
    assert.equal(all.body.items.length, 2)
    assert.ok(all.body.total > 2)
    const p2 = await call('GET', '/api/admin/tickets?pageSize=2&page=2', { token: adm.token })
    assert.notEqual(p2.body.items[0].id, all.body.items[0].id)
    const found = await call('GET', '/api/admin/tickets?q=swap%20button', { token: adm.token })
    assert.ok(found.body.total >= 1)
    const none = await call('GET', '/api/admin/tickets?q=zzzz-nothing', { token: adm.token })
    assert.equal(none.body.total, 0)
    const wild = await call('GET', '/api/admin/tickets?q=%25', { token: adm.token })
    assert.equal(wild.body.total, 0)
  })

  test('closing and reopening a conversation', async () => {
    const adm = await signIn(admin)
    const first = (await call('GET', '/api/admin/tickets', { token: adm.token })).body.items[0]
    const closed = await call('POST', `/api/admin/tickets/${first.id}/status`, { token: adm.token, body: { status: 'closed' } })
    assert.equal(closed.body.status, 'closed')
    assert.equal((await call('POST', `/api/admin/tickets/${first.id}/status`, { token: adm.token, body: { status: 'nope' } })).status, 400)
    const reopened = await call('POST', `/api/admin/tickets/${first.id}/reply`, { token: adm.token, body: { message: 'Reopening to check.' } })
    assert.equal(reopened.body.status, 'open')
  })

  test('the user list paginates and counts conversations', async () => {
    const adm = await signIn(admin)
    const users = await call('GET', '/api/admin/users?pageSize=2', { token: adm.token })
    assert.equal(users.body.items.length, 2)
    assert.ok(users.body.total >= 4)
    const a = await call('GET', `/api/admin/users?q=${alice.address.slice(0, 10)}`, { token: adm.token })
    assert.equal(a.body.items[0].address, alice.address.toLowerCase())
    assert.ok(a.body.items[0].tickets >= 2)
    assert.equal((await call('GET', `/api/admin/users?q=${admin.address}`, { token: adm.token })).body.items[0].isAdmin, true)
  })

  test('stats add up', async () => {
    const adm = await signIn(admin)
    const s = (await call('GET', '/api/admin/stats', { token: adm.token })).body
    assert.equal(s.tickets, s.open + s.closed)
    assert.equal(s.days.length, 14)
    assert.equal(s.byKind.question + s.byKind.issue + s.byKind.suggestion, s.tickets)
    assert.ok(s.replies >= 2)
  })

  test('logging out ends the session', async () => {
    const a = await signIn(alice)
    assert.equal((await call('POST', '/api/auth/logout', { token: a.token })).status, 200)
    assert.equal((await call('GET', '/api/tickets', { token: a.token })).status, 401)
  })
})

describe('without an admin wallet', () => {
  test('nobody is an admin', async () => {
    const { server } = createApp({ adminWallet: '' })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const url = `http://127.0.0.1:${server.address().port}`
    const cfg = await (await fetch(`${url}/api/config`)).json()
    assert.equal(cfg.admin, null)
    server.close()
  })
})
