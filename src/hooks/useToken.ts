import { erc20Abi, zeroAddress, type Address } from 'viem'
import { useReadContracts } from 'wagmi'

export interface TokenRead {
  symbol?: string
  decimals?: number
  balance?: bigint
  isLoading: boolean
  /** True when the address answered like an ERC-20 (it has a symbol and decimals). */
  isToken: boolean
}

/** Symbol, decimals and the owner's balance of an ERC-20, read from the chain it lives on. */
export function useToken(token: { address: Address; chainId: number } | undefined, owner?: Address): TokenRead {
  const base = token ? { address: token.address, abi: erc20Abi, chainId: token.chainId } : undefined
  const q = useReadContracts({
    contracts: base
      ? [
          { ...base, functionName: 'symbol' },
          { ...base, functionName: 'decimals' },
          { ...base, functionName: 'balanceOf', args: [owner ?? zeroAddress] },
        ]
      : [],
    allowFailure: true,
    query: { enabled: Boolean(token), refetchInterval: 20000 },
  })
  const [symbol, decimals, balance] = q.data ?? []
  const sym = symbol?.status === 'success' ? String(symbol.result) : undefined
  const dec = decimals?.status === 'success' ? Number(decimals.result) : undefined
  return {
    symbol: sym,
    decimals: dec,
    balance: owner && balance?.status === 'success' ? balance.result : undefined,
    isLoading: q.isLoading,
    isToken: sym !== undefined && dec !== undefined,
  }
}
