import { useCallback, useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { useSignMessage } from 'wagmi'
import type { CampaignView } from '@/lib/chain'
import { claimKey, claimLink, keyAddress, keyMessage, leavesFromRows, masterFromSignature, rowsFromCsv } from '@/lib/flow'
import { explainError } from '@/lib/format'
import { ACTIVE, contractAddress } from '@/lib/network'
import { buildTree, proofFor, type Leaf, type SumTree } from '@/lib/tree'

export interface RecipientSource {
  leaves: Leaf[]
  tree: SumTree
  labels: Map<number, string>
}

/**
 * The organizer's working copy of a campaign's recipients. Public campaigns start from the published
 * list; private ones need the original CSV, which is rebuilt and checked against the onchain root.
 */
export function useRecipientSource(view: CampaignView | undefined) {
  const { signMessageAsync } = useSignMessage()
  const [imported, setImported] = useState<RecipientSource>()
  const [links, setLinks] = useState<Map<number, string>>()
  const [master, setMaster] = useState<Hex>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const base = useMemo<RecipientSource | undefined>(
    () => (view?.integrity === 'verified' && view.leaves && view.tree ? { leaves: view.leaves, tree: view.tree, labels: new Map() } : undefined),
    [view],
  )
  const source = imported ?? base

  const getMaster = useCallback(async (): Promise<Hex> => {
    if (master) return master
    if (!view?.salt) throw new Error('The campaign setup event could not be found, so claim keys cannot be recreated.')
    const sig = await signMessageAsync({ message: keyMessage(contractAddress(), ACTIVE.chainId, view.salt) })
    const m = masterFromSignature(sig)
    setMaster(m)
    return m
  }, [master, view, signMessageAsync])

  const buildLinks = useCallback(
    async (src: RecipientSource, m: Hex | undefined) => {
      if (!view) return
      const out = new Map<number, string>()
      for (const leaf of src.leaves) {
        const key = !leaf.walletBound && m ? claimKey(m, leaf.index) : undefined
        if (!leaf.walletBound && (!key || keyAddress(key).toLowerCase() !== leaf.account.toLowerCase())) {
          throw new Error('This wallet cannot recreate the campaign\u2019s claim keys. Sign with the wallet that created the campaign.')
        }
        out.set(leaf.index, await claimLink(view.id, leaf, { isPublic: view.campaign.isPublic, key, proof: proofFor(src.tree, leaf.index) }))
      }
      setLinks(out)
    },
    [view],
  )

  const generateLinks = useCallback(async () => {
    if (!source) return
    setBusy(true)
    setError(undefined)
    try {
      const m = source.leaves.some((l) => !l.walletBound) ? await getMaster() : undefined
      await buildLinks(source, m)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }, [source, getMaster, buildLinks])

  const importCsv = useCallback(
    async (text: string) => {
      if (!view) return
      setBusy(true)
      setError(undefined)
      try {
        const rows = rowsFromCsv(text)
        if (rows.length !== view.campaign.recipientCount) {
          throw new Error(`The file has ${rows.length} rows but this campaign has ${view.campaign.recipientCount} recipients.`)
        }
        const m = rows.some((r) => r.wallet.trim() === '') ? await getMaster() : undefined
        const leaves = leavesFromRows(rows, m)
        const tree = buildTree(leaves)
        if (tree.root !== view.campaign.merkleRoot || tree.total !== view.campaign.totalAllocation) {
          throw new Error('This file does not match the campaign\u2019s onchain commitment. Use the exact recipient list (same order and amounts) you funded with.')
        }
        const src: RecipientSource = { leaves, tree, labels: new Map(rows.map((r, i) => [i, r.label.trim()]).filter(([, l]) => l !== '') as Array<[number, string]>) }
        setImported(src)
        await buildLinks(src, m)
      } catch (e) {
        setError(explainError(e))
      } finally {
        setBusy(false)
      }
    },
    [view, getMaster, buildLinks],
  )

  return { source, links, busy, error, generateLinks, importCsv }
}
