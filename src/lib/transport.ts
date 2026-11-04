import { fallback, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { requireChain } from '@/onchain-facts'

/**
 * Arc Testnet JSON-RPC transport. The first URL is the verified endpoint from onchain-facts; viem's Arc
 * chain definition lists more public providers, used only when it fails or rate-limits (HTTP 429).
 * Concurrent requests are sent as one JSON-RPC batch, which keeps event scans under the rate limit.
 */
export const arcTransport = () => {
  const urls = [...new Set([...requireChain(arcTestnet.id).rpcUrls, ...arcTestnet.rpcUrls.default.http])]
  return fallback(urls.map((url) => http(url, { batch: true })))
}
