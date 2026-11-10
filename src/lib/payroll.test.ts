import { describe, expect, test } from 'bun:test'
import { checkRows, decodeMeta, encodeMeta, leavesFromRows, newRow, parseAmount, rowsFromCsv } from './flow'
import { trimFee } from './format'
import { payrollReady, receiptCsv, splitBatches } from './payroll'
import { buildTree, proofFor, verifyProof } from './tree'

const wallets = Array.from({ length: 120 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}`)
const rows = (n: number, amount = '5') => wallets.slice(0, n).map((w, i) => newRow({ wallet: w, amount, label: `Employee ${i + 1}` }))

describe('payroll validation', () => {
  test('accepts a full list of unique wallets with amounts', () => {
    expect(payrollReady(rows(100), 4096)).toBe(true)
  })

  test('rejects a row with no wallet (payroll has no claim links)', () => {
    const r = rows(3)
    r[1].wallet = ''
    expect(payrollReady(r, 4096)).toBe(false)
  })

  test('rejects duplicate wallets, bad addresses, zero and malformed amounts', () => {
    const dup = rows(3)
    dup[2].wallet = dup[0].wallet
    expect(payrollReady(dup, 4096)).toBe(false)
    const bad = rows(2)
    bad[0].wallet = '0x123'
    expect(payrollReady(bad, 4096)).toBe(false)
    const zero = rows(2)
    zero[0].amount = '0'
    expect(payrollReady(zero, 4096)).toBe(false)
    const frac = rows(2)
    frac[0].amount = '1.1234567'
    expect(payrollReady(frac, 4096)).toBe(false)
  })

  test('rejects more rows than the limit and an empty list', () => {
    expect(payrollReady(rows(5), 4)).toBe(false)
    expect(payrollReady([], 4096)).toBe(false)
  })
})

describe('payroll amounts and CSV', () => {
  test('totals use exact 6-decimal arithmetic', () => {
    const r = [newRow({ wallet: wallets[0], amount: '0.1' }), newRow({ wallet: wallets[1], amount: '0.2' }), newRow({ wallet: wallets[2], amount: '2500.000001' })]
    expect(checkRows(r, 100).total).toBe(100_000n + 200_000n + 2_500_000_001n)
  })

  test('imports a CSV with a header, quotes and blank lines', () => {
    const csv = `wallet,amount,label\n${wallets[0]},2500,"Doe, Jane"\n\n${wallets[1]},3100.5,Bob\n`
    const imported = rowsFromCsv(csv)
    expect(imported).toHaveLength(2)
    expect(imported[0].label).toBe('Doe, Jane')
    expect(parseAmount(imported[1].amount)).toBe(3_100_500_000n)
    expect(payrollReady(imported, 4096)).toBe(true)
  })

  test('the receipt reports paid and unpaid rows from the flags it is given', () => {
    const leaves = leavesFromRows(rows(3, '12.5'), undefined)
    const csv = receiptCsv(leaves, ['A', 'B, Inc', ''], [true, false, true]).split('\n')
    expect(csv[0]).toBe('index,label,wallet,amount_usdc,status')
    expect(csv[1]).toBe(`1,A,${wallets[0]},12.50,paid`)
    expect(csv[2]).toBe(`2,"B, Inc",${wallets[1]},12.50,unpaid`)
    expect(csv[3].endsWith(',paid')).toBe(true)
  })
})

describe('payroll batching and proofs', () => {
  test('100 employees become two batches of 50, with every wallet-bound proof valid', () => {
    const leaves = leavesFromRows(rows(100), undefined)
    const tree = buildTree(leaves)
    expect(tree.total).toBe(500_000_000n)
    expect(leaves.every((l) => l.walletBound)).toBe(true)
    const batches = splitBatches(leaves, 50)
    expect(batches.map((b) => b.length)).toEqual([50, 50])
    for (const l of leaves) expect(verifyProof(l, proofFor(tree, l.index), tree.root, tree.total, 100)).toBe(true)
  })

  test('a partial run resumes with only the unpaid wallets, in order', () => {
    const leaves = leavesFromRows(rows(7), undefined)
    const paid = [true, true, false, true, false, false, false]
    const pending = leaves.filter((l) => !paid[l.index])
    expect(pending.map((l) => l.index)).toEqual([2, 4, 5, 6])
    expect(splitBatches(pending, 3).map((b) => b.length)).toEqual([3, 1])
  })

  test('splitBatches handles empty input and exact multiples', () => {
    expect(splitBatches([], 50)).toEqual([])
    expect(splitBatches([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  test('payroll metadata carries the payroll type and list mode', () => {
    const m = decodeMeta(encodeMeta({ n: 'Payroll, November', d: '', t: 'payroll', m: '', k: 'list' }))
    expect(m?.t).toBe('payroll')
    expect(m?.k).toBe('list')
  })
})

describe('network fee display', () => {
  test('uses 18-decimal precision and never shows a misleading zero', () => {
    expect(trimFee(0n)).toBe('0')
    expect(trimFee(1n)).toBe('< 0.000001')
    expect(trimFee(10n ** 18n)).toBe('1')
    expect(trimFee(1_234_567_000_000_000n)).toBe('0.001234')
    expect(trimFee(21_000n * 160_000_000_000n)).toBe('0.00336')
  })
})
