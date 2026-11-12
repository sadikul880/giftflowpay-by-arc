/** Official GiftFlowPay channels. One list, so the footers, the Support page and the Feedback page always agree. */
export const SOCIALS = [
  {
    id: 'x',
    name: 'X',
    href: 'https://x.com/GiftFlowPay',
    label: 'GiftFlowPay on X',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    href: 'https://t.me/GiftFlowPay',
    label: 'GiftFlowPay on Telegram',
    path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
] as const

export const TELEGRAM_URL = SOCIALS[1].href
export const X_URL = SOCIALS[0].href

/** Round icon links to X and Telegram. They open in a new tab. */
export function SocialLinks({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'size-8' : 'size-10'
  const icon = size === 'sm' ? 'size-4' : 'size-[18px]'
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Social links">
      {SOCIALS.map((so) => (
        <a
          key={so.id}
          href={so.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={so.label}
          title={so.label}
          className={`inline-flex ${box} items-center justify-center rounded-full border transition-all hover:-translate-y-0.5 hover:border-[var(--green)] hover:text-[var(--green)] hover:shadow-[0_0_18px_rgba(52,240,138,0.35)]`}
          style={{ borderColor: 'var(--border-strong)', color: 'var(--ink-2)' }}
        >
          <svg viewBox="0 0 24 24" className={icon} fill="currentColor" aria-hidden="true"><path d={so.path} /></svg>
        </a>
      ))}
    </div>
  )
}
