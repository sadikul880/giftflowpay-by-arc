import { concat, encodePacked, hexToBytes, isAddress, keccak256, stringToHex, toHex, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { parseUsdc } from '@/onchain-money'
import { buildShareLink } from './share'
import type { Leaf, ProofNode } from './tree'

/* ---------- Campaign metadata (public JSON in the creation event) ---------- */

export const CAMPAIGN_TYPES = [
  { id: 'airdrop', label: 'Community airdrop' },
  { id: 'hackathon', label: 'Hackathon prizes' },
  { id: 'grant', label: 'Grants' },
  { id: 'bounty', label: 'Bounties' },
  { id: 'gift', label: 'Gift card' },
  { id: 'rewards', label: 'Contributor rewards' },
  { id: 'other', label: 'Other' },
] as const

export type CampaignTypeId = (typeof CAMPAIGN_TYPES)[number]['id']

/**
 * How recipients reach their share:
 * - list: each row is a wallet (or a personal link), the default
 * - open: one shared link; every holder claims one equal share until all shares are gone
 * - codes: one campaign link plus a personal secret code per person
 */
export type DistMode = 'list' | 'open' | 'codes'

export interface CampaignMeta {
  n: string
  d: string
  t: CampaignTypeId
  m: string
  /** Distribution mode. Missing on older campaigns, which are always 'list'. */
  k?: DistMode
  /** Gift card details (sender, recipient name, design). Present only on gift cards. */
  g?: { f: string; t: string; d: string }
}

export const LIMITS = {
  name: 80,
  description: 600,
  message: 280,
  metadataBytes: 2048,
  publicRecipients: 1000,
  privateRecipients: 4096,
  batch: 50,
} as const

export const typeLabel = (id: string): string => CAMPAIGN_TYPES.find((t) => t.id === id)?.label ?? 'Other'

const encoder = new TextEncoder()
export const encodeMeta = (m: CampaignMeta): string => JSON.stringify(m)
export const metaBytes = (m: CampaignMeta): number => encoder.encode(encodeMeta(m)).length

function decodeGift(raw: unknown): CampaignMeta['g'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const g = raw as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return { f: s(g.f, 40), t: s(g.t, 40), d: s(g.d, 20) }
}

export function decodeMeta(raw: string | undefined): CampaignMeta | undefined {
  if (!raw) return undefined
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o !== 'object' || o === null) return undefined
    const t = CAMPAIGN_TYPES.find((x) => x.id === o.t)?.id ?? 'other'
    return {
      n: typeof o.n === 'string' ? o.n.slice(0, LIMITS.name) : '',
      d: typeof o.d === 'string' ? o.d.slice(0, LIMITS.description) : '',
      t,
      m: typeof o.m === 'string' ? o.m.slice(0, LIMITS.message) : '',
      k: o.k === 'open' || o.k === 'codes' ? o.k : 'list',
      g: decodeGift(o.g),
    }
  } catch {
    return undefined
  }
}

/* ---------- Status ---------- */

export type CampaignState = 'scheduled' | 'active' | 'completed' | 'expired' | 'cancelled'

export interface CampaignLike {
  startTime: bigint
  claimDeadline: bigint
  totalAllocation: bigint
  claimed: bigint
  refunded: bigint
  cancelled: boolean
}

export function campaignState(c: CampaignLike, now: number): CampaignState {
  if (c.cancelled) return 'cancelled'
  if (c.claimed >= c.totalAllocation) return 'completed'
  if (now >= Number(c.claimDeadline)) return 'expired'
  if (now < Number(c.startTime)) return 'scheduled'
  return 'active'
}

/** Money still held by the contract for this campaign. */
export const remainingOf = (c: CampaignLike): bigint => (c.cancelled ? 0n : c.totalAllocation - c.claimed - c.refunded)

/** What refund() would pay at this moment. */
export const refundableOf = (c: CampaignLike, now: number): bigint =>
  !c.cancelled && now >= Number(c.claimDeadline) ? c.totalAllocation - c.claimed - c.refunded : 0n

/* ---------- Draft recipients and CSV ---------- */

export interface RecipientRow {
  id: string
  label: string
  wallet: string
  amount: string
}

export const newRow = (patch: Partial<RecipientRow> = {}): RecipientRow => ({
  id: crypto.randomUUID(),
  label: '',
  wallet: '',
  amount: '',
  ...patch,
})

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const push = () => {
    row.push(cell.trim())
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === '\t' || ch === ';') push()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      push()
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  push()
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

