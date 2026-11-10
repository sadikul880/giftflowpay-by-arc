import { formatUnits, isAddress, type Address } from 'viem'
import { arcTestnet, baseSepolia } from 'viem/chains'
import { ACTIVE } from './network'

/**
 * Token and chain facts used by swap, bridge and balances. Every address below comes from Circle's published
 * contract-address pages (USDC and EURC testnet tables), not from a guess. Anything else is read from the chain
 * at runtime or entered by the user and marked unverified.
 */
export interface KnownToken {
  symbol: string
  name: string
  address: Address
  chainId: number
}

export const ARC_USDC: KnownToken = { symbol: 'USDC', name: 'USD Coin', address: ACTIVE.usdc, chainId: arcTestnet.id }
export const ARC_EURC: KnownToken = { symbol: 'EURC', name: 'Euro Coin', address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', chainId: arcTestnet.id }
export const BASE_SEPOLIA_USDC: KnownToken = { symbol: 'USDC', name: 'USD Coin', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', chainId: baseSepolia.id }

/** Tokens on Arc Testnet that the swap page offers by name. */
export const SWAP_TOKENS = [ARC_USDC, ARC_EURC] as const

export interface BridgeChain {
  /** App Kit chain identifier. */
  key: 'Arc_Testnet' | 'Base_Sepolia'
  label: string
  chainId: number
  usdc: KnownToken
  explorer: string
}

/** CCTP V2 testnet route between Base Sepolia and Arc Testnet. */
export const BRIDGE_CHAINS: Record<BridgeChain['key'], BridgeChain> = {
  Arc_Testnet: { key: 'Arc_Testnet', label: 'Arc Testnet', chainId: arcTestnet.id, usdc: ARC_USDC, explorer: 'https://explorer.testnet.arc.io' },
  Base_Sepolia: { key: 'Base_Sepolia', label: 'Base Sepolia', chainId: baseSepolia.id, usdc: BASE_SEPOLIA_USDC, explorer: 'https://sepolia.basescan.org' },
}

/** A token amount for display: up to six decimals, trailing zeros trimmed, thousands separators. */
export function fmtToken(raw: bigint, decimals: number, maxFraction = 6): string {
  const [int, frac = ''] = formatUnits(raw, decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cut = frac.slice(0, maxFraction).replace(/0+$/, '')
  return cut ? `${grouped}.${cut}` : grouped
}

/** cirBTC is wrapped Bitcoin on Arc, not native BTC. Matched by the symbol the token contract reports. */
export const isWrappedBitcoin = (symbol: string | undefined): boolean => symbol?.toLowerCase() === 'cirbtc'

export const parseTokenAddress = (v: string): Address | undefined => (isAddress(v.trim()) ? (v.trim() as Address) : undefined)
