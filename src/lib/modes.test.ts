import { describe, expect, test } from 'bun:test'
import { recoverTypedDataAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  CLAIM_TYPES,
  claimKey,
  codeFor,
  decodeMeta,
  encodeMeta,
  keyAddress,
  keyFromCode,
  leavesFromRows,
  newRow,
  normalizeCode,
  parseClaimHash,
} from './flow'
import { buildTree, proofFor, verifyProof } from './tree'

const master = ('0x' + '11'.repeat(32)) as Hex
const salt = ('0x' + '22'.repeat(32)) as Hex
const rows = Array.from({ length: 100 }, () => newRow({ amount: '5' }))

describe('secret codes', () => {
  test('are deterministic, well formed and unique', () => {
    const codes = rows.map((_, i) => codeFor(master, i))
    expect(codeFor(master, 7)).toBe(codes[7])
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/)
    expect(new Set(codes).size).toBe(100)
  })

  test('ignore case, spaces and dashes when typed', () => {
    const code = codeFor(master, 3)
    expect(keyFromCode(code.toLowerCase(), salt)).toBe(keyFromCode(` ${normalizeCode(code)} `, salt))
  })

  test('different campaigns give different keys for the same code', () => {
    const other = ('0x' + '33'.repeat(32)) as Hex
    expect(keyFromCode(codeFor(master, 0), salt)).not.toBe(keyFromCode(codeFor(master, 0), other))
  })

  test('commit to a tree whose proofs verify and whose leaves match the code keys', () => {
    const leaves = leavesFromRows(rows, master, (i) => keyFromCode(codeFor(master, i), salt))
    const tree = buildTree(leaves)
    expect(tree.total).toBe(500_000_000n)
    leaves.forEach((leaf, i) => {
      expect(leaf.walletBound).toBe(false)
      expect(leaf.account).toBe(keyAddress(keyFromCode(codeFor(master, i), salt)))
      expect(verifyProof(leaf, proofFor(tree, i), tree.root, tree.total, leaves.length)).toBe(true)
    })
  })
})

describe('open link', () => {
  test('every share is unlocked by the master secret and signs a claim the contract would accept', async () => {
    const leaves = leavesFromRows(rows, master)
    const tree = buildTree(leaves)
    const contract = '0x' + 'ab'.repeat(20)
    const recipient = '0x' + 'cd'.repeat(20)
    for (const i of [0, 1, 57, 99]) {
      const key = claimKey(master, i)
      expect(keyAddress(key)).toBe(leaves[i].account)
      expect(verifyProof(leaves[i], proofFor(tree, i), tree.root, tree.total, 100)).toBe(true)
      const signature = await privateKeyToAccount(key).signTypedData({
        domain: { name: 'GiftFlow', version: '1', chainId: 5042002, verifyingContract: contract as Hex },
        types: CLAIM_TYPES,
        primaryType: 'Claim',
        message: { campaignId: 1n, index: BigInt(i), recipient: recipient as Hex, deadline: 1_900_000_000n },
      })
      const signer = await recoverTypedDataAddress({
        domain: { name: 'GiftFlow', version: '1', chainId: 5042002, verifyingContract: contract as Hex },
        types: CLAIM_TYPES,
        primaryType: 'Claim',
        message: { campaignId: 1n, index: BigInt(i), recipient: recipient as Hex, deadline: 1_900_000_000n },
        signature,
      })
      expect(signer).toBe(leaves[i].account)
    }
  })
})

describe('links and metadata', () => {
  test('parseClaimHash reads the open, code and key fragments', () => {
    expect(parseClaimHash(`#m=${master.slice(2)}`)).toEqual({ master })
    expect(parseClaimHash('#c=k7qx-9m2p-4twd'.replace(/-/g, ''))).toEqual({ code: 'K7QX9M2P4TWD' })
    expect(parseClaimHash(`#k=${'ab'.repeat(32)}`)).toEqual({ key: `0x${'ab'.repeat(32)}` })
    expect(parseClaimHash('#m=short')).toEqual({})
    expect(parseClaimHash('')).toEqual({})
  })

  test('campaign metadata keeps the payout mode and defaults to list for older campaigns', () => {
    expect(decodeMeta(encodeMeta({ n: 'a', d: '', t: 'airdrop', m: '', k: 'codes' }))?.k).toBe('codes')
    expect(decodeMeta(encodeMeta({ n: 'a', d: '', t: 'airdrop', m: '', k: 'open' }))?.k).toBe('open')
    expect(decodeMeta(JSON.stringify({ n: 'old', d: '', t: 'airdrop', m: '' }))?.k).toBe('list')
  })
})
