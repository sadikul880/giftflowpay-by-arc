import { Link } from 'react-router-dom'
import { ACTIVE } from '@/lib/network'
import { shortAddr } from '@/lib/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { PageHeader } from '@/components/ui'

const HOW = [
  { title: 'Create', body: 'Name the campaign, set when claims open and close, and choose how people get paid: a list of wallets, one shared link, or a secret code for each person.' },
  { title: 'Fund', body: 'Deposit the full USDC total in a single transaction. The contract records every allocation and holds the money. Nobody, including GiftFlowPay, can spend it other than by a valid claim or a refund to you.' },
  { title: 'Distribute', body: 'Recipients connect a wallet and claim, or you send directly to listed wallets. Each allocation can be claimed once.' },
  { title: 'Refund', body: 'After the deadline, whatever was not claimed goes back to the wallet that funded the campaign.' },
]

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title="About GiftFlowPay" subtitle="The programmable distribution layer for USDC on Arc. Create once. Fund once. Distribute by rules." />

      <section className="space-y-3 text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        <p>
          GiftFlowPay helps projects, DAOs, hackathon organizers and teams pay many people at once with USDC: reward campaigns, bounties, grants, airdrops and salaries. You fund a campaign once and the smart contract enforces who can claim what, and when.
        </p>
        <p>
          It is non-custodial. There is no GiftFlowPay account, no database and no server that holds your money or your keys. Everything that matters lives in a smart contract on {ACTIVE.label}, and anyone can check it on the public verification page of every campaign.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {HOW.map((s, i) => (
            <li key={s.title} className="card p-4">
              <div className="label">Step {i + 1}</div>
              <div className="mt-1 font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ways to pay people</h2>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--ink-2)' }}>
          <li><strong>Wallet list.</strong> You know each wallet, for example monthly salaries. Everyone opens the same page, connects their wallet and claims, or you send to all wallets in a few transactions.</li>
          <li><strong>One shared link.</strong> Equal shares, for example 100 people at 5 USDC each. Anyone with the link claims one share until none are left.</li>
          <li><strong>Secret codes.</strong> Equal shares with one personal code per person. Each code works once, so each person gets exactly one share.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Things to know</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: 'var(--ink-2)' }}>
          <li>This is a testnet product. {ACTIVE.label} USDC has no real value, and the contract has not been independently audited.</li>
          <li>Campaign names, descriptions and messages, and the recipient list of public campaigns, are public onchain data.</li>
          <li>Anyone who holds a claim link or code can use it. Treat them like cash.</li>
          <li>Arc uses USDC for network fees, so a claiming wallet needs a small USDC balance to pay the fee.</li>
        </ul>
      </section>

      <section className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
        {ACTIVE.contract ? (
          <p>
            Contract on {ACTIVE.label}:{' '}
            <a className="mono underline underline-offset-2" href={buildAddressExplorerUrl(ACTIVE.chainId, ACTIVE.contract)} target="_blank" rel="noopener noreferrer">
              {shortAddr(ACTIVE.contract)}
            </a>
          </p>
        ) : null}
        <p>
          Read the <Link to="/privacy" className="font-semibold underline underline-offset-2">privacy notice</Link> or start with a <Link to="/campaigns/new" className="font-semibold underline underline-offset-2">new campaign</Link>.
        </p>
      </section>
    </div>
  )
}
