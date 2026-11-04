import { useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { Notice, Skeleton } from '@/components/ui'
import { useClaimedFlags } from '@/hooks/useFlow'
import type { CampaignView } from '@/lib/chain'
import type { campaignState } from '@/lib/flow'
import { claimKey, keyAddress, keyFromCode, normalizeCode } from '@/lib/flow'
import { proofFor, type Leaf, type ProofNode } from '@/lib/tree'
import { ClaimItem } from './Claim'

type State = ReturnType<typeof campaignState>

interface Allocation {
  leaf: Leaf
  proof: ProofNode[]
  key?: Hex
}

/** Open link: the master secret in the URL unlocks every share; the visitor takes any free one. */
export function OpenShare({ view, master, state, onClaimed }: { view: CampaignView; master: Hex; state: State; onClaimed: () => void }) {
  const c = view.campaign
  const flags = useClaimedFlags(view.id, c.recipientCount, c.claimedCount)
  const slots = useMemo(
    () => (view.leaves ?? []).filter((l) => !l.walletBound && keyAddress(claimKey(master, l.index)).toLowerCase() === l.account.toLowerCase()),
    [view.leaves, master],
  )
  const free = flags.data ? slots.filter((l) => !flags.data[l.index]) : []
  const [picked, setPicked] = useState<number>()
  const [locked, setLocked] = useState(false)
  // Random per visitor, so people opening the same link at once usually land on different shares.
  const [seed] = useState(() => Math.random())

  // Keep the chosen share until it is taken by someone else, then move to another free one.
  if (!locked && free.length > 0 && (picked === undefined || !free.some((l) => l.index === picked))) {
    setPicked(free[Math.floor(seed * free.length)].index)
  }

  if (!view.leaves || !view.tree) return <Notice tone="error">The recipient list for this campaign could not be loaded, so shares cannot be claimed here.</Notice>
  if (slots.length === 0) return <Notice tone="error">This link does not match the campaign. Ask the organizer for the full link.</Notice>
  if (flags.isLoading) return <Skeleton className="h-32 w-full" />
  const leaf = free.find((l) => l.index === picked) ?? slots.find((l) => l.index === picked)
  if (!leaf) {
    return <Notice>{c.cancelled ? 'This campaign was cancelled.' : state === 'expired' ? 'The claim window has closed.' : 'All shares of this campaign have been claimed.'}</Notice>
  }
  const alloc: Allocation = { leaf, proof: proofFor(view.tree, leaf.index), key: claimKey(master, leaf.index) }
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{locked ? 'Share claimed.' : `${free.length} of ${slots.length} shares left. Each share is the same amount.`}</p>
      <ClaimItem
        key={leaf.index}
        view={view}
        alloc={alloc}
        state={state}
        onClaimed={() => {
          setLocked(true)
          onClaimed()
        }}
        onFailed={() => void flags.refetch()}
      />
    </div>
  )
}

/** Secret-code claim: the code derives the claim key; the page finds the matching share. */
export function CodeEntry({ view, initial, state, onClaimed }: { view: CampaignView; initial?: string; state: State; onClaimed: () => void }) {
  const [text, setText] = useState(initial ?? '')
  const [submitted, setSubmitted] = useState(initial ?? '')
  const [error, setError] = useState<string>()

  const alloc = useMemo((): Allocation | undefined => {
    const code = normalizeCode(submitted)
    if (code.length !== 12 || !view.salt || !view.leaves || !view.tree) return undefined
    const key = keyFromCode(code, view.salt)
    const addr = keyAddress(key).toLowerCase()
    const leaf = view.leaves.find((l) => !l.walletBound && l.account.toLowerCase() === addr)
    return leaf ? { leaf, proof: proofFor(view.tree, leaf.index), key } : undefined
  }, [submitted, view])

  if (!view.leaves || !view.tree || !view.salt) return <Notice tone="error">The recipient list for this campaign could not be loaded, so codes cannot be checked here.</Notice>

  return (
    <div className="space-y-4">
      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          const code = normalizeCode(text)
          if (code.length !== 12) return setError('A code has 12 letters and numbers, like K7QX-9M2P-4TWD.')
          setError(undefined)
          setSubmitted(code)
        }}
      >
        <label className="space-y-1.5">
          <span className="label">Your secret code</span>
          <input
            className="field mono uppercase"
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(undefined)
            }}
          />
        </label>
        {error ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {submitted && !alloc && !error ? <p className="text-sm" style={{ color: 'var(--danger)' }}>That code is not valid for this campaign. Check it and try again.</p> : null}
        <button type="submit" className="btn btn-secondary w-full" disabled={!text.trim()}>Check code</button>
      </form>
      {alloc ? <ClaimItem key={alloc.leaf.index} view={view} alloc={alloc} state={state} onClaimed={onClaimed} /> : null}
    </div>
  )
}