/** Columns: wallet (optional), amount, label (optional). A header row is detected by the word "amount". */
export function rowsFromCsv(text: string): RecipientRow[] {
  const table = parseCsv(text)
  if (table.length === 0) return []
  const head = table[0].map((c) => c.toLowerCase())
  const hasHeader = head.includes('amount') || head.includes('usdc') || head.includes('reward')
  const find = (names: string[], fallback: number) => {
    if (!hasHeader) return fallback
    const i = head.findIndex((h) => names.includes(h))
    return i
  }
  const wi = find(['wallet', 'address', 'account'], 0)
  const ai = find(['amount', 'usdc', 'reward'], 1)
  const li = find(['label', 'name', 'handle', 'email', 'note'], 2)
  return table.slice(hasHeader ? 1 : 0).map((r) =>
    newRow({
      wallet: wi >= 0 ? (r[wi] ?? '') : '',
      amount: ai >= 0 ? (r[ai] ?? '') : '',
      label: li >= 0 ? (r[li] ?? '') : '',
    }),
  )
}

export function parseAmount(value: string): bigint | undefined {
  try {
    const raw = parseUsdc(value.trim())
    return raw > 0n ? raw : undefined
  } catch {
    return undefined
  }
}

export interface RowCheck {
  errors: Record<string, string>
  total: bigint
  linkCount: number
  walletCount: number
  valid: boolean
}

export function checkRows(rows: RecipientRow[], maxRows: number): RowCheck {
  const errors: Record<string, string> = {}
  const seen = new Map<string, string>()
  let total = 0n
  let linkCount = 0
  let walletCount = 0
  for (const r of rows) {
    const amount = parseAmount(r.amount)
    if (amount === undefined) errors[r.id] = 'Enter an amount greater than 0 (up to 6 decimals).'
    else total += amount
    const w = r.wallet.trim()
    if (w === '') linkCount++
    else if (!isAddress(w)) errors[r.id] ??= 'Not a valid wallet address.'
    else {
      walletCount++
      const key = w.toLowerCase()
      if (seen.has(key)) errors[r.id] ??= 'Duplicate wallet. Combine these into one row.'
      seen.set(key, r.id)
    }
  }
  const valid = rows.length > 0 && rows.length <= maxRows && Object.keys(errors).length === 0
  return { errors, total, linkCount, walletCount, valid }
}

/* ---------- Claim keys for link-based recipients ---------- */

export const keyMessage = (contract: Address, chainId: number, salt: Hex): string =>
  [
    'GiftFlow claim keys',
    '',
    'Sign to create the private keys behind this campaign\u2019s claim links. This is free and does not move funds.',
    'Only sign this on the GiftFlow app you opened.',
    '',
    `Contract: ${contract.toLowerCase()}`,
    `Chain: ${chainId}`,
    `Salt: ${salt}`,
  ].join('\n')

export const masterFromSignature = (signature: Hex): Hex => keccak256(signature)
export const claimKey = (master: Hex, index: number): Hex => keccak256(encodePacked(['bytes32', 'uint32'], [master, index]))
export const keyAddress = (key: Hex): Address => privateKeyToAccount(key).address
export const randomSalt = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)))

/* ---------- Secret codes (mode "codes") ---------- */

