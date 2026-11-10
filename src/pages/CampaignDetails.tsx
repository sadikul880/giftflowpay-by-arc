import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Users } from 'lucide-react'
import { CampaignSummary } from '@/components/CampaignParts'
import { EventFeed } from '@/components/EventFeed'
import { GiftRecover } from '@/components/GiftRecover'
import { OrganizerActions } from '@/components/OrganizerActions'
import { CopyButton, EmptyState, Skeleton, TxLink } from '@/components/ui'
import { useCampaign, useNow, useWallet } from '@/hooks/useFlow'
import { buildShareLinkSafe } from '@/lib/links'
import { useEffect, useState } from 'react'

export default function CampaignDetails() {
  const { id } = useParams()
  if (!id || !/^\d+$/.test(id)) return <EmptyState title="Campaign not found" body="This campaign number is not valid." action={<Link to="/campaigns" className="btn btn-secondary">All campaigns</Link>} />
  return <Details id={BigInt(id)} />
}

function Details({ id }: { id: bigint }) {
  const w = useWallet()
  const now = useNow()
  const q = useCampaign(id)
  const [claimUrl, setClaimUrl] = useState('')
  useEffect(() => {
    void buildShareLinkSafe(`/claim/${id}`).then(setClaimUrl)
  }, [id])

  if (q.isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full !rounded-2xl" /></div>
  if (q.isError || !q.data) return <EmptyState title="Campaign not found" body="No campaign with this number exists on the current network." action={<Link to="/campaigns" className="btn btn-secondary">All campaigns</Link>} />

  const view = q.data
  const c = view.campaign
  const isOwner = w.address?.toLowerCase() === c.creator.toLowerCase()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to={view.meta?.g ? '/gifts' : '/campaigns'} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> {view.meta?.g ? 'Gift cards' : 'Campaigns'}
      </Link>

      <div className="flex flex-wrap gap-2">
        {view.meta?.g ? null : <Link to={`/campaigns/${id}/recipients`} className="btn btn-secondary"><Users className="size-4" /> Recipients</Link>}
        <Link to={`/verify/${id}`} className="btn btn-secondary"><ExternalLink className="size-4" /> Public verification page</Link>
        {c.isPublic ? <CopyButton value={claimUrl} label="Copy claim page link" disabled={!claimUrl} /> : null}
      </div>

      <CampaignSummary view={view} now={now} />
      {isOwner ? <OrganizerActions view={view} now={now} onChanged={() => void q.refetch()} /> : null}
      {isOwner && view.meta?.g ? <GiftRecover view={view} /> : null}

      {view.setup ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Funded in <TxLink hash={view.setup.created.txHash} label="the creation transaction" />.
          {!c.isPublic ? ' Recipients receive personal claim links, so there is no shared claim page.' : ''}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Transaction history</h2>
        <EventFeed
          kinds={['created', 'claimed', 'refunded', 'cancelled']}
          campaignId={id}
          floor={view.setup?.created.blockNumber}
          enabled={Boolean(view.setup)}
          me={w.address}
          showCampaign={false}
          emptyTitle="No transactions yet"
          emptyBody="Funding, claims and refunds appear here once confirmed."
        />
      </section>
    </div>
  )
}
