import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { erc20Abi, type Address } from 'viem'
import { useAccount, useReadContract, useSwitchChain } from 'wagmi'
import { readCampaigns, readClaimedFlags, readGlobals, loadCampaign, type Campaign } from '@/lib/chain'
import { findSetup } from '@/lib/events'
import { readDeployBlock } from '@/lib/chain'
import { decodeMeta } from '@/lib/flow'
import { ACTIVE } from '@/lib/network'

/** Wallet state plus a one-call switch to the app's network. */
export function useWallet() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ACTIVE.chainId
  return {
    address,
    isConnected,
    wrongChain,
    isSwitching,
    switchToTarget: () => switchChainAsync({ chainId: ACTIVE.chainId }),
  }
}

export function useUsdcBalance(address?: Address) {
  return useReadContract({
    address: ACTIVE.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ACTIVE.chainId,
    query: { enabled: Boolean(address), refetchInterval: 15000 },
  })
}

export function useAllowance(address?: Address) {
  return useReadContract({
    address: ACTIVE.usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && ACTIVE.contract ? [address, ACTIVE.contract] : undefined,
    chainId: ACTIVE.chainId,
    query: { enabled: Boolean(address && ACTIVE.contract) },
  })
}

/** Current unix seconds, refreshed so countdowns and statuses stay honest. */
export function useNow(intervalMs = 20000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useGlobals() {
  return useQuery({
    queryKey: ['globals', ACTIVE.chainId],
    queryFn: readGlobals,
    enabled: Boolean(ACTIVE.contract),
    refetchInterval: 30000,
  })
}

export function useCampaign(id: bigint | undefined) {
  return useQuery({
    queryKey: ['campaign', ACTIVE.chainId, id?.toString()],
    queryFn: () => loadCampaign(id as bigint),
    enabled: id !== undefined && Boolean(ACTIVE.contract),
    retry: false,
    refetchInterval: 30000,
  })
}

export function useClaimedFlags(id: bigint | undefined, count: number | undefined, claimedCount: number | undefined) {
  return useQuery({
    queryKey: ['claimed-flags', id?.toString(), count, claimedCount],
    queryFn: () => readClaimedFlags(id as bigint, count as number),
    enabled: id !== undefined && count !== undefined,
  })
}

/** Campaign name and type from the creation event. Cached per campaign. */
export function useCampaignMeta(id: bigint, createdAt: bigint) {
  return useQuery({
    queryKey: ['campaign-meta', ACTIVE.chainId, id.toString()],
    queryFn: async () => {
      const setup = await findSetup(id, createdAt, await readDeployBlock())
      return decodeMeta(setup?.created.metadata) ?? null
    },
    staleTime: Infinity,
    retry: 1,
  })
}

export interface CampaignRow {
  id: bigint
  campaign: Campaign
}

const CHUNK = 24

/**
 * Pages newest-first through campaign ids with contract reads only (no log scans).
 * `predicate` picks the rows to keep, e.g. public campaigns or those created by one wallet.
 */
export function useCampaignPages(key: string, predicate: (c: Campaign) => boolean, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['campaign-pages', ACTIVE.chainId, key],
    enabled: enabled && Boolean(ACTIVE.contract),
    initialPageParam: 0n,
    queryFn: async ({ pageParam }): Promise<{ rows: CampaignRow[]; next: bigint; total: bigint }> => {
      const g = await readGlobals()
      let cursor = pageParam === 0n ? g.campaignCount : pageParam
      const rows: CampaignRow[] = []
      while (cursor >= 1n && rows.length < 10) {
        const low = cursor - BigInt(CHUNK) + 1n < 1n ? 1n : cursor - BigInt(CHUNK) + 1n
        const ids: bigint[] = []
        for (let i = cursor; i >= low; i--) ids.push(i)
        const campaigns = await readCampaigns(ids)
        campaigns.forEach((c, i) => {
          if (predicate(c)) rows.push({ id: ids[i], campaign: c })
        })
        cursor = low - 1n
      }
      return { rows, next: cursor, total: g.campaignCount }
    },
    getNextPageParam: (last) => (last.next >= 1n ? last.next : undefined),
  })
}
