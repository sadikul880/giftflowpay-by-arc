import type { Address, Hex } from 'viem'
import { claimKey, codeFor, keyAddress, keyFromCode, type DistMode } from './flow'
import type { Leaf } from './tree'

/**
 * A gift card is a one-recipient campaign on the GiftFlow contract.
 * - code:   claim page + a secret code the sender passes on separately. The link, QR and PNG hold no secret.
 * - wallet: only one named wallet can claim. The link, QR and PNG hold no secret.
 * - link:   whoever holds the link claims. The claim key is in the link's #fragment, so the link and its QR are
 *           bearer secrets, and the PNG deliberately carries no QR.
 */
export type GiftMethod = 'code' | 'wallet' | 'link'

export const GIFT_MODE: Record<GiftMethod, DistMode> = { code: 'codes', wallet: 'list', link: 'open' }

export const GIFT_PRESETS = ['10', '25', '50', '100', '500'] as const

export const GIFT_EXPIRY_DAYS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
] as const

export type GiftDesignId = 'emerald' | 'onyx' | 'mint' | 'aurora'

export interface GiftDesign {
  id: GiftDesignId
  name: string
  from: string
  to: string
  accent: string
  text: string
}

export const GIFT_DESIGNS: GiftDesign[] = [
  { id: 'emerald', name: 'Emerald', from: '#0f5f35', to: '#06110c', accent: '#34f08a', text: '#eaf4ee' },
  { id: 'onyx', name: 'Onyx', from: '#262b30', to: '#08090a', accent: '#d7dde2', text: '#f4f6f7' },
  { id: 'mint', name: 'Mint', from: '#d9f7e6', to: '#8fdcb0', accent: '#0b6b3a', text: '#06311c' },
  { id: 'aurora', name: 'Aurora', from: '#0c3b4a', to: '#0a1f2b', accent: '#5ff2d0', text: '#e9fbf7' },
]

export const giftDesign = (id: string | undefined): GiftDesign => GIFT_DESIGNS.find((d) => d.id === id) ?? GIFT_DESIGNS[0]

export const GIFT_LIMITS = { name: 40, message: 280 } as const

/** Gift details written into the public campaign metadata (field `g`). */
export interface GiftInfo {
  f: string
  t: string
  d: GiftDesignId
}

export interface GiftPlan {
  leaf: Leaf
  /** Claim key behind the allocation, for code and link gifts. Never leaves the sender's browser except inside a link. */
  key?: Hex
  /** Secret code to hand to the recipient (code gifts only). */
  code?: string
}

/** The single allocation of a gift. `master` and `salt` are needed for code and link gifts, `wallet` for wallet gifts. */
export function giftPlan(method: GiftMethod, amount: bigint, opts: { wallet?: Address; master?: Hex; salt?: Hex }): GiftPlan {
  if (amount <= 0n) throw new Error('A gift needs an amount greater than zero')
  if (method === 'wallet') {
    if (!opts.wallet) throw new Error('A wallet gift needs the recipient wallet')
    return { leaf: { index: 0, account: opts.wallet, amount, walletBound: true } }
  }
  if (!opts.master) throw new Error('Claim keys are required for code and link gifts')
  if (method === 'link') {
    const key = claimKey(opts.master, 0)
    return { leaf: { index: 0, account: keyAddress(key), amount, walletBound: false }, key }
  }
  if (!opts.salt) throw new Error('A code gift needs the campaign salt')
  const code = codeFor(opts.master, 0)
  const key = keyFromCode(code, opts.salt)
  return { leaf: { index: 0, account: keyAddress(key), amount, walletBound: false }, key, code }
}

/** Break text into lines that fit `maxWidth`, using `measure` for the width of a string. Words longer than a line are split. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word
      while (measure(w) > maxWidth && w.length > 1) {
        let cut = w.length - 1
        while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--
        if (line) {
          lines.push(line)
          line = ''
        }
        lines.push(w.slice(0, cut))
        w = w.slice(cut)
      }
      const next = line ? `${line} ${w}` : w
      if (measure(next) <= maxWidth) line = next
      else {
        lines.push(line)
        line = w
      }
    }
    lines.push(line)
  }
  const out = lines.filter((l, i) => l !== '' || i < lines.length - 1)
  if (out.length <= maxLines) return out
  const kept = out.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:!?-]+$/, '')}…`
  return kept
}

/** The gift method implied by a campaign's stored payout mode. */
export const methodFromMode = (mode: DistMode | undefined): GiftMethod => (mode === 'codes' ? 'code' : mode === 'open' ? 'link' : 'wallet')

/**
 * Rebuild a gift's secret from the funding wallet's signature (the same one that created it).
 * Throws if the result does not match the allocation committed onchain, which means the wrong wallet signed.
 */
export function recoverGift(method: GiftMethod, leaf: Leaf, master: Hex, salt: Hex): { key?: Hex; code?: string } {
  if (method === 'wallet') return {}
  const plan = giftPlan(method, leaf.amount, { master, salt })
  if (plan.leaf.account.toLowerCase() !== leaf.account.toLowerCase()) {
    throw new Error('This wallet cannot recreate the gift. Sign with the wallet that funded it.')
  }
  return { key: plan.key, code: plan.code }
}
