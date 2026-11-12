import { Link } from 'react-router-dom'
import { ExternalLink, MessageSquareText } from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { SOCIALS } from '@/components/Socials'
import { ACTIVE } from '@/lib/network'
import { buildAddressExplorerUrl } from '@/onchain-facts'

const HELP: Array<{ q: string; a: string }> = [
  {
    q: 'My claim link does not work',
    a: 'Open the full link exactly as it was sent, including everything after the # sign: the claim secret lives there and a shortened or edited link loses it. Check on the Verify page that the campaign has started and has not expired, and that your wallet is on Arc Testnet. If the link was for one specific wallet, connect that wallet.',
  },
  {
    q: 'My transaction is pending or failed',
    a: 'Arc fees are paid in USDC, so keep a little USDC in the wallet for gas. A pending request needs your confirmation in the wallet window. You can look up any transaction on the Transactions page or in the block explorer before trying again, so you do not pay twice.',
  },
  {
    q: 'My wallet shows the wrong network',
    a: `GiftFlowPay runs on ${ACTIVE.label}. Use the Switch button in the yellow bar at the top of the page, or add the network in your wallet and reload.`,
  },
  {
    q: 'Swap says there is no route',
    a: 'Swap quotes come live from Circle App Kit and a third-party aggregator. Testnet liquidity is thin, so a pair or size can have no route at a given moment. Try a smaller amount, a different pair (USDC, EURC or cirBTC) or try again later. Asking for a quote costs nothing.',
  },
  {
    q: 'My bridge stopped halfway',
    a: 'Funds are not lost: the burn and the mint are separate steps. Reopen Bridge, and if the progress shows a failed step use Continue from the failed step. Check the transaction hashes in the explorer before starting a new bridge, so you do not bridge twice.',
  },
  {
    q: 'I lost a gift card link or QR',
    a: 'Open Gift cards from the wallet that created it. A funded gift card can show its link, QR and code again after you sign a message in your wallet. An unclaimed, expired card can be refunded from the same page.',
  },
]

/** Where to get help: official channels, the self-service tools, and answers to the common problems. */
export default function Support() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Support" subtitle="Get help with GiftFlowPay. Most problems have a quick answer below; for anything else, message us on Telegram or X." />

      <section className="card space-y-4 p-5 sm:p-6" aria-labelledby="contact">
        <h2 id="contact" className="text-lg font-semibold">Contact us</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map((so) => (
            <a key={so.id} href={so.href} target="_blank" rel="noopener noreferrer" className="inset flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:border-[var(--green)]">
              <span className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true" style={{ color: 'var(--green)' }}><path d={so.path} /></svg>
                <span>
                  <span className="block text-sm font-semibold">{so.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--muted)' }}>{so.href.replace('https://', '')}</span>
                </span>
              </span>
              <ExternalLink className="size-4" style={{ color: 'var(--muted)' }} />
            </a>
          ))}
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          We will never ask for your seed phrase or private key, and we cannot move, recover or reverse anyone&rsquo;s funds. Ignore anyone who messages you first offering help.
        </p>
        <Link to="/feedback" className="btn btn-secondary w-full sm:w-auto"><MessageSquareText className="size-4" /> Send feedback or report an issue</Link>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="faq">
        <h2 id="faq" className="text-lg font-semibold">Common problems</h2>
        <div className="space-y-2">
          {HELP.map((h) => (
            <details key={h.q} className="card group p-4 sm:p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                {h.q}
                <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-45" style={{ color: 'var(--green)' }}>+</span>
              </summary>
              <p className="mt-3 text-sm" style={{ color: 'var(--ink-2)' }}>{h.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="card mt-8 space-y-3 p-5 sm:p-6" aria-labelledby="tools">
        <h2 id="tools" className="text-lg font-semibold">Check it yourself</h2>
        <ul className="space-y-2 text-sm">
          <li><Link to="/verify" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>Verify a campaign</Link> <span style={{ color: 'var(--muted)' }}>: funding, claims and status, no wallet needed.</span></li>
          <li><Link to="/transactions" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>Transactions</Link> <span style={{ color: 'var(--muted)' }}>: your wallet&rsquo;s history from the block explorer.</span></li>
          {ACTIVE.contract ? (
            <li><a href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>The GiftFlowPay contract</a> <span style={{ color: 'var(--muted)' }}>: every campaign and claim is public onchain.</span></li>
          ) : null}
          <li><Link to="/privacy" className="font-medium underline underline-offset-2" style={{ color: 'var(--green)' }}>Privacy</Link> <span style={{ color: 'var(--muted)' }}>: what the app does and does not collect.</span></li>
        </ul>
      </section>
    </div>
  )
}
