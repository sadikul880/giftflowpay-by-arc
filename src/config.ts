/**
 * wagmi configuration
 */

import { http, createConfig, injected } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { arcTransport } from '@/lib/transport'

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTransport(),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
