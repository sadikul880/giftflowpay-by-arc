import { describe, expect, test } from 'bun:test'
import { buildFeedbackText, cleanMessage, FEEDBACK_MAX, technicalDetails, telegramFeedbackUrl, xFeedbackUrl } from './feedback'

describe('feedback message', () => {
  test('cleans control characters and caps the length', () => {
    expect(cleanMessage('  hi\u0000 there\r\nnext  ')).toBe('hi there\nnext')
    expect(cleanMessage('a'.repeat(FEEDBACK_MAX + 50)).length).toBe(FEEDBACK_MAX)
  })

  test('builds a labelled text with optional details', () => {
    expect(buildFeedbackText({ kind: 'issue', message: 'Swap button stays grey' })).toBe('GiftFlowPay report an issue\n\nSwap button stays grey')
    const t = buildFeedbackText({ kind: 'suggestion', message: 'Dark mode', details: ['Network: Arc Testnet', ''] })
    expect(t).toBe('GiftFlowPay suggestion\n\nDark mode\n\n- Network: Arc Testnet')
  })

  test('the Telegram link goes to the official account and encodes the text', () => {
    const u = telegramFeedbackUrl('a b&c#d')
    expect(u.startsWith('https://t.me/GiftFlowPay?text=')).toBe(true)
    expect(u).not.toContain('#d')
    expect(decodeURIComponent(u.split('?text=')[1] ?? '')).toBe('a b&c#d')
  })

  test('the X post mentions the account and stays within 280 characters', () => {
    const u = new URL(xFeedbackUrl('issue', 'x'.repeat(900)))
    expect(u.origin + u.pathname).toBe('https://x.com/intent/post')
    const text = u.searchParams.get('text') ?? ''
    expect(text.startsWith('@GiftFlowPay report an issue: ')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(280)
    expect(text.endsWith('…')).toBe(true)
  })

  test('technical details carry no wallet address or link fragment', () => {
    const d = technicalDetails({ network: 'Arc Testnet', userAgent: 'UA', viewport: '375x812' })
    expect(d).toEqual(['Network: Arc Testnet', 'Screen: 375x812', 'Browser: UA'])
  })
})
