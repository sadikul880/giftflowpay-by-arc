/**
 * wagmi configuration
 */

import { http, createConfig, injected } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet, baseSepolia } from 'viem/chains'
import { arcTransport } from '@/lib/transport'

export const config = createConfig({
  // Base Sepolia is the other end of the testnet USDC bridge; mainnet is needed for ENS resolution.
  chains: [arcTestnet, baseSepolia, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTransport(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
  },
})
