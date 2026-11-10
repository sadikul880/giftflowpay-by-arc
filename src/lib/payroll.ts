import { checkRows, csvEscape, type RecipientRow } from './flow'
import { fmtUsd } from './format'
import type { Leaf } from './tree'

/** Rows that are ready to pay: every row has a valid wallet and amount, and wallets are unique. */
export function payrollReady(rows: RecipientRow[], max: number): boolean {
  return checkRows(rows, max).valid && rows.every((r) => r.wallet.trim() !== '')
}

export function splitBatches<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** CSV receipt of a payroll run. `paid` is read from the chain, never assumed. */
export function receiptCsv(leaves: Leaf[], labels: string[], paid: boolean[]): string {
  return [
    'index,label,wallet,amount_usdc,status',
    ...leaves.map((l) => [l.index + 1, csvEscape(labels[l.index] ?? ''), l.account, fmtUsd(l.amount).replace(/,/g, ''), paid[l.index] ? 'paid' : 'unpaid'].join(',')),
  ].join('\n')
}
