import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { readDeployBlock } from '@/lib/chain'
import { attachTimestamps, mergeEvents, publicClient, queryLogs, type EventKind, type FlowEvent } from '@/lib/events'
import { EVENT_WINDOW_BLOCKS } from '@/lib/network'

const WINDOWS_PER_PAGE = 6
const CONCURRENCY = 3

interface ScanState {
  events: FlowEvent[]
  loading: boolean
  done: boolean
  error?: string
  head: bigint
  floor: bigint
  cursor: bigint
}

const empty: ScanState = { events: [], loading: false, done: false, head: 0n, floor: 0n, cursor: 0n }

export interface ScanOptions {
  kinds: EventKind[]
  who?: Address
  campaignId?: bigint
  /** Lowest block to scan. Defaults to the contract's deployment block. */
  floor?: bigint
  enabled?: boolean
  /** Keep paging until the floor is reached. */
  auto?: boolean
}

/**
 * Pages backward through contract events, newest first, in windows the RPC accepts.
 * It never starts before the floor, so history is bounded by the deployment (or campaign creation) block.
 */
export function useEventScanner({ kinds, who, campaignId, floor: floorOverride, enabled = true, auto = false }: ScanOptions) {
  const [state, setState] = useState<ScanState>(empty)
  const run = useRef(0)
  const busy = useRef(false)
  const cursorRef = useRef<{ cursor: bigint; floor: bigint }>({ cursor: 0n, floor: 0n })
  const kindsKey = kinds.join(',')

  const loadPage = useCallback(async () => {
    if (busy.current) return
    const { cursor, floor } = cursorRef.current
    if (cursor < floor) return
    busy.current = true
    const id = run.current
    setState((s) => ({ ...s, loading: true, error: undefined }))
    try {
      const windows: Array<[bigint, bigint]> = []
      let to = cursor
      for (let i = 0; i < WINDOWS_PER_PAGE && to >= floor; i++) {
        const from = to - EVENT_WINDOW_BLOCKS + 1n > floor ? to - EVENT_WINDOW_BLOCKS + 1n : floor
        windows.push([from, to])
        to = from - 1n
      }
      const found: FlowEvent[] = []
      for (let i = 0; i < windows.length; i += CONCURRENCY) {
        const results = await Promise.all(
          windows.slice(i, i + CONCURRENCY).map(([from, end]) => queryLogs({ from, to: end, kinds: kindsKey.split(',') as EventKind[], who, campaignId })),
        )
        results.forEach((r) => found.push(...r))
      }
      const stamped = await attachTimestamps(found)
      if (id !== run.current) return
      cursorRef.current = { cursor: to, floor }
      setState((s) => ({ ...s, events: mergeEvents(s.events, stamped), cursor: to, done: to < floor, loading: false }))
    } catch (e) {
      if (id !== run.current) return
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Could not read events' }))
    } finally {
      busy.current = false
    }
  }, [kindsKey, who, campaignId])

  const reset = useCallback(async () => {
    run.current += 1
    busy.current = false
    try {
      const [head, deployed] = await Promise.all([publicClient.getBlockNumber(), readDeployBlock()])
      const floor = floorOverride !== undefined && floorOverride > deployed ? floorOverride : deployed
      cursorRef.current = { cursor: head, floor }
      setState({ ...empty, head, floor, cursor: head })
      void loadPage()
    } catch (e) {
      setState({ ...empty, error: e instanceof Error ? e.message : 'Could not reach the network' })
    }
  }, [loadPage, floorOverride])

  useEffect(() => {
    if (!enabled) return
    void Promise.resolve().then(reset)
  }, [reset, enabled])

  useEffect(() => {
    if (auto && enabled && !state.loading && !state.done && !state.error && state.head > 0n) void loadPage()
  }, [auto, enabled, state.loading, state.done, state.error, state.head, loadPage])

  const total = state.head - state.floor + 1n
  const scanned = state.head - state.cursor
  const progress = state.done ? 100 : total > 0n ? Math.min(99, Number((scanned * 100n) / total)) : 0
  const blocksRemaining = state.done ? 0n : state.cursor - state.floor + 1n

  return { ...state, progress, blocksRemaining, loadMore: loadPage, refresh: reset }
}
