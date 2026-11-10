import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { CampaignRow } from '@/components/CampaignRow'
import { ConnectWalletButton, EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { useCampaignMeta, useCampaignPages, useNow, useWallet } from '@/hooks/useFlow'
import type { Campaign } from '@/lib/chain'

/** A campaign row that shows itself only once its public metadata says it is a gift card. */
function GiftItem({ id, campaign, now }: { id: bigint; campaign: Campaign; now: number }) {
  const meta = useCampaignMeta(id, campaign.createdAt)
  if (meta.data?.t !== 'gift') return null
  return <CampaignRow id={id} campaign={campaign} now={now} />
}

export default function Gifts() {
  const w = useWallet()
  const now = useNow()
  const me = w.address?.toLowerCase()
  const mine = useCampaignPages(`mine:${me}`, (c) => c.creator.toLowerCase() === me, Boolean(me))
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = mine
  const rows = useMemo(() => mine.data?.pages.flatMap((p) => p.rows) ?? [], [mine.data])

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Gift cards"
        subtitle="The gifts you have sent. Open one to refund it after it expires, or to get its link, QR code and card image again."
        actions={<Link to="/gifts/new" className="btn btn-primary"><Plus className="size-4" /> Create gift card</Link>}
      />
      {!w.isConnected ? (
        <EmptyState title="Connect your wallet" body="Connect the wallet you sent gifts from to see them here." action={<ConnectWalletButton />} />
      ) : !mine.isSuccess ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No gifts yet" body="Create a gift card to send USDC as a link, a QR code or a card image." action={<Link to="/gifts/new" className="btn btn-primary">Create gift card</Link>} />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">{rows.map((r) => <GiftItem key={r.id.toString()} id={r.id} campaign={r.campaign} now={now} />)}</ul>
          {hasNextPage ? (
            <button type="button" className="btn btn-secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>Look further back</button>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Only gift cards are shown; other campaigns are under Campaigns.</p>
          )}
        </div>
      )}
    </div>
  )
}
