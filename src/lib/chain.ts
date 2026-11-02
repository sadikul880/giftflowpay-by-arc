import { decodeMeta, decodePublished, type CampaignMeta } from './flow'
import { findSetup, publicClient, type CampaignSetup } from './events'
import { flowAbi } from './abi'
import { contractAddress } from './network'
import { buildTree, type Leaf, type SumTree } from './tree'

export type Campaign = Awaited<ReturnType<typeof readCampaign>>

const base = () => ({ address: contractAddress(), abi: flowAbi }) as const

export const readCampaign = (id: bigint) =>
  publicClient.readContract({ ...base(), functionName: 'getCampaign', args: [id] })

export const readCampaigns = (ids: bigint[]) =>
  publicClient.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...base(), functionName: 'getCampaign' as const, args: [id] as const })),
  })

export async function readClaimedFlags(id: bigint, count: number): Promise<boolean[]> {
  if (count === 0) return []
  return publicClient.multicall({
    allowFailure: false,
    contracts: Array.from({ length: count }, (_, i) => ({ ...base(), functionName: 'isClaimed' as const, args: [id, BigInt(i)] as const })),
  })
}

export async function readGlobals() {
  const [campaignCount, totalFunded, totalClaimed, totalRefunded, maxTotalAllocation, paused] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { ...base(), functionName: 'campaignCount' },
      { ...base(), functionName: 'totalFunded' },
      { ...base(), functionName: 'totalClaimed' },
      { ...base(), functionName: 'totalRefunded' },
      { ...base(), functionName: 'maxTotalAllocation' },
      { ...base(), functionName: 'paused' },
    ],
  })
  return { campaignCount, totalFunded, totalClaimed, totalRefunded, maxTotalAllocation, paused }
}

let deployBlock: Promise<bigint> | undefined
export function readDeployBlock(): Promise<bigint> {
  deployBlock ??= publicClient.readContract({ ...base(), functionName: 'DEPLOY_BLOCK' }).catch((e: unknown) => {
    deployBlock = undefined
    throw e
  })
  return deployBlock
}

/**
 * - verified: published list rebuilds the committed root and sums to the funded total
 * - mismatch: published list does not match the commitment
 * - private: recipient list was not published
 * - unavailable: the creation event could not be located
 */
export type Integrity = 'verified' | 'mismatch' | 'private' | 'unavailable'

export interface CampaignView {
  id: bigint
  campaign: Campaign
  setup?: CampaignSetup
  meta?: CampaignMeta
  leaves?: Leaf[]
  tree?: SumTree
  integrity: Integrity
  salt?: `0x${string}`
}

export async function loadCampaign(id: bigint): Promise<CampaignView> {
  const campaign = await readCampaign(id)
  let setup: CampaignSetup | undefined
  try {
    setup = await findSetup(id, BigInt(campaign.createdAt), await readDeployBlock())
  } catch {
    setup = undefined
  }
  const meta = decodeMeta(setup?.created.metadata)
  const view: CampaignView = { id, campaign, setup, meta, integrity: campaign.isPublic ? 'unavailable' : 'private', salt: setup?.created.salt }
  if (campaign.isPublic && setup?.published?.data) {
    const leaves = decodePublished(setup.published.data)
    try {
      const tree = buildTree(leaves)
      const ok = leaves.length === campaign.recipientCount && tree.root === campaign.merkleRoot && tree.total === campaign.totalAllocation
      return { ...view, leaves, tree, integrity: ok ? 'verified' : 'mismatch' }
    } catch {
      return { ...view, leaves, integrity: 'mismatch' }
    }
  }
  return view
}
