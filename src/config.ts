/**
 * wagmi configuration
 */

import { http, createConfig, injected } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { arcTransport } from '@/lib/transport'

export const config = createConfig({
  // Mainnet is needed for ENS resolution.
  chains: [arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTransport(),
    [mainnet.id]: http(),
  },
})
