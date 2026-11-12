import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Notice, PageHeader } from '@/components/ui'
import { SocialLinks } from '@/components/Socials'
import { buildFeedbackText, cleanMessage, FEEDBACK_KINDS, FEEDBACK_MAX, technicalDetails, telegramFeedbackUrl, xFeedbackUrl, type FeedbackKind } from '@/lib/feedback'
import { ACTIVE } from '@/lib/network'

/**
 * There is no backend, so GiftFlowPay stores no feedback. The user writes it here and sends it from their own Telegram
 * or X account, or copies it. What leaves the page is exactly what the preview shows.
 */
export default function Feedback() {
  const [kind, setKind] = useState<FeedbackKind>('suggestion')
  const [message, setMessage] = useState('')
  const [withDetails, setWithDetails] = useState(false)
  const [copied, setCopied] = useState(false)

  const details = technicalDetails({
    network: ACTIVE.label,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  })
  const text = buildFeedbackText({ kind, message, details: withDetails ? details : [] })
  const ready = cleanMessage(message).length >= 5

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Feedback copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the preview text and copy it by hand.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Feedback" subtitle="Tell us what to build next, or what broke. Suggestions and bug reports both help." />
      <div className="card space-y-5 p-5 sm:p-6">
        <fieldset className="space-y-2">
          <legend className="label mb-2">What is it about?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {FEEDBACK_KINDS.map((k) => (
              <label key={k.id} className="flex cursor-pointer items-center justify-center rounded-xl border p-3 text-sm font-semibold" style={{ borderColor: kind === k.id ? 'var(--green)' : 'var(--border-strong)', background: kind === k.id ? 'var(--green-soft)' : 'transparent' }}>
                <input type="radio" name="kind" className="sr-only" checked={kind === k.id} onChange={() => setKind(k.id)} />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1.5">
          <span className="label">Your message</span>
          <textarea
            className="field min-h-36 resize-y"
            maxLength={FEEDBACK_MAX}
            placeholder={kind === 'issue' ? 'What did you do, what did you expect, and what happened instead? Which page was it on?' : 'What would make GiftFlowPay better for you?'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <span className="block text-right text-xs tabular-nums" style={{ color: 'var(--muted)' }}>{message.length} / {FEEDBACK_MAX}</span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--green)]" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} />
          <span>
            <span className="font-semibold">Include technical details</span>
            <span className="block text-xs" style={{ color: 'var(--muted)' }}>Network, screen size and browser, to help us reproduce a problem. Never your wallet address or claim links.</span>
          </span>
        </label>

        <Notice tone="warn">Never include a seed phrase, private key, password or a full claim link (it contains a secret). We will never ask for them.</Notice>

        {ready ? (
          <div className="space-y-1.5">
            <div className="label">Preview of what you will send</div>
            <pre className="inset max-h-56 overflow-auto whitespace-pre-wrap break-words p-4 text-[13px]" tabIndex={0}>{text}</pre>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <a
            className={`btn btn-primary ${ready ? '' : 'pointer-events-none opacity-45'}`}
            aria-disabled={!ready}
            tabIndex={ready ? 0 : -1}
            href={ready ? telegramFeedbackUrl(text) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              if (ready) void navigator.clipboard?.writeText(text).catch(() => undefined)
            }}
          >
            <Send className="size-4" /> Send on Telegram
          </a>
          <a
            className={`btn btn-secondary ${ready ? '' : 'pointer-events-none opacity-45'}`}
            aria-disabled={!ready}
            tabIndex={ready ? 0 : -1}
            href={ready ? xFeedbackUrl(kind, message) : undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            Post on X <ExternalLink className="size-3.5" />
          </a>
          <button type="button" className="btn btn-secondary" disabled={!ready} onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy text'}
          </button>
        </div>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          GiftFlowPay has no server that receives this form, so nothing is stored by us. These buttons open Telegram or X with your text, and you choose to send it from your own account. A post on X is public and carries only a short version without technical details. If Telegram does not fill in the text, it has also been copied: paste it into the chat.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: 'var(--muted)' }}>
        <span>Need help instead? <Link to="/support" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>Open Support</Link></span>
        <SocialLinks size="sm" />
      </div>
    </div>
  )
}
