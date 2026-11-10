import { beforeAll, describe, expect, test } from 'bun:test'

// The contract address is read once at import time, so set it first and load the module afterwards.
const CONTRACT = '0xa4b97bda0785ab417d0cce128a9fb9449139ee2c'
const USDC = '0x3600000000000000000000000000000000000000'
const ME = '0xB720fb4fdCBdd5AD3288fd2D8D7A65FAA70D32Da'

let api: typeof import('./explorerApi')

beforeAll(async () => {
  process.env.VITE_GIFTFLOW_ADDRESS_TESTNET = CONTRACT
  api = await import('./explorerApi')
})

// Shapes copied from real responses of the Arc Testnet explorer API (fields the app does not read are omitted).
const rawTx = (over: Record<string, unknown> = {}) => ({
  hash: '0x5abcfa5ea52dcbc67dce0803432d271faa8571ff5c7f2a312af57b0758f313c8',
  block_number: 70222747,
  timestamp: '2026-11-01T18:38:08.000000Z',
  status: 'ok',
  method: '0x3b604001',
  from: { hash: ME },
  to: { hash: '0xA4B97bdA0785AB417d0cCE128a9Fb9449139EE2C' },
  value: '0',
  fee: { type: 'actual', value: '98576800000000000' },
  created_contract: null,
  raw_input: '0x3b6040011091510d49f0cc32',
  ...over,
})

const rawTransfer = {
  block_number: 70222747,
  from: { hash: ME },
  to: { hash: '0xA4B97bdA0785AB417d0cCE128a9Fb9449139EE2C' },
  log_index: 15,
  timestamp: '2026-11-01T18:38:08.000000Z',
  token: { address_hash: USDC, decimals: '6', name: 'USDC', symbol: 'USDC', type: 'ERC-20' },
  total: { decimals: '6', value: '1000000' },
  transaction_hash: '0x5abcfa5ea52dcbc67dce0803432d271faa8571ff5c7f2a312af57b0758f313c8',
  type: 'token_transfer',
}

describe('explorer parsing', () => {
  test('reads a transaction with its fee at 18-decimal precision', () => {
    const t = api.parseTx(rawTx())
    expect(t?.ok).toBe(true)
    expect(t?.fee).toBe(98_576_800_000_000_000n)
    expect(t?.selector).toBe('0x3b604001')
    expect(t?.timestamp).toBe(Math.floor(Date.parse('2026-11-01T18:38:08Z') / 1000))
  })

  test('failed and contract-creation transactions are recognised', () => {
    expect(api.parseTx(rawTx({ status: 'error' }))?.ok).toBe(false)
    expect(api.parseTx(rawTx({ created_contract: { hash: '0x1' }, to: null }))?.created).toBe(true)
  })

  test('rejects rows that lack the essentials instead of guessing', () => {
    expect(api.parseTx({})).toBeUndefined()
    expect(api.parseTx(rawTx({ hash: undefined }))).toBeUndefined()
    expect(api.parseTx(null)).toBeUndefined()
    expect(api.parseTransfer({ ...rawTransfer, total: undefined })).toBeUndefined()
    expect(api.parseTransfer('nope')).toBeUndefined()
  })

  test('reads a token transfer with its own decimals', () => {
    const t = api.parseTransfer(rawTransfer)
    expect(t?.value).toBe(1_000_000n)
    expect(t?.token).toEqual({ address: USDC, symbol: 'USDC', decimals: 6 })
    expect(t?.logIndex).toBe(15)
  })

  test('direction is relative to the wallet, case-insensitively', () => {
    const t = api.parseTransfer(rawTransfer)
    if (!t) throw new Error('fixture failed to parse')
    expect(api.direction(t, ME as `0x${string}`)).toBe('out')
    expect(api.direction(t, ME.toLowerCase() as `0x${string}`)).toBe('out')
    expect(api.direction(t, '0xA4B97bdA0785AB417d0cCE128a9Fb9449139EE2C')).toBe('in')
    expect(api.direction({ ...t, to: ME }, ME as `0x${string}`)).toBe('self')
  })
})

describe('transaction labels', () => {
  const tx = (over: Record<string, unknown>) => {
    const t = api.parseTx(rawTx(over))
    if (!t) throw new Error('fixture failed to parse')
    return t
  }

  test('the createCampaign selector seen onchain is the one derived from the ABI', () => {
    expect(api.labelTx(tx({})).label).toBe('Funded a campaign')
  })

  test('other GiftFlowPay calls are named', async () => {
    const { toFunctionSelector } = await import('viem')
    const { flowAbi } = await import('./abi')
    const selectorOf = (name: string) => toFunctionSelector(flowAbi.find((i) => i.type === 'function' && i.name === name) as never)
    const label = (name: string) => api.labelTx(tx({ raw_input: `${selectorOf(name)}00` })).label
    expect(label('claim')).toBe('Claimed USDC')
    expect(label('distribute')).toBe('Sent payouts')
    expect(label('refund')).toBe('Refunded a campaign')
    expect(label('cancelCampaign')).toBe('Cancelled a campaign')
    expect(api.labelTx(tx({ raw_input: '0xdeadbeef00' })).label).toBe('GiftFlowPay contract call')
  })

  test('USDC approvals and transfers, plain value transfers, unknown contracts and deployments', () => {
    expect(api.labelTx(tx({ to: { hash: USDC }, raw_input: '0x095ea7b300' })).label).toBe('Approved USDC spending')
    expect(api.labelTx(tx({ to: { hash: USDC }, raw_input: '0xa9059cbb00' })).label).toBe('Sent USDC')
    expect(api.labelTx(tx({ to: { hash: '0x0000000000000000000000000000000000000abc' }, raw_input: '0x', value: '5' })).label).toBe('Sent USDC')
    expect(api.labelTx(tx({ to: { hash: '0x0000000000000000000000000000000000000abc' }, raw_input: '0x12345678aa' })).label).toBe('Contract interaction')
    expect(api.labelTx(tx({ created_contract: { hash: '0x1' }, to: null })).label).toBe('Deployed a contract')
  })

  test('a look-alike contract address is never labelled as GiftFlowPay', () => {
    expect(api.labelTx(tx({ to: { hash: '0xA4B97bdA0785AB417d0cCE128a9Fb9449139EE2D' } })).label).toBe('Contract interaction')
  })
})
