/**
 * Client for the GiftFlowPay support API (see server/). Identity is the user's wallet: one free message signature gives a
 * session token that is kept for this browser tab only (sessionStorage) and sent as a bearer header.
 */

export type TicketKind = 'question' | 'issue' | 'suggestion'
export type TicketStatus = 'open' | 'closed'

export const TICKET_KINDS: Array<{ id: TicketKind; label: string; hint: string }> = [
  { id: 'question', label: 'Question', hint: 'I need help with something' },
  { id: 'issue', label: 'Report an issue', hint: 'Something is broken' },
  { id: 'suggestion', label: 'Suggestion', hint: 'An idea to improve GiftFlowPay' },
]
export const kindLabel = (k: string): string => TICKET_KINDS.find((x) => x.id === k)?.label ?? 'Message'

export const MESSAGE_MAX = 2000
export const SUBJECT_MAX = 80

export interface TicketSummary {
  id: number
  /** Only present in the admin's view. */
  address?: string
  kind: TicketKind
  subject: string
  status: TicketStatus
  created: number
  updated: number
  messages: number
  unread: boolean
  awaitingAdmin: boolean
}
export interface ThreadMessage {
  id: number
  author: 'user' | 'admin'
  body: string
  created: number
}
export interface TicketThread extends TicketSummary {
  thread: ThreadMessage[]
}
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  unread?: number
}
export interface AdminStats {
  users: number
  activeUsers7d: number
  newUsers24h: number
  signIns: number
  tickets: number
  open: number
  closed: number
  awaitingReply: number
  unread: number
  messages: number
  replies: number
  byKind: Record<TicketKind, number>
  days: Array<{ day: string; tickets: number; users: number }>
}
export interface AdminUser {
  address: string
  firstSeen: number
  lastSeen: number
  signIns: number
  tickets: number
  openTickets: number
  isAdmin: boolean
}
export interface Session {
  token: string
  address: string
  expires: number
  isAdmin: boolean
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'The support service is not reachable right now. Please try again in a moment.')
  }
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    // A page that is not JSON (for example the single-page fallback in development) means no API answered.
    throw new ApiError(res.status === 200 ? 0 : res.status, 'The support service is not available here.')
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong. Please try again.')
  return data as T
}

/** Page count for a paginated list; never less than 1. */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / Math.max(1, pageSize)))

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`
  return new Date(ms).toISOString().slice(0, 10)
}

// ---- session (this tab only) ----

const KEY = 'giftflowpay:support-session'
const listeners = new Set<() => void>()
let cached: Session | undefined | null = null

function read(): Session | undefined {
  if (typeof sessionStorage === 'undefined') return undefined
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    const s = JSON.parse(raw) as Session
    return s.expires > Date.now() ? s : undefined
  } catch {
    return undefined
  }
}
export function getSession(): Session | undefined {
  if (cached === null) cached = read()
  if (cached && cached.expires <= Date.now()) cached = undefined
  return cached
}
export function setSession(s: Session | undefined): void {
  cached = s
  if (typeof sessionStorage !== 'undefined') {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s))
    else sessionStorage.removeItem(KEY)
  }
  listeners.forEach((l) => l())
}
export function subscribeSession(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
