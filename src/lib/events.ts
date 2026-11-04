import { createPublicClient, decodeEventLog, getAbiItem, pad, toEventSelector, toHex, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { flowAbi } from './abi'
import { contractAddress, EVENT_WINDOW_BLOCKS } from './network'
import { arcTransport } from './transport'

/** Read-only client for reads, event scans and block lookups. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: arcTransport(),
  batch: { multicall: true },
})

export type EventKind = 'created' | 'published' | 'claimed' | 'refunded' | 'cancelled'

const NAMES: Record<EventKind, string> = {
  created: 'CampaignCreated',
  published: 'RecipientsPublished',
  claimed: 'Claimed',
  refunded: 'Refunded',
  cancelled: 'CampaignCancelled',
}
const selectors = Object.fromEntries(
  (Object.keys(NAMES) as EventKind[]).map((k) => [k, toEventSelector(getAbiItem({ abi: flowAbi, name: NAMES[k] as 'Claimed' }))]),
) as Record<EventKind, Hex>
const kindBySelector = new Map(Object.entries(selectors).map(([k, v]) => [v.toLowerCase(), k as EventKind]))

export interface FlowEvent {
  kind: EventKind
  campaignId: bigint
  blockNumber: bigint
  logIndex: number
  txHash: Hex
  timestamp?: number
  /** USDC amount: total for created, payout for claimed, returned amount for refunded/cancelled. */
  amount: bigint
  creator?: Address
  recipient?: Address
  account?: Address
  index?: number
  direct?: boolean
  merkleRoot?: Hex
  recipientCount?: number
  startTime?: bigint
  claimDeadline?: bigint
  isPublic?: boolean
  salt?: Hex
  metadata?: string
  data?: Hex
}

interface RpcLog {
  data: Hex
  topics: Hex[]
  blockNumber: Hex | null
  logIndex: Hex | null
  transactionHash: Hex | null
}

