import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import type { Hex, TransactionReceipt } from 'viem'
import { useWriteContract } from 'wagmi'
import { publicClient } from '@/lib/events'
import { explainError, isUserRejection } from '@/lib/format'
import { ACTIVE } from '@/lib/network'

export type TxPhase = 'idle' | 'signing' | 'wallet' | 'confirming'

export interface TxStep {
  phase: (p: TxPhase) => void
  hash: (h: Hex) => void
}

/** Tracks one multi-step wallet action: phase, last hash and a readable error. */
export function useTxAction() {
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [error, setError] = useState<string>()
  const [hash, setHash] = useState<Hex>()
  const { writeContractAsync } = useWriteContract()

  const run = useCallback(async <T,>(fn: (s: TxStep, write: (req: unknown) => Promise<TransactionReceipt>) => Promise<T>): Promise<T | undefined> => {
    setError(undefined)
    setHash(undefined)
    const step: TxStep = { phase: setPhase, hash: setHash }
    const write = async (req: unknown): Promise<TransactionReceipt> => {
      setPhase('wallet')
      const h = await writeContractAsync({ ...(req as object), chainId: ACTIVE.chainId } as never)
      setHash(h)
      setPhase('confirming')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: h })
      if (receipt.status !== 'success') throw new Error('The transaction was reverted onchain.')
      return receipt
    }
    try {
      return await fn(step, write)
    } catch (e) {
      const msg = explainError(e)
      setError(msg)
      if (!isUserRejection(e)) toast.error(msg)
      return undefined
    } finally {
      setPhase('idle')
    }
  }, [writeContractAsync])

  return { phase, error, hash, busy: phase !== 'idle', run, clearError: () => setError(undefined) }
}
