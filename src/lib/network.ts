import type { Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'

export interface FlowNetwork {
  key: 'testnet'
  label: string
  chainId: typeof arcTestnet.id
  /** GiftFlow contract address for this network, from the VITE_ env key below. */
  contract: Address | undefined
  usdc: Address
  usdcDecimals: number
  explorerBase: string
  isTestnet: boolean
}

const fact = requireChain(arcTestnet.id)
const usdc = getUsdc(arcTestnet.id)
if (!usdc) throw new Error('USDC is not registered for Arc Testnet')

const raw = import.meta.env.VITE_GIFTFLOW_ADDRESS_TESTNET as string | undefined

const testnet: FlowNetwork = {
  key: 'testnet',
  label: fact.name,
  chainId: arcTestnet.id,
  contract: raw && /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw as Address) : undefined,
  usdc: usdc.address as Address,
  usdcDecimals: usdc.decimals,
  explorerBase: fact.explorerBase,
  isTestnet: true,
}

/** Networks the app can talk to. Mainnet is added only after an explicit go-ahead. */
export const NETWORKS = { testnet } as const

export const ACTIVE: FlowNetwork = NETWORKS.testnet

/** The Arc RPC rejects getLogs ranges above roughly 10,000 blocks (measured), so scan in smaller windows. */
export const EVENT_WINDOW_BLOCKS = 9000n

export function contractAddress(): Address {
  if (!ACTIVE.contract) throw new Error('The GiftFlow contract address is not configured')
  return ACTIVE.contract
}
