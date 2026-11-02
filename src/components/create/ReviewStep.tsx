import { useMemo, useState } from 'react'
import { erc20Abi, parseEventLogs, type Hex } from 'viem'
import { useSignMessage } from 'wagmi'
import { Lock } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog, Notice, StepList, WalletGate, type StepStatus } from '@/components/ui'
import { draftTimes, useDraft } from '@/hooks/useDraft'
import { useAllowance, useGlobals, useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { flowAbi } from '@/lib/abi'
import { publicClient } from '@/lib/events'
import {
  checkRows,
  claimKey,
  claimLink,
  encodeMeta,
  encodePublished,
  keyMessage,
  leavesFromRows,
  LIMITS,
  masterFromSignature,
  randomSalt,
  typeLabel,
} from '@/lib/flow'
import { fmtDate, fmtUsd } from '@/lib/format'
import { contractAddress, ACTIVE } from '@/lib/network'
import { buildTree, proofFor } from '@/lib/tree'
import { buildShareLink } from '@/lib/share'
import type { LaunchResult } from './LaunchResult'

type Stage = 'idle' | 'key' | 'approve' | 'create'

export function ReviewStep({ now, onDone }: { now: number; onDone: (r: LaunchResult) => void }) {
  const { draft } = useDraft()
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  const allowance = useAllowance(w.address)
  const globals = useGlobals()
  const { signMessageAsync } = useSignMessage()
  const tx = useTxAction()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')

  const max = draft.isPublic ? LIMITS.publicRecipients : LIMITS.privateRecipients
  const check = useMemo(() => checkRows(draft.rows, max), [draft.rows, max])
  const times = draftTimes(draft, now)
  const total = check.total
  const short = balance.data !== undefined && balance.data < total
  const overCap = globals.data !== undefined && total > globals.data.maxTotalAllocation
  const needsApproval = allowance.data === undefined || allowance.data < total
  const blocked = short || overCap || !check.valid || Boolean(globals.data?.paused)

  async function launch() {
    if (!w.address) return
    const owner = w.address
    const contract = contractAddress()
    const done = await tx.run(async (s, write) => {
      const head = await publicClient.getBlock()
      const chainNow = Number(head.timestamp)
      const t = draftTimes(draft, chainNow)
      const salt = randomSalt()

      let master: Hex | undefined
      if (check.linkCount > 0) {
        setStage('key')
        s.phase('signing')
        master = masterFromSignature(await signMessageAsync({ message: keyMessage(contract, ACTIVE.chainId, salt) }))
      }
      const leaves = leavesFromRows(draft.rows, master)
      const tree = buildTree(leaves)
      if (tree.total !== total) throw new Error('The allocation total changed unexpectedly. Please review and try again.')

      const current = await publicClient.readContract({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'allowance', args: [owner, contract] })
      if (current < total) {
        setStage('approve')
        await write({ address: ACTIVE.usdc, abi: erc20Abi, functionName: 'approve', args: [contract, total] })
      }

      setStage('create')
      const metadata = encodeMeta({ n: draft.name.trim(), d: draft.description.trim(), t: draft.type, m: draft.message.trim() })
      const { request } = await publicClient.simulateContract({
        account: owner,
        address: contract,
        abi: flowAbi,
        functionName: 'createCampaign',
        args: [
          {
            merkleRoot: tree.root,
            totalAllocation: total,
            recipientCount: leaves.length,
            startTime: BigInt(t.start),
            claimDeadline: BigInt(t.deadline),
            isPublic: draft.isPublic,
            salt,
          },
          metadata,
          draft.isPublic ? encodePublished(leaves) : '0x',
        ],
      })
      const receipt = await write(request)
      const [created] = parseEventLogs({ abi: flowAbi, eventName: 'CampaignCreated', logs: receipt.logs })
      if (!created) throw new Error('Campaign creation could not be confirmed. Check the transaction on the explorer.')
      const id = created.args.campaignId

      const rows = await Promise.all(
        leaves.map(async (leaf, i) => ({
          index: i,
          label: draft.rows[i].label.trim(),
          wallet: leaf.walletBound ? leaf.account : '',
          amount: leaf.amount,
          link: await claimLink(id, leaf, {
            isPublic: draft.isPublic,
            key: master && !leaf.walletBound ? claimKey(master, i) : undefined,
            proof: proofFor(tree, i),
          }),
        })),
      )
      return {
        id,
        txHash: receipt.transactionHash,
        isPublic: draft.isPublic,
        name: draft.name.trim(),
        total,
        campaignLink: await buildShareLink(`/claim/${id}`),
        rows,
      } satisfies LaunchResult
    })
    setStage('idle')
    setOpen(false)
    if (done) {
      toast.success('Campaign funded and confirmed onchain')
      onDone(done)
      void balance.refetch()
    }
  }

  const status = (s: Stage, order: number): StepStatus => {
    const idx = ['idle', 'key', 'approve', 'create'].indexOf(stage)
    return idx > order ? 'done' : idx === order ? 'active' : 'todo'
  }
  const steps = [
    ...(check.linkCount > 0 ? [{ label: 'Create claim keys', hint: 'Sign a free message. No funds move.', status: status('key', 1) }] : []),
    ...(needsApproval ? [{ label: 'Approve USDC', hint: tx.phase === 'confirming' ? 'Waiting for the network to confirm…' : 'Confirm the approval in your wallet.', status: status('approve', 2) }] : []),
    { label: 'Fund and create campaign', hint: tx.phase === 'confirming' ? 'Waiting for the network to confirm…' : 'Confirm the transaction in your wallet.', status: status('create', 3) },
  ]

  const rows: Array<[string, React.ReactNode]> = [
    ['Name', draft.name.trim()],
    ['Type', typeLabel(draft.type)],
    ['Recipients', `${draft.rows.length} (${check.walletCount} wallets, ${check.linkCount} claim links)`],
    ['Total to fund', `${fmtUsd(total)} USDC`],
    ['Claims open', draft.startNow ? 'When funded' : fmtDate(times.start)],
    ['Claim deadline', fmtDate(times.deadline)],
    ['Recipient list', draft.isPublic ? 'Public' : 'Private'],
    ['Network', ACTIVE.label],
  ]

  return (
    <div className="space-y-6">
      <dl className="card divide-y text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <dt style={{ color: 'var(--muted)' }}>{k}</dt>
            <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-3">
        <div>
          <div className="label">Your USDC balance</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{balance.data !== undefined ? `$${fmtUsd(balance.data)}` : w.isConnected ? '…' : 'Connect wallet'}</div>
        </div>
        <div>
          <div className="label">Current approval</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{allowance.data !== undefined ? `$${fmtUsd(allowance.data)}` : '-'}</div>
        </div>
        <div>
          <div className="label">Needed</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">${fmtUsd(total)}</div>
        </div>
      </section>

      {short ? <Notice tone="error">Your balance is lower than the campaign total. You also need a little USDC for network fees. <a className="font-semibold underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC</a></Notice> : null}
      {overCap ? <Notice tone="error">This total is above the contract&rsquo;s current per-campaign limit of ${fmtUsd(globals.data?.maxTotalAllocation ?? 0n)}.</Notice> : null}
      {globals.data?.paused ? <Notice tone="error">GiftFlow is paused, so new campaigns cannot be funded right now.</Notice> : null}
      {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
      {tx.busy ? <div className="card p-5"><StepList steps={steps} /></div> : null}

      <WalletGate connectLabel="Connect wallet to fund">
        <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={blocked || tx.busy} onClick={() => setOpen(true)}>
          <Lock className="size-4" /> Fund ${fmtUsd(total)} and create campaign
        </button>
      </WalletGate>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Success is shown only after the network confirms each transaction.</p>

      <ConfirmDialog
        open={open}
        title="Fund this campaign?"
        description="Your USDC moves into the GiftFlow contract in one transaction. You can only take it back by refunding after the deadline, or cancelling before claims open."
        rows={[['Total', `${fmtUsd(total)} USDC`], ['Recipients', String(draft.rows.length)], ['Deadline', fmtDate(times.deadline)]]}
        confirmLabel={needsApproval ? 'Approve and fund' : 'Fund campaign'}
        busy={tx.busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void launch()}
      />
    </div>
  )
}
