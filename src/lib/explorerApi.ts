import { toFunctionSelector, type Address } from 'viem'
import { erc20Abi } from 'viem'
import { flowAbi } from './abi'
import { ACTIVE } from './network'

/**
 * Wallet history from the Arc block explorer's public API (Blockscout v2). It is a read-only index of public chain
 * data, used because the RPC cannot list a wallet's transactions. Nothing here is authoritative: every row links to
 * the transaction on the explorer, and campaign state always comes from the contract itself.
 */
const apiBase = () => `${ACTIVE.explorerBase}/api/v2`

export interface ApiTx {
  hash: string
  timestamp: number
  block: number
  ok: boolean
  /** Blockscout's decoded method name, or the 4-byte selector when it could not decode it. */
  method?: string
  /** First four bytes of the call data, lower case. */
  selector?: string
  from: string
  to?: string
  value: bigint
  fee: bigint
  created: boolean
}

export interface ApiTransfer {
  txHash: string
  logIndex: number
  timestamp: number
  from: string
  to: string
  token: { address: string; symbol: string; decimals: number }
  value: bigint
}

export interface Page<T> {
  items: T[]
  /** Pass back to fetch the next page. */
  next?: Record<string, string>
}

const rec = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const big = (v: unknown): bigint => {
  try {
    return typeof v === 'string' || typeof v === 'number' ? BigInt(v) : 0n
  } catch {
    return 0n
  }
}
const time = (v: unknown): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000)
}

export function parseTx(raw: unknown): ApiTx | undefined {
  const r = rec(raw)
  const hash = str(r?.hash)
  const from = str(rec(r?.from)?.hash)
  if (!r || !hash || !from) return undefined
  const input = str(r.raw_input)
  return {
    hash,
    timestamp: time(r.timestamp),
    block: typeof r.block_number === 'number' ? r.block_number : 0,
    ok: r.status === 'ok',
    method: str(r.method),
    selector: input && /^0x[0-9a-fA-F]{8}/.test(input) ? input.slice(0, 10).toLowerCase() : undefined,
    from,
    to: str(rec(r.to)?.hash),
    value: big(r.value),
    fee: big(rec(r.fee)?.value),
    created: rec(r.created_contract) !== undefined && r.created_contract !== null,
  }
}

export function parseTransfer(raw: unknown): ApiTransfer | undefined {
  const r = rec(raw)
  const token = rec(r?.token)
  const total = rec(r?.total)
  const txHash = str(r?.transaction_hash) ?? str(r?.tx_hash)
  const from = str(rec(r?.from)?.hash)
  const to = str(rec(r?.to)?.hash)
  const address = str(token?.address_hash) ?? str(token?.address)
  if (!r || !token || !total || !txHash || !from || !to || !address) return undefined
  const decimals = Number(str(total.decimals) ?? str(token.decimals) ?? 18)
  return {
    txHash,
    logIndex: typeof r.log_index === 'number' ? r.log_index : 0,
    timestamp: time(r.timestamp),
    from,
    to,
    token: { address, symbol: str(token.symbol) ?? str(token.name) ?? 'token', decimals: Number.isFinite(decimals) ? decimals : 18 },
    value: big(total.value),
  }
}

async function getPage<T>(path: string, parse: (raw: unknown) => T | undefined, cursor?: Record<string, string>): Promise<Page<T>> {
  const qs = new URLSearchParams(cursor)
  const res = await fetch(`${apiBase()}${path}${qs.size > 0 ? `?${qs}` : ''}`)
  if (res.status === 429) throw new Error('The explorer is busy. Wait a moment and try again.')
  if (!res.ok) throw new Error(`The explorer could not return this history (HTTP ${res.status}).`)
  const body = rec(await res.json())
  const items = Array.isArray(body?.items) ? body.items.map(parse).filter((x): x is T => x !== undefined) : []
  const next = rec(body?.next_page_params)
  return { items, next: next ? Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])) : undefined }
}

export const fetchTransactions = (address: string, cursor?: Record<string, string>) => getPage(`/addresses/${address}/transactions`, parseTx, cursor)
export const fetchTransfers = (address: string, cursor?: Record<string, string>) => getPage(`/addresses/${address}/token-transfers?type=ERC-20`, parseTransfer, cursor)

/* ---------- Labels ---------- */

const selectors = (abi: readonly unknown[]) =>
  new Map(
    (abi as Array<{ type: string; name?: string }>)
      .filter((i) => i.type === 'function' && i.name)
      .map((i) => [toFunctionSelector(i as never).toLowerCase(), i.name as string]),
  )
const flowSelectors = selectors(flowAbi)
const erc20Selectors = selectors(erc20Abi)

export type TxKind = 'fund' | 'claim' | 'payout' | 'refund' | 'cancel' | 'approval' | 'transfer' | 'deploy' | 'contract' | 'other'

const FLOW_LABELS: Record<string, { kind: TxKind; label: string }> = {
  createCampaign: { kind: 'fund', label: 'Funded a campaign' },
  claim: { kind: 'claim', label: 'Claimed USDC' },
  distribute: { kind: 'payout', label: 'Sent payouts' },
  refund: { kind: 'refund', label: 'Refunded a campaign' },
  cancelCampaign: { kind: 'cancel', label: 'Cancelled a campaign' },
}

const same = (a?: string, b?: string) => a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase()

/** A human label for a transaction, from the contract it called and the function selector. Unknown calls say so. */
export function labelTx(tx: ApiTx): { kind: TxKind; label: string } {
  if (tx.created) return { kind: 'deploy', label: 'Deployed a contract' }
  const fn = (tx.selector && (same(tx.to, ACTIVE.contract) ? flowSelectors.get(tx.selector) : same(tx.to, ACTIVE.usdc) ? erc20Selectors.get(tx.selector) : undefined)) || undefined
  if (same(tx.to, ACTIVE.contract)) {
    return (fn && FLOW_LABELS[fn]) || { kind: 'contract', label: 'GiftFlowPay contract call' }
  }
  if (same(tx.to, ACTIVE.usdc)) {
    if (fn === 'approve') return { kind: 'approval', label: 'Approved USDC spending' }
    if (fn === 'transfer') return { kind: 'transfer', label: 'Sent USDC' }
    return { kind: 'contract', label: 'USDC contract call' }
  }
  if (!tx.selector && tx.value > 0n) return { kind: 'transfer', label: 'Sent USDC' }
  if (tx.selector) return { kind: 'contract', label: 'Contract interaction' }
  return { kind: 'other', label: 'Transaction' }
}

/** Which way a token transfer went for this wallet. */
export const direction = (t: ApiTransfer, me: Address): 'in' | 'out' | 'self' =>
  same(t.from, me) && same(t.to, me) ? 'self' : same(t.to, me) ? 'in' : 'out'
