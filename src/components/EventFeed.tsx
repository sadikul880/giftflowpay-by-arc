import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useEventScanner, type ScanOptions } from '@/hooks/useEventScanner'
import { EmptyState, Notice, Skeleton, Spinner } from './ui'
import { EventList } from './CampaignParts'

const PAGE_SIZE = 10

interface Props extends ScanOptions {
  me?: string
  showCampaign?: boolean
  emptyTitle?: string
  emptyBody?: string
}

/** Paginated, newest-first event history read straight from the contract's logs. */
export function EventFeed({ me, showCampaign = true, emptyTitle = 'No activity yet', emptyBody = 'Confirmed campaign events appear here.', ...scanOptions }: Props) {
  const scan = useEventScanner({ ...scanOptions, auto: false })
  const [shown, setShown] = useState(PAGE_SIZE)

  // Keep paging backward until the visible page is full or history is exhausted.
  const needMore = scan.events.length < shown && !scan.done && !scan.loading && !scan.error && scan.head > 0n
  const { loadMore } = scan
  useEffect(() => {
    if (needMore) void loadMore()
  }, [needMore, loadMore])

  const visible = scan.events.slice(0, shown)
  const hasMore = scan.events.length > shown || !scan.done

  return (
    <div className="space-y-4">
      {scan.error ? <Notice tone="error">Could not read contract events: {scan.error}</Notice> : null}
      {visible.length === 0 && !scan.done && !scan.error ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full !rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <EventList events={visible} me={me} showCampaign={showCampaign} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {scan.done ? 'Reached the start of this history.' : `${scan.blocksRemaining.toLocaleString()} blocks of older history not scanned yet.`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => void scan.refresh()} disabled={scan.loading}>
            <RefreshCw className={`size-4 ${scan.loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {hasMore ? (
            <button type="button" className="btn btn-secondary" disabled={scan.loading} onClick={() => setShown((n) => n + PAGE_SIZE)}>
              {scan.loading ? <Spinner /> : null} Load older
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
