import { Link } from 'react-router-dom'
import { CheckCircle2, Download } from 'lucide-react'
import { CopyButton, Notice, TxLink } from '@/components/ui'
import { csvEscape, type DistMode } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'

export interface LaunchResult {
  id: bigint
  txHash: string
  isPublic: boolean
  name: string
  total: bigint
  campaignLink: string
  mode: DistMode
  /** Open mode: the single link that lets any holder claim one share. */
  openLink?: string
  rows: Array<{ index: number; label: string; wallet: string; amount: bigint; link: string; code?: string }>
}

function downloadCsv(r: LaunchResult) {
  const lines = ['index,label,wallet,amount_usdc,code,claim_link', ...r.rows.map((x) => [x.index + 1, csvEscape(x.label), x.wallet, fmtUsd(x.amount).replace(/,/g, ''), x.code ?? '', csvEscape(x.link)].join(','))]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `giftflow-campaign-${r.id}-claim-links.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function LaunchDone({ result, onAnother }: { result: LaunchResult; onAnother: () => void }) {
  const linkCount = result.rows.filter((x) => !x.wallet).length
  const each = result.rows.length > 0 ? result.total / BigInt(result.rows.length) : 0n
  const shared = result.mode === 'open' && result.openLink
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-6 shrink-0" style={{ color: 'var(--green)' }} />
        <div>
          <h1 className="display text-2xl">Campaign funded</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            ${fmtUsd(result.total)} USDC for {result.rows.length} recipients is now held by the contract. <TxLink hash={result.txHash} label="Confirmed onchain" />
          </p>
        </div>
      </div>

      {shared ? (
        <>
          <Notice tone="warn">
            Anyone who has this link can claim one share of ${fmtUsd(each)} USDC, until all {result.rows.length} shares are taken. Copy it now: it contains the secret that unlocks the shares. If you lose it, open the campaign&rsquo;s Recipients page and sign with this wallet to get it back.
          </Notice>
          <section className="card space-y-4 p-5">
            <div className="label">Shared claim link</div>
            <div className="inset mono break-all px-3.5 py-3 text-xs">{result.openLink}</div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={result.openLink ?? ''} label="Copy shared link" className="btn btn-primary" />
              <Link to={`/campaigns/${result.id}`} className="btn btn-secondary">Manage campaign</Link>
              <Link to={`/verify/${result.id}`} className="btn btn-ghost">Public verification page</Link>
            </div>
          </section>
        </>
      ) : (
        <>
          {!result.isPublic || linkCount > 0 ? (
            <Notice tone="warn">
              {result.mode === 'codes'
                ? 'Each code unlocks one share. '
                : result.isPublic
                  ? 'Claim links for link-based recipients contain a private key. '
                  : 'This is a private campaign: the recipient list is not published, so each claim link carries its own proof. '}
              Download the file now and send each person only their own {result.mode === 'codes' ? 'code or link' : 'link'}. You can rebuild it later from the campaign&rsquo;s Recipients page.
            </Notice>
          ) : null}

          <section className="card space-y-4 p-5">
            <div className="label">Campaign claim page</div>
            <div className="inset mono break-all px-3.5 py-3 text-xs">{result.campaignLink}</div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {result.mode === 'codes'
                ? 'Everyone opens this page and types their own code. Wallet connect comes next.'
                : result.isPublic
                  ? 'Recipients with a listed wallet can open this link, connect that wallet and claim.'
                  : 'Private campaigns need each recipient’s own link from the file below.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {result.isPublic ? <CopyButton value={result.campaignLink} label="Copy campaign link" className="btn btn-primary" /> : null}
              <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(result)}>
                <Download className="size-4" /> {result.mode === 'codes' ? 'Download code sheet (CSV)' : 'Download claim links (CSV)'}
              </button>
              <Link to={`/campaigns/${result.id}`} className="btn btn-secondary">Manage campaign</Link>
              <Link to={`/verify/${result.id}`} className="btn btn-ghost">Public verification page</Link>
            </div>
          </section>
        </>
      )}

      <button type="button" className="btn btn-ghost" onClick={onAnother}>Create another campaign</button>
    </div>
  )
}
