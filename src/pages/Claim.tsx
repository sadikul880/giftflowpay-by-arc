import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { parseEventLogs, type Address, type Hex } from 'viem'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, Gift } from 'lucide-react'
import { AddressLink, ConfirmDialog, EmptyState, Notice, Skeleton, StateBadge, TxLink, WalletGate } from '@/components/ui'
import { useCampaign, useNow, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { flowAbi } from '@/lib/abi'
import type { CampaignView } from '@/lib/chain'
import { publicClient } from '@/lib/events'
import { campaignState, CLAIM_TYPES, keyAddress, parseClaimHash, type ClaimPayload } from '@/lib/flow'
import { fmtDate, fmtUsd, shortAddr, timeLeft } from '@/lib/format'
import { contractAddress, ACTIVE } from '@/lib/network'
import { privateKeyToAccount } from 'viem/accounts'
import { proofFor, verifyProof, type Leaf, type ProofNode } from '@/lib/tree'

function parseInput(text: string): { id?: string; tail?: string } {
  try {
    const u = new URL(text.trim())
    const m = /\/claim\/(\d+)/.exec(u.pathname)
    return { id: m?.[1], tail: `${u.search}${u.hash}` }
  } catch {
    return /^\d+$/.test(text.trim()) ? { id: text.trim() } : {}
  }
}

function LinkEntry() {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="display text-2xl sm:text-3xl">Claim USDC</h1>
      <p className="mb-6 mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>Open the claim link you were sent, or paste it here.</p>
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault()
          const { id, tail } = parseInput(text)
          if (!id) return setError('That does not look like a claim link. Paste the full link, or a campaign number.')
          void nav(`/claim/${id}${tail ?? ''}`)
        }}
      >
        <label className="space-y-1.5">
          <span className="label">Claim link</span>
          <input className="field mono !text-[13px]" placeholder="https://…/claim/12" value={text} onChange={(e) => { setText(e.target.value); setError(undefined) }} />
        </label>
        {error ? <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary w-full" disabled={!text.trim()}>Continue <ArrowRight className="size-4" /></button>
      </form>
    </div>
  )
}

export default function Claim() {
  const { id } = useParams()
  if (!id) return <LinkEntry />
  if (!/^\d+$/.test(id)) return <EmptyState title="Campaign not found" body="This claim link is not valid." action={<Link to="/claim" className="btn btn-secondary">Enter a link</Link>} />
  return <ClaimCampaign campaignId={BigInt(id)} />
}

interface Allocation {
  leaf: Leaf
  proof: ProofNode[]
  key?: Hex
}

/** Which allocations this visitor may claim, from the link they opened and the wallet they connected. */
function findAllocations(view: CampaignView, wallet: Address | undefined, hash: { key?: Hex; payload?: ClaimPayload }): { items: Allocation[]; problem?: string } {
  const c = view.campaign
  if (hash.payload) {
    const p = hash.payload
    const leaf: Leaf = { index: p.index, account: p.account, amount: p.amount, walletBound: p.walletBound }
    if (!verifyProof(leaf, p.proof, c.merkleRoot, c.totalAllocation, c.recipientCount)) return { items: [], problem: 'This claim link does not match the campaign. Ask the organizer for a fresh link.' }
    return { items: [{ leaf, proof: p.proof, key: p.key }] }
  }
  if (!view.leaves || !view.tree) {
    return { items: [], problem: c.isPublic ? 'The recipient list for this campaign could not be loaded or does not match its commitment.' : 'This is a private campaign. Open the personal claim link the organizer sent you.' }
  }
  const tree = view.tree
  if (hash.key) {
    const addr = keyAddress(hash.key).toLowerCase()
    const leaf = view.leaves.find((l) => !l.walletBound && l.account.toLowerCase() === addr)
    return leaf ? { items: [{ leaf, proof: proofFor(tree, leaf.index), key: hash.key }] } : { items: [], problem: 'This claim link does not match any allocation in the campaign.' }
  }
  if (!wallet) return { items: [] }
  const mine = view.leaves.filter((l) => l.walletBound && l.account.toLowerCase() === wallet.toLowerCase())
  return { items: mine.map((leaf) => ({ leaf, proof: proofFor(tree, leaf.index) })) }
}