function toFlowEvent(log: RpcLog): FlowEvent | undefined {
  if (!log.blockNumber || !log.logIndex || !log.transactionHash) return undefined
  const kind = kindBySelector.get(log.topics[0].toLowerCase())
  if (!kind) return undefined
  const decoded = decodeEventLog({ abi: flowAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
  const a = (decoded.args ?? {}) as Record<string, unknown>
  const base = {
    kind,
    campaignId: a.campaignId as bigint,
    blockNumber: BigInt(log.blockNumber),
    logIndex: Number(BigInt(log.logIndex)),
    txHash: log.transactionHash,
  }
  switch (kind) {
    case 'created':
      return {
        ...base,
        amount: a.totalAllocation as bigint,
        creator: a.creator as Address,
        merkleRoot: a.merkleRoot as Hex,
        recipientCount: Number(a.recipientCount),
        startTime: a.startTime as bigint,
        claimDeadline: a.claimDeadline as bigint,
        isPublic: a.isPublic as boolean,
        salt: a.salt as Hex,
        metadata: a.metadata as string,
      }
    case 'published':
      return { ...base, amount: 0n, data: a.data as Hex }
    case 'claimed':
      return {
        ...base,
        amount: a.amount as bigint,
        recipient: a.recipient as Address,
        account: a.account as Address,
        index: Number(a.index),
        direct: a.direct as boolean,
      }
    default:
      return { ...base, amount: a.amount as bigint, creator: a.creator as Address }
  }
}

export interface LogQuery {
  from: bigint
  to: bigint
  kinds: EventKind[]
  campaignId?: bigint
  /** Wallet in the second indexed slot: creator for created/refunded/cancelled, recipient for claimed. */
  who?: Address
}

export function sortEvents(events: FlowEvent[]): FlowEvent[] {
  return [...events].sort((x, y) =>
    x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber < y.blockNumber ? 1 : -1,
  )
}

const eventKey = (e: FlowEvent) => `${e.txHash}:${e.logIndex}`
export function mergeEvents(existing: FlowEvent[], incoming: FlowEvent[]): FlowEvent[] {
  const map = new Map(existing.map((e) => [eventKey(e), e]))
  for (const e of incoming) map.set(eventKey(e), e)
  return sortEvents([...map.values()])
}

export async function queryLogs(q: LogQuery): Promise<FlowEvent[]> {
  const topics: Array<Hex | Hex[] | null> = [q.kinds.map((k) => selectors[k])]
  if (q.campaignId !== undefined || q.who) topics.push(q.campaignId !== undefined ? pad(toHex(q.campaignId), { size: 32 }) : null)
  if (q.who) topics.push(pad(q.who, { size: 32 }))
  const logs = (await publicClient.request({
    method: 'eth_getLogs',
    params: [{ address: contractAddress(), fromBlock: toHex(q.from), toBlock: toHex(q.to), topics: topics as never }],
  })) as unknown as RpcLog[]
  return sortEvents(logs.map(toFlowEvent).filter((e): e is FlowEvent => e !== undefined))
}

const blockTime = new Map<bigint, number>()
export async function attachTimestamps(events: FlowEvent[]): Promise<FlowEvent[]> {
  const need = [...new Set(events.map((e) => e.blockNumber))].filter((n) => !blockTime.has(n))
  await Promise.all(
    need.map(async (n) => {
      try {
        blockTime.set(n, Number((await publicClient.getBlock({ blockNumber: n })).timestamp))
      } catch {
        /* timestamp stays unknown */
      }
    }),
  )
  return events.map((e) => ({ ...e, timestamp: blockTime.get(e.blockNumber) }))
}

/* ---------- Locating one campaign's setup events without scanning history ---------- */

let clock: { at: number; latest: bigint; ts: bigint; perBlock: number } | undefined
async function chainClock(floor: bigint) {
  if (clock && Date.now() - clock.at < 60000) return clock
  const latest = await publicClient.getBlock()
  const span = latest.number - floor
  const sample = span < 50000n ? span : 50000n
  let perBlock = 1
  if (sample > 0n) {
    const old = await publicClient.getBlock({ blockNumber: latest.number - sample })
    const secs = Number(latest.timestamp - old.timestamp)
    if (secs > 0) perBlock = secs / Number(sample)
  }
  clock = { at: Date.now(), latest: latest.number, ts: latest.timestamp, perBlock }
  return clock
}

export interface CampaignSetup {
  created: FlowEvent
  published?: FlowEvent
}

const setups = new Map<string, Promise<CampaignSetup | undefined>>()

/**
 * Find the creation event (and published recipient list) by estimating the block from createdAt.
 * A campaign's setup events never change, so each lookup is done once per page load.
 */
export function findSetup(campaignId: bigint, createdAt: bigint, deployBlock: bigint): Promise<CampaignSetup | undefined> {
  const key = campaignId.toString()
  let hit = setups.get(key)
  if (!hit) {
    hit = searchSetup(campaignId, createdAt, deployBlock).then((found) => {
      if (!found) setups.delete(key)
      return found
    }, (e: unknown) => {
      setups.delete(key)
      throw e
    })
    setups.set(key, hit)
  }
  return hit
}

async function searchSetup(campaignId: bigint, createdAt: bigint, deployBlock: bigint): Promise<CampaignSetup | undefined> {
  const c = await chainClock(deployBlock)
  const back = BigInt(Math.max(0, Math.round(Number(c.ts - createdAt) / c.perBlock)))
  const estimate = c.latest > back ? c.latest - back : deployBlock
  const half = EVENT_WINDOW_BLOCKS / 2n
  for (let step = 0; step < 16; step++) {
    const k = BigInt(Math.ceil(step / 2)) * (step % 2 === 1 ? 1n : -1n)
    const center = estimate + k * EVENT_WINDOW_BLOCKS
    const from = center - half < deployBlock ? deployBlock : center - half
    const to = center + half > c.latest ? c.latest : center + half
    if (from > to) continue
    const found = await queryLogs({ from, to, kinds: ['created', 'published'], campaignId })
    const created = found.find((e) => e.kind === 'created')
    if (created) return { created, published: found.find((e) => e.kind === 'published') }
    if (from === deployBlock && to === c.latest) break
  }
  return undefined
}
