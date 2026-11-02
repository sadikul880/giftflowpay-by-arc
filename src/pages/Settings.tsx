import { useState } from 'react'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { AddressLink, ConfirmDialog, Notice, PageHeader, Pill, WalletGate } from '@/components/ui'
import { useAllowance, useGlobals, useUsdcBalance, useWallet } from '@/hooks/useFlow'
import { useTxAction } from '@/hooks/useTx'
import { publicClient } from '@/lib/events'
import { fmtUsd } from '@/lib/format'
import { ACTIVE } from '@/lib/network'
import { loadPrefs, savePrefs, type Prefs } from '@/lib/prefs'
import { requireChain } from '@/onchain-facts'
import { readDeployBlock } from '@/lib/chain'
import { useQuery } from '@tanstack/react-query'

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5" style={{ borderColor: 'var(--border)' }}>
      <dt className="text-sm" style={{ color: 'var(--muted)' }}>{k}</dt>
      <dd className="min-w-0 break-all text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

export default function Settings() {
  const w = useWallet()
  const balance = useUsdcBalance(w.address)
  const allowance = useAllowance(w.address)
  const globals = useGlobals()
  const tx = useTxAction()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [confirm, setConfirm] = useState(false)
  const deploy = useQuery({ queryKey: ['deploy-block'], queryFn: readDeployBlock, enabled: Boolean(ACTIVE.contract) })
  const chain = requireChain(ACTIVE.chainId)

  const update = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p }
    setPrefs(next)
    savePrefs(next)
  }

  async function revoke() {
    if (!w.address || !ACTIVE.contract) return
    const owner = w.address
    const contract = ACTIVE.contract
    const receipt = await tx.run(async (_s, write) => {
      const { request } = await publicClient.simulateContract({ account: owner, address: ACTIVE.usdc, abi: erc20Abi, functionName: 'approve', args: [contract, 0n] })
      return write(request)
    })
    setConfirm(false)
    if (receipt) {
      toast.success('USDC approval reset')
      void allowance.refetch()
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle="Wallet, network and contract details, plus display preferences." />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Wallet</h2>
        <dl className="card divide-y">
          <Row k="Address">{w.address ? <AddressLink address={w.address} full /> : 'Not connected'}</Row>
          <Row k="USDC balance">{balance.data !== undefined ? `$${fmtUsd(balance.data)}` : '-'}</Row>
          <Row k="USDC approved for GiftFlow">{allowance.data !== undefined ? `$${fmtUsd(allowance.data)}` : '-'}</Row>
        </dl>
        {tx.error ? <Notice tone="error">{tx.error}</Notice> : null}
        {allowance.data !== undefined && allowance.data > 0n ? (
          <WalletGate className="btn btn-secondary">
            <button type="button" className="btn btn-secondary" disabled={tx.busy} onClick={() => setConfirm(true)}>Reset USDC approval to 0</button>
          </WalletGate>
        ) : null}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>GiftFlow approves only the exact amount of each campaign you fund, so an open approval is normally zero.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Network and contract</h2>
        <dl className="card divide-y">
          <Row k="Network">{ACTIVE.label} <Pill tone="warn">Testnet</Pill></Row>
          <Row k="Chain ID">{ACTIVE.chainId}</Row>
          <Row k="RPC">{chain.rpcUrls[0]}</Row>
          <Row k="Explorer"><a className="underline underline-offset-2" href={ACTIVE.explorerBase} target="_blank" rel="noopener noreferrer">{ACTIVE.explorerBase}</a></Row>
          <Row k="USDC token"><AddressLink address={ACTIVE.usdc} full /> ({ACTIVE.usdcDecimals} decimals)</Row>
          <Row k="GiftFlow contract">{ACTIVE.contract ? <AddressLink address={ACTIVE.contract} full /> : 'Not configured'}</Row>
          <Row k="Deployed at block">{deploy.data?.toString() ?? '-'}</Row>
          <Row k="Per-campaign limit">{globals.data ? `$${fmtUsd(globals.data.maxTotalAllocation)}` : '-'}</Row>
          <Row k="Contract status">{globals.data ? (globals.data.paused ? <Pill tone="warn">Paused</Pill> : <Pill tone="green">Operating</Pill>) : '-'}</Row>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Preferences</h2>
        <div className="card space-y-5 p-5">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Default new campaigns to a public recipient list</span>
            <input type="checkbox" className="size-4 accent-[var(--green)]" checked={prefs.defaultPublic} onChange={(e) => update({ defaultPublic: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Default claim window (days)</span>
            <input type="number" min={1} max={730} className="field !w-24 tabular-nums" value={prefs.defaultWindowDays} onChange={(e) => update({ defaultWindowDays: Math.min(730, Math.max(1, Number(e.target.value) || 30)) })} />
          </label>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Preferences are stored in this browser only. Campaigns, allocations, claims and refunds live on the blockchain; GiftFlow has no database.</p>
        </div>
      </section>

      <ConfirmDialog
        open={confirm}
        title="Reset USDC approval?"
        description="This sets GiftFlow's permission to spend your USDC back to zero. You will approve again the next time you fund a campaign."
        confirmLabel="Reset approval"
        busy={tx.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void revoke()}
      />
    </div>
  )
}
