import { describe, expect, test } from 'bun:test'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { recoverTypedDataAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CLAIM_TYPES, codeFor, decodeMeta, encodeMeta, encodePublished, decodePublished, keyAddress, keyFromCode, metaBytes, openLink, parseClaimHash } from './flow'
import { GIFT_DESIGNS, GIFT_MODE, giftDesign, giftPlan, wrapLines } from './gift'
import { buildTree, proofFor, verifyProof } from './tree'

// share.ts reads the page origin; a top-level window gives it the same answer as a normal browser tab.
const fakeWindow: Record<string, unknown> = { location: { origin: 'https://giftflowpay.xyz' } }
fakeWindow.self = fakeWindow
fakeWindow.top = fakeWindow
;(globalThis as unknown as { window: unknown }).window = fakeWindow

const master = ('0x' + '5a'.repeat(32)) as Hex
const salt = ('0x' + '77'.repeat(32)) as Hex
const wallet = '0x' + 'ab'.repeat(20) as Address
const amount = 25_000_000n

describe('gift plans', () => {
  test('code gift: the allocation belongs to the key behind the code, never to a wallet', () => {
    const p = giftPlan('code', amount, { master, salt })
    expect(p.code).toBe(codeFor(master, 0))
    expect(p.leaf.walletBound).toBe(false)
    expect(p.leaf.account).toBe(keyAddress(keyFromCode(p.code as string, salt)))
    expect(p.leaf.amount).toBe(amount)
  })

  test('link gift: the allocation belongs to the master-derived key', () => {
    const p = giftPlan('link', amount, { master, salt })
    expect(p.code).toBeUndefined()
    expect(p.leaf.walletBound).toBe(false)
    expect(p.leaf.account).toBe(keyAddress(p.key as Hex))
  })

  test('wallet gift is bound to the named wallet and needs no secret', () => {
    const p = giftPlan('wallet', amount, { wallet })
    expect(p.leaf).toEqual({ index: 0, account: wallet, amount, walletBound: true })
    expect(p.key).toBeUndefined()
    expect(p.code).toBeUndefined()
  })

  test('refuses incomplete input', () => {
    expect(() => giftPlan('wallet', amount, {})).toThrow()
    expect(() => giftPlan('code', amount, { master })).toThrow()
    expect(() => giftPlan('link', amount, {})).toThrow()
    expect(() => giftPlan('code', 0n, { master, salt })).toThrow()
  })

  test('a one-recipient tree verifies with an empty proof, as the contract expects', () => {
    for (const method of ['code', 'link', 'wallet'] as const) {
      const p = giftPlan(method, amount, { master, salt, wallet })
      const tree = buildTree([p.leaf])
      expect(tree.depth).toBe(0)
      expect(tree.total).toBe(amount)
      expect(verifyProof(p.leaf, proofFor(tree, 0), tree.root, tree.total, 1)).toBe(true)
      const [round] = decodePublished(encodePublished([p.leaf]))
      expect(round.account.toLowerCase()).toBe(p.leaf.account.toLowerCase())
      expect(round.amount).toBe(amount)
    }
  })

  test('the code key signs a claim the contract would accept', async () => {
    const p = giftPlan('code', amount, { master, salt })
    const key = keyFromCode(p.code as string, salt)
    const domain = { name: 'GiftFlow', version: '1', chainId: 5042002, verifyingContract: ('0x' + 'cd'.repeat(20)) as Hex } as const
    const message = { campaignId: 9n, index: 0n, recipient: wallet, deadline: 1_900_000_000n }
    const signature = await privateKeyToAccount(key).signTypedData({ domain, types: CLAIM_TYPES, primaryType: 'Claim', message })
    expect(await recoverTypedDataAddress({ domain, types: CLAIM_TYPES, primaryType: 'Claim', message, signature })).toBe(p.leaf.account)
  })
})

describe('gift metadata', () => {
  test('round-trips sender, recipient and design, and stays well under the onchain limit', () => {
    const raw = encodeMeta({ n: 'Gift card for Sam', d: '', t: 'gift', m: 'x'.repeat(280), k: GIFT_MODE.code, g: { f: 'A'.repeat(40), t: 'B'.repeat(40), d: 'aurora' } })
    expect(metaBytes({ n: 'Gift card for Sam', d: '', t: 'gift', m: 'x'.repeat(280), k: 'codes', g: { f: 'A'.repeat(40), t: 'B'.repeat(40), d: 'aurora' } })).toBeLessThan(2048)
    const m = decodeMeta(raw)
    expect(m?.t).toBe('gift')
    expect(m?.k).toBe('codes')
    expect(m?.g).toEqual({ f: 'A'.repeat(40), t: 'B'.repeat(40), d: 'aurora' })
  })

  test('older campaigns have no gift block', () => {
    expect(decodeMeta(JSON.stringify({ n: 'a', d: '', t: 'airdrop', m: '' }))?.g).toBeUndefined()
  })

  test('unknown design falls back to the first one', () => {
    expect(giftDesign('nope').id).toBe(GIFT_DESIGNS[0].id)
  })
})

async function decodeQr(text: string): Promise<string | undefined> {
  const { PNG } = await import('pngjs')
  const url = await QRCode.toDataURL(text, { margin: 1, width: 480, errorCorrectionLevel: 'M' })
  const png = PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'))
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data
}

describe('qr codes', () => {
  test('a QR scans back to exactly the claim link, so the link and QR open the same page', async () => {
    const claimPage = 'https://giftflowpay.xyz/claim/42'
    expect(await decodeQr(claimPage)).toBe(claimPage)
    const walletLink = `${claimPage}?r=${wallet}`
    expect(await decodeQr(walletLink)).toBe(walletLink)
  })

  test('code and wallet gift links hold no secret', () => {
    const p = giftPlan('code', amount, { master, salt })
    const claimPage = 'https://giftflowpay.xyz/claim/42'
    expect(claimPage).not.toContain(p.code as string)
    expect(claimPage).not.toContain((p.key as Hex).slice(2))
    expect(claimPage).not.toContain(master.slice(2))
    expect(parseClaimHash(new URL(claimPage).hash)).toEqual({})
  })

  test('the private link gift puts the secret only in the fragment', async () => {
    const link = await openLink(42n, master)
    const url = new URL(link)
    expect(url.search).toBe('')
    expect(url.pathname).not.toContain(master.slice(2))
    expect(parseClaimHash(url.hash)).toEqual({ master })
    expect(await decodeQr(link)).toBe(link)
  })
})

describe('text wrapping for the PNG', () => {
  const measure = (s: string) => s.length * 10

  test('wraps on word boundaries within the width', () => {
    const lines = wrapLines('happy birthday and many happy returns', 150, measure)
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(150)
    expect(lines.join(' ')).toBe('happy birthday and many happy returns')
  })

  test('splits a word longer than a line and truncates with an ellipsis', () => {
    expect(wrapLines('a'.repeat(40), 100, measure).every((l) => l.length <= 10)).toBe(true)
    const lines = wrapLines('one two three four five six seven eight nine ten', 60, measure, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })

  test('keeps explicit line breaks', () => {
    expect(wrapLines('hi\nthere', 200, measure)).toEqual(['hi', 'there'])
  })
})
