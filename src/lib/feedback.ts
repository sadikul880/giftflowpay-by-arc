import { TELEGRAM_URL } from '@/components/Socials'

export type FeedbackKind = 'suggestion' | 'issue' | 'other'

export const FEEDBACK_KINDS: Array<{ id: FeedbackKind; label: string }> = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'issue', label: 'Report an issue' },
  { id: 'other', label: 'Something else' },
]

export const FEEDBACK_MAX = 1000
/** X posts are limited to 280 characters, and the handle takes some. */
const X_MAX = 280

export interface FeedbackInput {
  kind: FeedbackKind
  message: string
  /** Optional technical lines (network, browser). Never a wallet address or a link fragment. */
  details?: string[]
}

const kindLabel = (k: FeedbackKind) => FEEDBACK_KINDS.find((x) => x.id === k)?.label ?? 'Feedback'

/** Control characters out, line endings unified, length capped. */
export function cleanMessage(raw: string, max = FEEDBACK_MAX): string {
  return raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max)
}

export function buildFeedbackText({ kind, message, details = [] }: FeedbackInput): string {
  const body = cleanMessage(message)
  const lines = [`GiftFlowPay ${kindLabel(kind).toLowerCase()}`, '', body]
  const extra = details.map((d) => cleanMessage(d, 200)).filter(Boolean)
  if (extra.length) lines.push('', ...extra.map((d) => `- ${d}`))
  return lines.join('\n')
}

export const telegramFeedbackUrl = (text: string): string => `${TELEGRAM_URL}?text=${encodeURIComponent(text)}`

/** A public post that mentions the account. Short on purpose: no technical details. */
export function xFeedbackUrl(kind: FeedbackKind, message: string): string {
  const head = `@GiftFlowPay ${kindLabel(kind).toLowerCase()}: `
  const body = cleanMessage(message).replace(/\s+/g, ' ')
  const room = X_MAX - head.length
  const text = head + (body.length > room ? `${body.slice(0, room - 1)}…` : body)
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

/** Technical lines a user can opt in to share. Only facts about the app and the browser; no address, no link fragment. */
export function technicalDetails(env: { network: string; userAgent: string; viewport: string }): string[] {
  return [`Network: ${env.network}`, `Screen: ${env.viewport}`, `Browser: ${env.userAgent}`]
}