// 31 symbols without 0, 1, O, I or L so codes survive being read aloud or retyped.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** Personal code for one recipient, derived from the campaign master secret so the organizer can list it again later. */
export function codeFor(master: Hex, index: number): string {
  const bytes = hexToBytes(keccak256(encodePacked(['bytes32', 'uint32', 'string'], [master, index, 'code'])))
  let out = ''
  for (let i = 0; i < 12; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`
}

export const normalizeCode = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Claim key behind a code. The campaign salt is public, so the code itself (about 59 bits) is the secret. */
export const keyFromCode = (code: string, salt: Hex): Hex => keccak256(stringToHex(`giftflow:${salt}:${normalizeCode(code)}`))

/** Turn rows into tree leaves. Rows without a wallet become link-based allocations owned by a derived key. */
export function leavesFromRows(rows: RecipientRow[], master: Hex | undefined, keyOf?: (index: number) => Hex): Leaf[] {
  return rows.map((r, index) => {
    const amount = parseAmount(r.amount)
    if (amount === undefined) throw new Error(`Row ${index + 1} has an invalid amount`)
    const w = r.wallet.trim()
    if (w !== '') return { index, account: w as Address, amount, walletBound: true }
    if (!master) throw new Error('Claim keys are required for link-based recipients')
    return { index, account: keyAddress(keyOf ? keyOf(index) : claimKey(master, index)), amount, walletBound: false }
  })
}

/* ---------- Published recipient list (public campaigns) ---------- */

export function encodePublished(leaves: Leaf[]): Hex {
  return concat(
    leaves.map((l) => concat([l.account, toHex(l.amount, { size: 16 }), l.walletBound ? '0x01' : '0x00'])),
  )
}

export function decodePublished(data: Hex): Leaf[] {
  const bytes = hexToBytes(data)
  const leaves: Leaf[] = []
  for (let i = 0; i + 37 <= bytes.length; i += 37) {
    const row = bytes.slice(i, i + 37)
    const amount = BigInt(toHex(row.slice(20, 36)))
    leaves.push({
      index: i / 37,
      account: toHex(row.slice(0, 20)),
      amount,
      walletBound: row[36] === 1,
    })
  }
  return leaves
}

/* ---------- Claim links ---------- */

export interface ClaimPayload {
  index: number
  account: Address
  amount: bigint
  walletBound: boolean
  proof: ProofNode[]
  key?: Hex
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** Compact binary layout so private links stay well under the 1024-character fragment limit. */
export function encodeClaimPayload(p: ClaimPayload): string {
  const parts: Hex[] = [
    toHex(p.index, { size: 4 }),
    toHex(p.amount, { size: 16 }),
    p.walletBound ? '0x01' : '0x00',
    p.account,
    p.key ? '0x01' : '0x00',
    ...(p.key ? [p.key] : []),
    toHex(p.proof.length, { size: 1 }),
    ...p.proof.map((n) => concat([n.hash, toHex(n.sum, { size: 16 })])),
  ]
  return b64(hexToBytes(concat(parts)))
}

export function decodeClaimPayload(s: string): ClaimPayload | undefined {
  try {
    const b = unb64(s)
    let o = 0
    const take = (n: number) => {
      const out = b.slice(o, o + n)
      if (out.length !== n) throw new Error('short')
      o += n
      return out
    }
    const index = Number(BigInt(toHex(take(4))))
    const amount = BigInt(toHex(take(16)))
    const walletBound = take(1)[0] === 1
    const account = toHex(take(20))
    const key = take(1)[0] === 1 ? (toHex(take(32))) : undefined
    const count = take(1)[0]
    const proof: ProofNode[] = []
    for (let i = 0; i < count; i++) proof.push({ hash: toHex(take(32)), sum: BigInt(toHex(take(16))) })
    return { index, account, amount, walletBound, proof, key }
  } catch {
    return undefined
  }
}

export async function claimLink(
  campaignId: bigint,
  leaf: Leaf,
  opts: { isPublic: boolean; key?: Hex; proof?: ProofNode[] },
): Promise<string> {
  const base = await buildShareLink(`/claim/${campaignId}`)
  if (!opts.isPublic) {
    if (!opts.proof) throw new Error('A proof is required for private campaign links')
    return `${base}#p=${encodeClaimPayload({ ...leaf, proof: opts.proof, key: leaf.walletBound ? undefined : opts.key })}`
  }
  return leaf.walletBound ? `${base}?r=${leaf.account}` : `${base}#k=${opts.key}`
}

/** One link for everyone: whoever holds it can claim one share. The master secret rides in the #fragment only. */
export async function openLink(campaignId: bigint, master: Hex): Promise<string> {
  return `${await buildShareLink(`/claim/${campaignId}`)}#m=${master.slice(2)}`
}

/** Personal link that pre-fills a secret code. The code rides in the #fragment only. */
export async function codeLink(campaignId: bigint, code: string): Promise<string> {
  return `${await buildShareLink(`/claim/${campaignId}`)}#c=${normalizeCode(code)}`
}

/** Parse a claim URL fragment: `#k=<key>`, `#m=<master>` (open link), `#c=<code>` or `#p=<payload>` (private). */
export function parseClaimHash(hash: string): { key?: Hex; master?: Hex; code?: string; payload?: ClaimPayload } {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('m=') && /^[0-9a-fA-F]{64}$/.test(h.slice(2))) return { master: `0x${h.slice(2)}` }
  if (h.startsWith('c=') && /^[0-9A-Za-z]{12}$/.test(h.slice(2))) return { code: normalizeCode(h.slice(2)) }
  if (h.startsWith('k=') && /^[0-9a-fA-F]{64}$/.test(h.slice(2))) return { key: `0x${h.slice(2)}` }
  if (h.startsWith('p=')) {
    const payload = decodeClaimPayload(h.slice(2))
    if (payload) return { payload }
  }
  return {}
}

export const CLAIM_TYPES = {
  Claim: [
    { name: 'campaignId', type: 'uint256' },
    { name: 'index', type: 'uint256' },
    { name: 'recipient', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