function ClaimCampaign({ campaignId }: { campaignId: bigint }) {
  const w = useWallet()
  const now = useNow()
  const q = useCampaign(campaignId)
  // Link secrets arrive in the URL fragment, which is never sent to a server.
  const [hash] = useState(() => parseClaimHash(window.location.hash))

  if (q.isLoading) return <div className="mx-auto max-w-xl space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
  if (q.isError || !q.data) return <EmptyState title="Campaign not found" body="No campaign with this number exists on the current network." action={<Link to="/claim" className="btn btn-secondary">Enter a link</Link>} />

  const view = q.data
  const c = view.campaign
  const state = campaignState(c, now)
  const { items, problem } = findAllocations(view, w.address, hash)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="display text-2xl sm:text-3xl">{view.meta?.n || `Campaign #${campaignId}`}</h1>
          <StateBadge state={state} />
        </div>
        {view.meta?.d ? <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>{view.meta.d}</p> : null}
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Organized by <AddressLink address={c.creator} /></p>
      </div>

      {view.meta?.m ? <div className="inset px-4 py-3 text-sm italic" style={{ color: 'var(--ink-2)' }}>{view.meta.m}</div> : null}

      <dl className="card divide-y text-sm">
        {[
          ['Claims open', fmtDate(c.startTime)],
          ['Claim deadline', `${fmtDate(c.claimDeadline)}${state === 'active' ? ` (${timeLeft(c.claimDeadline, now)} left)` : ''}`],
          ['Funding secured', `$${fmtUsd(c.totalAllocation)} USDC in the contract`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <dt style={{ color: 'var(--muted)' }}>{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {problem ? <Notice tone="error">{problem}</Notice> : null}

      {!problem && items.length === 0 ? (
        w.address || hash.key ? (
          <Notice>
            {c.isPublic ? <>No allocation is listed for <span className="mono">{shortAddr(w.address ?? '')}</span>. Connect the wallet the organizer listed, or check the <Link to={`/verify/${campaignId}`} className="font-semibold underline">public recipient list</Link>.</> : 'No allocation found for this link.'}
          </Notice>
        ) : (
          <div className="card space-y-3 p-5">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect the wallet you were allocated USDC for to see your reward.</p>
            <WalletGate connectLabel="Connect wallet">{null}</WalletGate>
          </div>
        )
      ) : null}

      {items.map((a) => (
        <ClaimItem key={a.leaf.index} view={view} alloc={a} state={state} onClaimed={() => void q.refetch()} />
      ))}
    </div>
  )
}

function ClaimItem({ view, alloc, state, onClaimed }: { view: CampaignView; alloc: Allocation; state: ReturnType<typeof campaignState>; onClaimed: () => void }) {
  const w = useWallet()
  const tx = useTxAction()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<{ hash: Hex; amount: bigint }>()
  const { leaf } = alloc
  const id = view.id

  const claimedQ = useQuery({
    queryKey: ['is-claimed', id.toString(), leaf.index, done?.hash],
    queryFn: () => publicClient.readContract({ address: contractAddress(), abi: flowAbi, functionName: 'isClaimed', args: [id, BigInt(leaf.index)] }),
  })
  const claimed = claimedQ.data === true
  const wrongWallet = leaf.walletBound && w.address && w.address.toLowerCase() !== leaf.account.toLowerCase()

  async function claim() {
    if (!w.address) return
    const owner = w.address
    const res = await tx.run(async (s, write) => {
      let deadline = 0n
      let signature: Hex = '0x'
      if (!leaf.walletBound) {
        if (!alloc.key) throw new Error('This link is missing its claim key.')
        s.phase('signing')
        deadline = (await publicClient.getBlock()).timestamp + 1800n
        // The claim key signs for this wallet only, so a copied transaction cannot redirect the funds.
        signature = await privateKeyToAccount(alloc.key).signTypedData({
          domain: { name: 'GiftFlow', version: '1', chainId: ACTIVE.chainId, verifyingContract: contractAddress() },
          types: CLAIM_TYPES,
          primaryType: 'Claim',
          message: { campaignId: id, index: BigInt(leaf.index), recipient: owner, deadline },
        })
      }
      const { request } = await publicClient.simulateContract({
        account: owner,
        address: contractAddress(),
        abi: flowAbi,
        functionName: 'claim',
        args: [id, { index: BigInt(leaf.index), account: leaf.account, amount: leaf.amount, walletBound: leaf.walletBound }, alloc.proof, deadline, signature],
      })
      const receipt = await write(request)
      const [evt] = parseEventLogs({ abi: flowAbi, eventName: 'Claimed', logs: receipt.logs })
      if (!evt) throw new Error('The claim could not be confirmed. Check the transaction on the explorer.')
      return { hash: receipt.transactionHash, amount: evt.args.amount }
    })
    setOpen(false)
    if (res) {
      setDone(res)
      toast.success(`${fmtUsd(res.amount)} USDC claimed`)
      onClaimed()
    }
  }

  if (done) {
    return (
      <div className="card space-y-3 p-5">
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--green)' }}>
          <CheckCircle2 className="size-5" /> ${fmtUsd(done.amount)} USDC sent to {shortAddr(w.address ?? '')}
        </div>
        <TxLink hash={done.hash} label="Confirmed onchain" />
        <div className="flex gap-2 pt-1">
          <Link to="/dashboard" className="btn btn-secondary">Open overview</Link>
          <Link to={`/verify/${id}`} className="btn btn-ghost"><Gift className="size-4" /> View campaign</Link>
        </div>
      </div>
    )
  }

  const blockedReason =
    claimed ? 'This allocation has already been claimed.'
    : state === 'scheduled' ? `Claims open ${fmtDate(view.campaign.startTime)}.`
    : state === 'expired' ? 'The claim window has closed.'
    : state === 'cancelled' ? 'This campaign was cancelled.'
    : state === 'completed' ? 'This campaign is fully claimed.'
    : undefined

  return (
    <div className="card space-y-4 p-5">
      <div>
        <div className="label">Your reward</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">${fmtUsd(leaf.amount)} <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span></div>
        <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{leaf.walletBound ? <>Reserved for <AddressLink address={leaf.account} /></> : 'Redeemable by whoever holds this link, paid to the wallet you connect.'}</div>
      </div>
      {blockedReason ? <Notice>{blockedReason}</Notice> : null}
      {wrongWallet ? <Notice>This reward is reserved for {shortAddr(leaf.account)}. Connect that wallet to claim it.</Notice> : null}
      {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
      {!blockedReason ? (
        <WalletGate connectLabel="Connect wallet to claim">
          <button type="button" className="btn btn-primary w-full" disabled={Boolean(wrongWallet) || tx.busy || claimedQ.isLoading} onClick={() => setOpen(true)}>
            {tx.phase === 'wallet' ? 'Confirm in wallet…' : tx.phase === 'confirming' ? 'Confirming…' : tx.phase === 'signing' ? 'Preparing claim…' : `Claim $${fmtUsd(leaf.amount)}`}
          </button>
        </WalletGate>
      ) : null}
      <ConfirmDialog
        open={open}
        title="Claim your reward?"
        description="The USDC is sent straight to your connected wallet. You pay a small network fee in USDC."
        rows={[['Amount', `${fmtUsd(leaf.amount)} USDC`], ['To', shortAddr(w.address ?? '')], ['Campaign', view.meta?.n || `#${id}`]]}
        confirmLabel="Claim"
        busy={tx.busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void claim()}
      />
    </div>
  )
}
