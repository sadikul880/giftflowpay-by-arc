import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/ui'

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: 'What GiftFlowPay does not collect',
    body: [
      'GiftFlowPay has no accounts. Campaigns, balances, claims and refunds live on the blockchain, not on our server. We do not ask for your name, email or phone number, we do not use cookies for tracking, and we run no analytics or advertising scripts. The one thing we do store is Support, described below.',
      'We never see or store your private keys or seed phrase. Your wallet signs transactions and messages; the app only receives the result.',
    ],
  },
  {
    title: 'What is public onchain',
    body: [
      'Everything you send to the blockchain is public and permanent: your wallet address, campaign amounts, claim and refund transactions, and the campaign name, description and message you enter. For public campaigns the recipient wallet addresses and amounts are public too.',
      'Do not put private information in campaign names, descriptions or messages. It cannot be deleted afterwards.',
    ],
  },
  {
    title: 'Claim links and secret codes',
    body: [
      'Secrets in claim links and codes sit after the # sign of the link. Browsers do not send that part to any server, so it is not logged by our host or by the network. Anyone who has the full link can use it, so share it only with the intended person.',
      'Names you type next to recipients or codes stay in your browser. They are not sent to the contract or to us.',
    ],
  },
  {
    title: 'Support messages',
    body: [
      'If you write to us on the Support page, we store on our server: your wallet address, the messages you and our team write, the time of each, and the times you signed in. Nothing else about you is collected.',
      'To open Support you sign a free message with your wallet. That proves the wallet is yours; it sends no transaction and gives us no access to your funds. The sign-in gives your browser tab a temporary session token (kept in sessionStorage, valid for 12 hours); the server keeps only a hash of it.',
      'Your messages can be read by the GiftFlowPay team through the admin panel, which only the administrator wallet can open. Nobody else can read them. Please do not write secrets: never send a seed phrase, a private key or a full claim link. Conversations are kept until the administrator removes them.',
    ],
  },
  {
    title: 'Data stored in your browser',
    body: [
      'Interface preferences are saved in your browser (default visibility, default claim window and table density). While you are signed in to Support, a temporary session token is kept for that browser tab only. Campaign drafts live in memory and disappear when you reload the page.',
    ],
  },
  {
    title: 'Third parties that see technical data',
    body: [
      'To read the blockchain, your browser talks directly to public Arc RPC providers. They can see your IP address and which contract data you request, as with any blockchain app. Looking up names (ENS) uses a public Ethereum RPC provider in the same way.',
      'The page loads its fonts from Google Fonts, which sees your IP address when the page loads.',
      'The Transactions page asks the Arc block explorer\u2019s public index for the history of the wallet you connected, so the explorer sees that wallet address and your IP address, as it would for anyone browsing the explorer. Nothing is requested until you open that page.',
      'If you use Swap, your browser also contacts Circle\u2019s App Kit services and, for swaps, a third-party DEX aggregator (currently LiFi) to get quotes and route the trade. They see your wallet address, the tokens and the amounts involved, as in any swap. Nothing is sent unless you open those pages and ask for a quote.',
      'Your wallet extension and the website host (for example your hosting provider) keep their own technical logs under their own policies.',
    ],
  },
  {
    title: 'Your choices',
    body: [
      'You can disconnect your wallet at any time and clear browser data to remove the saved preferences. Onchain data cannot be removed by us or by you.',
    ],
  },
]

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Privacy" subtitle="GiftFlowPay is built to need as little data as possible. This is what is and is not collected." />
      {SECTIONS.map((s) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          {s.body.map((p) => (
            <p key={p} className="text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{p}</p>
          ))}
        </section>
      ))}
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        This notice describes the app as built. If it changes, this page changes with it. Back to <Link to="/about" className="font-semibold underline underline-offset-2">About</Link>.
      </p>
    </div>
  )
}
