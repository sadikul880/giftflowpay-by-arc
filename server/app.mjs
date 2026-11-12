import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { verifyMessage } from 'viem'
import { openDb, TICKET_SELECT } from './db.mjs'

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const KINDS = ['question', 'issue', 'suggestion']
const MAX_BODY_BYTES = 16 * 1024
const MESSAGE_MAX = 2000
const SUBJECT_MAX = 80
const NONCE_TTL = 5 * 60 * 1000
const SESSION_TTL = 12 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Control characters out, line endings unified, length capped. */
export function clean(raw, max) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
}

export function signInMessage(address, nonce) {
  return [
    'GiftFlowPay sign-in',
    '',
    'Sign this message to prove you own this wallet. It costs nothing and sends no transaction.',
    '',
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
  ].join('\n')
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/** A fixed-window counter per key: `limit` hits per `windowMs`. */
function limiter() {
  const hits = new Map()
  return (key, limit, windowMs, now) => {
    const cur = hits.get(key)
    if (!cur || cur.reset <= now) {
      hits.set(key, { n: 1, reset: now + windowMs })
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
      return
    }
    cur.n += 1
    if (cur.n > limit) throw new HttpError(429, 'Too many requests. Please wait a little and try again.')
  }
}

/**
 * The support API. `adminWallet` is the only address that can use /api/admin. Everyone else signs in with their
 * wallet (a free message signature) to open conversations and read the replies.
 */
export function createApp({ dbPath = ':memory:', adminWallet = '', clock = () => Date.now() } = {}) {
  const db = openDb(dbPath)
  const admin = ADDRESS.test(adminWallet.trim()) ? adminWallet.trim().toLowerCase() : null
  const limit = limiter()
  let lastStamp = 0
  const now = () => (lastStamp = Math.max(clock(), lastStamp + 1))

  const q = {
    upsertUser: db.prepare(
      `INSERT INTO users (address, first_seen, last_seen, sign_ins) VALUES (?, ?, ?, 1)
       ON CONFLICT(address) DO UPDATE SET last_seen = excluded.last_seen, sign_ins = sign_ins + 1`,
    ),
    touchUser: db.prepare('UPDATE users SET last_seen = ? WHERE address = ?'),
    addNonce: db.prepare('INSERT INTO nonces (nonce, address, message, expires) VALUES (?, ?, ?, ?)'),
    takeNonce: db.prepare('DELETE FROM nonces WHERE nonce = ? RETURNING address, message, expires'),
    addSession: db.prepare('INSERT INTO sessions (hash, address, expires) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT address, expires FROM sessions WHERE hash = ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    prune: [db.prepare('DELETE FROM nonces WHERE expires < ?'), db.prepare('DELETE FROM sessions WHERE expires < ?')],
    addTicket: db.prepare('INSERT INTO tickets (address, kind, subject, created, updated, user_seen) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'),
    addMessage: db.prepare('INSERT INTO messages (ticket_id, author, body, created) VALUES (?, ?, ?, ?)'),
    bump: db.prepare('UPDATE tickets SET updated = ?, status = ? WHERE id = ?'),
    ticket: db.prepare(`${TICKET_SELECT} WHERE t.id = ?`),
    messages: db.prepare('SELECT id, author, body, created FROM messages WHERE ticket_id = ? ORDER BY id'),
    userSeen: db.prepare('UPDATE tickets SET user_seen = ? WHERE id = ?'),
    adminSeen: db.prepare('UPDATE tickets SET admin_seen = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE tickets SET status = ?, updated = ? WHERE id = ?'),
    mineCount: db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE address = ?'),
    mine: db.prepare(`${TICKET_SELECT} WHERE t.address = ? ORDER BY t.updated DESC LIMIT ? OFFSET ?`),
    mineUnread: db.prepare(
      "SELECT COUNT(*) AS n FROM tickets t WHERE t.address = ? AND EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.author = 'admin' AND m.created > t.user_seen)",
    ),
  }

  /** Runs `fn` in a transaction, so a ticket never exists without its first message. */
  function tx(fn) {
    db.exec('BEGIN')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  const page = (url, max = 50) => {
    const p = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const size = Math.min(max, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '10', 10) || 10))
    return { page: p, size, offset: (p - 1) * size }
  }

  const ticketView = (r, forAdmin) => ({
    id: r.id,
    address: forAdmin ? r.address : undefined,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    created: r.created,
    updated: r.updated,
    messages: r.messages,
    unread: Boolean(forAdmin ? r.admin_unread : r.user_unread),
    awaitingAdmin: r.status === 'open' && r.last_author === 'user',
  })

  function authed(req) {
    const h = req.headers.authorization ?? ''
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
    if (!token) throw new HttpError(401, 'Sign in with your wallet first.')
    const row = q.session.get(sha256(token))
    if (!row || row.expires < clock()) throw new HttpError(401, 'Your session has expired. Sign in again.')
    return { address: row.address, token, isAdmin: admin !== null && row.address === admin }
  }

  const requireAdmin = (req) => {
    const s = authed(req)
    if (!s.isAdmin) throw new HttpError(403, 'Admin only.')
    return s
  }

  async function readJson(req) {
    const chunks = []
    let size = 0
    for await (const c of req) {
      size += c.length
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.')
      chunks.push(c)
    }
    if (size === 0) return {}
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      return v && typeof v === 'object' ? v : {}
    } catch {
      throw new HttpError(400, 'The request body is not valid JSON.')
    }
  }

  const ticketWithMessages = (id, forAdmin) => {
    const r = q.ticket.get(id)
    if (!r) throw new HttpError(404, 'Conversation not found.')
    return { ...ticketView(r, forAdmin), thread: q.messages.all(id) }
  }

  const ownTicket = (s, id) => {
    const r = q.ticket.get(id)
    if (!r || r.address !== s.address) throw new HttpError(404, 'Conversation not found.')
    return r
  }

  const parseId = (v) => {
    const n = Number(v)
    if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Not found.')
    return n
  }

  /** Every route. Returns [status, body]. */
  async function route(req, url, ip) {
    const { pathname } = url
    const method = req.method ?? 'GET'
    const t = now()
    let m

    if (pathname === '/api/health') return [200, { ok: true }]
    if (pathname === '/api/config' && method === 'GET') return [200, { admin }]

    if (pathname === '/api/auth/nonce' && method === 'POST') {
      limit(`nonce:${ip}`, 30, 60_000, t)
      const body = await readJson(req)
      if (!ADDRESS.test(String(body.address ?? ''))) throw new HttpError(400, 'A wallet address is required.')
      const address = String(body.address).toLowerCase()
      const nonce = randomBytes(16).toString('hex')
      const message = signInMessage(address, nonce)
      q.prune.forEach((p) => p.run(t))
      q.addNonce.run(nonce, address, message, t + NONCE_TTL)
      return [200, { nonce, message }]
    }

    if (pathname === '/api/auth/verify' && method === 'POST') {
      limit(`verify:${ip}`, 30, 60_000, t)
      const body = await readJson(req)
      const address = String(body.address ?? '').toLowerCase()
      const signature = String(body.signature ?? '')
      if (!ADDRESS.test(address) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new HttpError(400, 'Address and signature are required.')
      const row = q.takeNonce.get(String(body.nonce ?? ''))
      if (!row || row.address !== address || row.expires < t) throw new HttpError(400, 'The sign-in request expired. Try again.')
      const ok = await verifyMessage({ address, message: row.message, signature }).catch(() => false)
      if (!ok) throw new HttpError(401, 'That signature does not match the wallet.')
      const token = randomBytes(32).toString('hex')
      const expires = t + SESSION_TTL
      q.addSession.run(sha256(token), address, expires)
      q.upsertUser.run(address, t, t)
      return [200, { token, expires, address, isAdmin: admin !== null && address === admin }]
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      q.dropSession.run(sha256(authed(req).token))
      return [200, { ok: true }]
    }

    // ---- the signed-in user's own conversations ----
    if (pathname === '/api/tickets' && method === 'GET') {
      const s = authed(req)
      q.touchUser.run(t, s.address)
      const { page: p, size, offset } = page(url, 20)
      const total = q.mineCount.get(s.address).n
      const items = q.mine.all(s.address, size, offset).map((r) => ticketView(r, false))
      return [200, { items, total, page: p, pageSize: size, unread: q.mineUnread.get(s.address).n }]
    }

    if (pathname === '/api/tickets' && method === 'POST') {
      const s = authed(req)
      limit(`ticket:${s.address}`, 5, 60 * 60_000, t)
      const body = await readJson(req)
      const kind = KINDS.includes(body.kind) ? body.kind : 'question'
      const text = clean(body.message, MESSAGE_MAX)
      if (text.length < 5) throw new HttpError(400, 'Please write at least a few words.')
      const subject = clean(body.subject, SUBJECT_MAX) || text.split('\n')[0].slice(0, 60)
      const id = tx(() => {
        const { id: newId } = q.addTicket.get(s.address, kind, subject, t, t, t)
        q.addMessage.run(newId, 'user', text, t)
        return newId
      })
      q.touchUser.run(t, s.address)
      return [201, ticketWithMessages(id, false)]
    }

    if ((m = pathname.match(/^\/api\/tickets\/(\d+)$/)) && method === 'GET') {
      const s = authed(req)
      const id = parseId(m[1])
      ownTicket(s, id)
      q.userSeen.run(t, id)
      return [200, ticketWithMessages(id, false)]
    }

    if ((m = pathname.match(/^\/api\/tickets\/(\d+)\/messages$/)) && method === 'POST') {
      const s = authed(req)
      limit(`msg:${s.address}`, 20, 60 * 60_000, t)
      const id = parseId(m[1])
      ownTicket(s, id)
      const text = clean((await readJson(req)).message, MESSAGE_MAX)
      if (text.length < 1) throw new HttpError(400, 'Write a message first.')
      tx(() => {
        q.addMessage.run(id, 'user', text, t)
        q.bump.run(t, 'open', id)
        q.userSeen.run(t, id)
      })
      return [201, ticketWithMessages(id, false)]
    }

    // ---- admin ----
    if (pathname === '/api/admin/stats' && method === 'GET') {
      requireAdmin(req)
      const one = (sql, ...a) => db.prepare(sql).get(...a).n
      const days = []
      const start = new Date(t)
      start.setUTCHours(0, 0, 0, 0)
      for (let i = 13; i >= 0; i--) {
        const from = start.getTime() - i * DAY
        days.push({
          day: new Date(from).toISOString().slice(0, 10),
          tickets: one('SELECT COUNT(*) AS n FROM tickets WHERE created >= ? AND created < ?', from, from + DAY),
          users: one('SELECT COUNT(*) AS n FROM users WHERE first_seen >= ? AND first_seen < ?', from, from + DAY),
        })
      }
      const byKind = Object.fromEntries(KINDS.map((k) => [k, one('SELECT COUNT(*) AS n FROM tickets WHERE kind = ?', k)]))
      return [
        200,
        {
          users: one('SELECT COUNT(*) AS n FROM users'),
          activeUsers7d: one('SELECT COUNT(*) AS n FROM users WHERE last_seen >= ?', t - 7 * DAY),
          newUsers24h: one('SELECT COUNT(*) AS n FROM users WHERE first_seen >= ?', t - DAY),
          signIns: one('SELECT COALESCE(SUM(sign_ins), 0) AS n FROM users'),
          tickets: one('SELECT COUNT(*) AS n FROM tickets'),
          open: one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"),
          closed: one("SELECT COUNT(*) AS n FROM tickets WHERE status = 'closed'"),
          awaitingReply: one(
            "SELECT COUNT(*) AS n FROM tickets t WHERE t.status = 'open' AND (SELECT author FROM messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) = 'user'",
          ),
          unread: one("SELECT COUNT(*) AS n FROM tickets t WHERE EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.author = 'user' AND m.created > t.admin_seen)"),
          messages: one('SELECT COUNT(*) AS n FROM messages'),
          replies: one("SELECT COUNT(*) AS n FROM messages WHERE author = 'admin'"),
          byKind,
          days,
        },
      ]
    }

    if (pathname === '/api/admin/tickets' && method === 'GET') {
      requireAdmin(req)
      const { page: p, size, offset } = page(url)
      const status = url.searchParams.get('status')
      const kind = url.searchParams.get('kind')
      const search = clean(url.searchParams.get('q'), 80).toLowerCase()
      const where = []
      const args = []
      if (status === 'open' || status === 'closed') {
        where.push('t.status = ?')
        args.push(status)
      }
      if (KINDS.includes(kind)) {
        where.push('t.kind = ?')
        args.push(kind)
      }
      if (search) {
        const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        where.push("(LOWER(t.address) LIKE ? ESCAPE '\\' OR LOWER(t.subject) LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND LOWER(m.body) LIKE ? ESCAPE '\\'))")
        args.push(like, like, like)
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const total = db.prepare(`SELECT COUNT(*) AS n FROM tickets t${clause}`).get(...args).n
      const rows = db.prepare(`${TICKET_SELECT}${clause} ORDER BY t.updated DESC LIMIT ? OFFSET ?`).all(...args, size, offset)
      return [200, { items: rows.map((r) => ticketView(r, true)), total, page: p, pageSize: size }]
    }

    if ((m = pathname.match(/^\/api\/admin\/tickets\/(\d+)$/)) && method === 'GET') {
      requireAdmin(req)
      const id = parseId(m[1])
      ticketWithMessages(id, true)
      q.adminSeen.run(t, id)
      return [200, ticketWithMessages(id, true)]
    }

    if ((m = pathname.match(/^\/api\/admin\/tickets\/(\d+)\/reply$/)) && method === 'POST') {
      requireAdmin(req)
      const id = parseId(m[1])
      ticketWithMessages(id, true)
      const body = await readJson(req)
      const text = clean(body.message, MESSAGE_MAX)
      if (text.length < 1) throw new HttpError(400, 'Write a reply first.')
      tx(() => {
        q.addMessage.run(id, 'admin', text, t)
        q.bump.run(t, body.close === true ? 'closed' : 'open', id)
        q.adminSeen.run(t + 1, id)
      })
      return [201, ticketWithMessages(id, true)]
    }

    if ((m = pathname.match(/^\/api\/admin\/tickets\/(\d+)\/status$/)) && method === 'POST') {
      requireAdmin(req)
      const id = parseId(m[1])
      ticketWithMessages(id, true)
      const status = (await readJson(req)).status
      if (status !== 'open' && status !== 'closed') throw new HttpError(400, 'Status must be open or closed.')
      q.setStatus.run(status, t, id)
      return [200, ticketWithMessages(id, true)]
    }

    if (pathname === '/api/admin/users' && method === 'GET') {
      requireAdmin(req)
      const { page: p, size, offset } = page(url)
      const search = clean(url.searchParams.get('q'), 42).toLowerCase()
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      const clause = search ? " WHERE u.address LIKE ? ESCAPE '\\'" : ''
      const args = search ? [like] : []
      const total = db.prepare(`SELECT COUNT(*) AS n FROM users u${clause}`).get(...args).n
      const rows = db
        .prepare(
          `SELECT u.address, u.first_seen, u.last_seen, u.sign_ins,
             (SELECT COUNT(*) FROM tickets t WHERE t.address = u.address) AS tickets,
             (SELECT COUNT(*) FROM tickets t WHERE t.address = u.address AND t.status = 'open') AS open_tickets
           FROM users u${clause} ORDER BY u.last_seen DESC LIMIT ? OFFSET ?`,
        )
        .all(...args, size, offset)
      return [
        200,
        { items: rows.map((r) => ({ address: r.address, firstSeen: r.first_seen, lastSeen: r.last_seen, signIns: r.sign_ins, tickets: r.tickets, openTickets: r.open_tickets, isAdmin: r.address === admin })), total, page: p, pageSize: size },
      ]
    }

    throw new HttpError(404, 'Not found.')
  }

  const server = createServer((req, res) => {
    const ip = String(req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? 'unknown')
    const send = (status, body) => {
      const data = JSON.stringify(body)
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(data)
    }
    const url = new URL(req.url ?? '/', 'http://local')
    route(req, url, ip)
      .then(([status, body]) => send(status, body))
      .catch((e) => {
        if (e instanceof HttpError) return send(e.status, { error: e.message })
        console.error('support api error:', e)
        send(500, { error: 'Something went wrong on our side. Please try again.' })
      })
  })

  return { server, db, admin }
}
