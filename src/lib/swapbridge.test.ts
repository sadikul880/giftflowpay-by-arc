import { describe, expect, test } from 'bun:test'
import { arcTestnet } from 'viem/chains'
import { isNoRoute, kitMessage } from './appkit'
import { safeHttpUrl } from './safeUrl'
import { ARC_CIRBTC, ARC_EURC, ARC_USDC, fmtToken, isWrappedBitcoin, parseTokenAddress, SWAP_TOKENS } from './tokens'

describe('verified token and chain facts', () => {
  // Expected values are copied from Circle's published USDC and EURC testnet contract-address tables.
  test('addresses match the published tables', () => {
    expect(ARC_USDC.address).toBe('0x3600000000000000000000000000000000000000')
    expect(ARC_EURC.address).toBe('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a')
    // cirBTC: Circle App Kit's built-in registry entry for Arc Testnet; the contract answers symbol cirBTC, 8 decimals.
    expect(ARC_CIRBTC.address).toBe('0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF')
  })

  test('chain ids come from viem', () => {
    expect(ARC_USDC.chainId).toBe(arcTestnet.id)
    expect(ARC_EURC.chainId).toBe(arcTestnet.id)
    expect(ARC_CIRBTC.chainId).toBe(arcTestnet.id)
  })

  test('swap tokens are all on Arc Testnet, in the order USDC, EURC, cirBTC', () => {
    expect(SWAP_TOKENS.every((t) => t.chainId === arcTestnet.id)).toBe(true)
    expect(SWAP_TOKENS.map((t) => t.symbol)).toEqual(['USDC', 'EURC', 'cirBTC'])
  })
})

describe('token display', () => {
  test('formats with the token decimals, never rounding to a wrong zero', () => {
    expect(fmtToken(1_500_000n, 6)).toBe('1.5')
    expect(fmtToken(1_234_567_890n, 6)).toBe('1,234.56789')
    expect(fmtToken(0n, 6)).toBe('0')
    expect(fmtToken(10n ** 18n, 18)).toBe('1')
    expect(fmtToken(1n, 8)).toBe('0')
    expect(fmtToken(123_456_789n, 8)).toBe('1.234567')
  })

  test('cirBTC is recognised as wrapped Bitcoin by its reported symbol only', () => {
    expect(isWrappedBitcoin('cirBTC')).toBe(true)
    expect(isWrappedBitcoin('CIRBTC')).toBe(true)
    expect(isWrappedBitcoin('BTC')).toBe(false)
    expect(isWrappedBitcoin(undefined)).toBe(false)
  })

  test('only a valid 20-byte address is accepted as a custom token', () => {
    expect(parseTokenAddress(' 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a ')).toBe('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a')
    expect(parseTokenAddress('0x123')).toBeUndefined()
    expect(parseTokenAddress('USDC')).toBeUndefined()
  })
})

describe('error handling', () => {
  test('only INPUT_UNSUPPORTED_ROUTE means no route', () => {
    expect(isNoRoute({ name: 'INPUT_UNSUPPORTED_ROUTE' })).toBe(true)
    expect(isNoRoute(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))).toBe(false)
    expect(isNoRoute(new Error('429 rate limited'))).toBe(false)
    expect(isNoRoute(undefined)).toBe(false)
  })

  test('messages are readable and a failure is never reported as a missing route', () => {
    expect(kitMessage({ name: 'INPUT_UNSUPPORTED_ROUTE' })).toContain('No swap route')
    expect(kitMessage(new Error('User rejected the request.'))).toBe('Request cancelled in your wallet.')
    expect(kitMessage(new Error('User cancelled permit signature request. The swap cannot proceed without user approval.'))).toBe('Request cancelled in your wallet.')
    expect(kitMessage(new Error('insufficient funds for gas'))).toContain('Not enough')
    expect(kitMessage(new Error('rate limit exceeded'))).not.toContain('No swap route')
    expect(kitMessage({ message: 'User rejected the request.' })).toBe('Request cancelled in your wallet.')
    expect(kitMessage(null)).toBe('Something went wrong. Please try again.')
  })
})

describe('links from outside the app', () => {
  test('only plain http(s) URLs are followed', () => {
    expect(safeHttpUrl('https://explorer.testnet.arc.io/tx/0xabc')).toBe('https://explorer.testnet.arc.io/tx/0xabc')
    expect(safeHttpUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x')
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('JaVaScRiPt:alert(1)')).toBeUndefined()
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHttpUrl('//evil.example/x')).toBeUndefined()
    expect(safeHttpUrl('not a url')).toBeUndefined()
    expect(safeHttpUrl(undefined)).toBeUndefined()
    expect(safeHttpUrl({ href: 'https://x.y' })).toBeUndefined()
  })
})
