import { useState } from 'react'
import { ConnectWalletButton, EmptyState, PageHeader } from '@/components/ui'
import { EventFeed } from '@/components/EventFeed'
import { useWallet } from '@/hooks/useFlow'

export default function Activity() {
  const w = useWallet()
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Activity" subtitle="Confirmed funding, claims, refunds and cancellations, newest first." />
      <div role="tablist" className="flex gap-1">
        {(['mine', 'all'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" className={`btn !min-h-10 ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'mine' ? 'My activity' : 'All activity'}
          </button>
        ))}
      </div>
      {tab === 'mine' && !w.address ? (
        <EmptyState title="Connect to see your activity" body="Campaigns you funded and rewards you received appear here." action={<ConnectWalletButton />} />
      ) : (
        <EventFeed
          key={`${tab}:${w.address ?? ''}`}
          kinds={['created', 'claimed', 'refunded', 'cancelled']}
          who={tab === 'mine' ? w.address : undefined}
          me={w.address}
          enabled={tab === 'all' || Boolean(w.address)}
          emptyBody="Campaign events appear here once they are confirmed onchain."
        />
      )}
    </div>
  )
}
