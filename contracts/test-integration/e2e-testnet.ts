/**
 * End-to-end check against the live GiftFlow contract on Arc Testnet, using the same libraries as the app.
 * Two throwaway wallets are read from E2E_KEYS_FILE ({"a": "0x..", "b": "0x.."}). Wallet A needs testnet USDC.
 * Run: E2E_KEYS_FILE=/tmp/e2e-keys.json bun run e2e:testnet
 */
import { readFileSync } from 'node:fs'
import { createWalletClient, erc20Abi, http, parseEventLogs, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { flowAbi } from '../../src/lib/abi'
import { loadCampaign, readClaimedFlags } from '../../src/lib/chain'
import { publicClient, queryLogs } from '../../src/lib/events'
import {
  CLAIM_TYPES, claimKey, decodeClaimPayload, encodeClaimPayload, encodeMeta, encodePublished, keyAddress, leavesFromRows,
  masterFromSignature, newRow, randomSalt, keyMessage,
} from '../../src/lib/flow'
import { buildTree, proofFor, verifyProof, type Leaf } from '../../src/lib/tree'

const CONTRACT = (process.env.VITE_GIFTFLOW_ADDRESS_TESTNET ?? '') as Hex
const USDC = '0x3600000000000000000000000000000000000000' as const
const keys = JSON.parse(readFileSync(process.env.E2E_KEYS_FILE ?? '/tmp/e2e-keys.json', 'utf8')) as { a: Hex; b: Hex }
const rpc = 'https://rpc.testnet.arc.io'
const A = privateKeyToAccount(keys.a)
const B = privateKeyToAccount(keys.b)
const wa = createWalletClient({ account: A, chain: arcTestnet, transport: http(rpc) })
const wb = createWalletClient({ account: B, chain: arcTestnet, transport: http(rpc) })

let failed = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
}
const bal = (a: Hex) => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const reverts = (p: Promise<unknown>) => p.then(() => false, () => true)
const wait = async (hash: Hex) => {
  const r = await publicClient.waitForTransactionReceipt({ hash })
  if (r.status !== 'success') throw new Error('tx reverted ' + hash)
  return r
}
const cents = (n: number) => BigInt(n) * 10_000n // 0.01 USDC

async function create(wallet: typeof wa, leaves: Leaf[], opts: { isPublic: boolean; startOffset?: number; window?: number; name: string }) {
  const tree = buildTree(leaves)
  const head = await publicClient.getBlock()
  const start = head.timestamp + BigInt(opts.startOffset ?? 0)
  await wait(await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [CONTRACT, tree.total] }))
  const hash = await wallet.writeContract({
    address: CONTRACT,
    abi: flowAbi,
    functionName: 'createCampaign',
    args: [
      { merkleRoot: tree.root, totalAllocation: tree.total, recipientCount: leaves.length, startTime: start, claimDeadline: start + BigInt(opts.window ?? 7200), isPublic: opts.isPublic, salt: randomSalt() },
      encodeMeta({ n: opts.name, d: 'Live end-to-end check', t: 'other', m: '' }),
      opts.isPublic ? encodePublished(leaves) : '0x',
    ],
  })
  const receipt = await wait(hash)
  const [evt] = parseEventLogs({ abi: flowAbi, eventName: 'CampaignCreated', logs: receipt.logs })
  return { id: evt.args.campaignId, tree, gasUsed: receipt.gasUsed }
}

async function main() {
  if (!CONTRACT) throw new Error('VITE_GIFTFLOW_ADDRESS_TESTNET is not set')
  console.log('A balance', await bal(A.address), ' B balance', await bal(B.address))
  if ((await bal(B.address)) < 300_000n) await wait(await wa.writeContract({ address: USDC, abi: erc20Abi, functionName: 'transfer', args: [B.address, 500_000n] }))

  // ---- Public campaign with 100 recipients: 1 wallet B, 1 link-based, 98 other wallets.
  const salt = randomSalt()
  const sig = await wa.signMessage({ message: keyMessage(CONTRACT, arcTestnet.id, salt) })
  const master = masterFromSignature(sig)
  const rows = [
    newRow({ wallet: B.address, amount: '0.50', label: 'Bob' }),
    newRow({ wallet: '', amount: '0.25', label: 'Link recipient' }),
    ...Array.from({ length: 98 }, () => newRow({ wallet: privateKeyToAccount(generatePrivateKey()).address, amount: '0.05' })),
  ]
  const leaves = leavesFromRows(rows, master)
  const pub = await create(wa, leaves, { isPublic: true, name: 'E2E public campaign (100 recipients)' })
  ok('public campaign with 100 recipients created', pub.id > 0n, `id=${pub.id} gas=${pub.gasUsed}`)

  const view = await loadCampaign(pub.id)
  ok('frontend rebuilt the published list and it matches the onchain commitment', view.integrity === 'verified' && view.leaves?.length === 100)
  ok('campaign name read back from the creation event', view.meta?.n === 'E2E public campaign (100 recipients)')

  // ---- Wallet-bound claim by B; A cannot claim B's allocation.
  const tree = view.tree!
  const bLeaf = view.leaves![0]
  const bAlloc = { index: 0n, account: bLeaf.account, amount: bLeaf.amount, walletBound: true }
  const bProof = proofFor(tree, 0)
  ok('local proof verification matches the contract rules', verifyProof(bLeaf, bProof, view.campaign.merkleRoot, view.campaign.totalAllocation, 100))
  ok('another wallet cannot claim a bound allocation', await reverts(publicClient.simulateContract({ account: A, address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, bAlloc, bProof, 0n, '0x'] })))
  const bBefore = await bal(B.address)
  const claimRcpt = await wait(await wb.writeContract({ address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, bAlloc, bProof, 0n, '0x'] }))
  const [claimed] = parseEventLogs({ abi: flowAbi, eventName: 'Claimed', logs: claimRcpt.logs })
  ok('wallet-bound claim paid wallet B', claimed.args.recipient === B.address && claimed.args.amount === bAlloc.amount)
  ok('wallet B balance increased by the reward minus fees', (await bal(B.address)) > bBefore + bAlloc.amount - 100_000n)
  ok('double claim reverts', await reverts(publicClient.simulateContract({ account: B, address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, bAlloc, bProof, 0n, '0x'] })))
  ok('tampered amount reverts (invalid proof)', await reverts(publicClient.simulateContract({ account: B, address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, { ...bAlloc, index: 2n }, bProof, 0n, '0x'] })))

  // ---- Link-based claim: key recovered from the creator's signature, claimed by B.
  const key = claimKey(master, 1)
  const lLeaf = view.leaves![1]
  ok('link-based allocation is owned by the derived key', lLeaf.account.toLowerCase() === keyAddress(key).toLowerCase() && !lLeaf.walletBound)
  const deadline = (await publicClient.getBlock()).timestamp + 1800n
  const keySig = await privateKeyToAccount(key).signTypedData({ domain: { name: 'GiftFlow', version: '1', chainId: arcTestnet.id, verifyingContract: CONTRACT }, types: CLAIM_TYPES, primaryType: 'Claim', message: { campaignId: pub.id, index: 1n, recipient: B.address, deadline } })
  const lAlloc = { index: 1n, account: lLeaf.account, amount: lLeaf.amount, walletBound: false }
  ok('link claim signed for B cannot be submitted by A', await reverts(publicClient.simulateContract({ account: A, address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, lAlloc, proofFor(tree, 1), deadline, keySig] })))
  await wait(await wb.writeContract({ address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [pub.id, lAlloc, proofFor(tree, 1), deadline, keySig] }))
  const flags = await readClaimedFlags(pub.id, 100)
  ok('claim bitmap reflects both claims', flags[0] && flags[1] && flags.filter(Boolean).length === 2)

  // ---- Direct distribution of 20 wallet-bound rows by the creator.
  const batch = view.leaves!.slice(2, 22)
  const before = await bal(batch[0].account)
  await wait(await wa.writeContract({ address: CONTRACT, abi: flowAbi, functionName: 'distribute', args: [pub.id, batch.map((l) => ({ a: { index: BigInt(l.index), account: l.account, amount: l.amount, walletBound: true }, proof: proofFor(tree, l.index) }))] }))
  ok('direct distribution paid 20 wallets', (await bal(batch[0].account)) - before === batch[0].amount && (await readClaimedFlags(pub.id, 100)).filter(Boolean).length === 22)
  ok('non-creator cannot distribute', await reverts(publicClient.simulateContract({ account: B, address: CONTRACT, abi: flowAbi, functionName: 'distribute', args: [pub.id, [{ a: { index: 30n, account: view.leaves![30].account, amount: view.leaves![30].amount, walletBound: true }, proof: proofFor(tree, 30) }]] })))
  ok('refund before the deadline reverts', await reverts(publicClient.simulateContract({ account: A, address: CONTRACT, abi: flowAbi, functionName: 'refund', args: [pub.id] })))
  const after = await loadCampaign(pub.id)
  ok('campaign totals reflect claims', after.campaign.claimedCount === 22 && after.campaign.claimed === cents(50) + cents(25) + cents(5) * 20n)

  // ---- Event queries used by the app.
  const head = await publicClient.getBlockNumber()
  const mine = await queryLogs({ from: head - 2000n, to: head, kinds: ['created', 'claimed', 'refunded', 'cancelled'], who: A.address })
  ok('creator activity query finds the creation event', mine.some((e) => e.kind === 'created' && e.campaignId === pub.id))
  const bobEvents = await queryLogs({ from: head - 2000n, to: head, kinds: ['claimed'], who: B.address })
  ok('recipient activity query finds the claims', bobEvents.length >= 2)

  // ---- Private campaign: no list published; claim through the compact link payload.
  const pLeaves: Leaf[] = [
    { index: 0, account: B.address, amount: cents(20), walletBound: true },
    { index: 1, account: privateKeyToAccount(generatePrivateKey()).address, amount: cents(10), walletBound: true },
    { index: 2, account: privateKeyToAccount(generatePrivateKey()).address, amount: cents(10), walletBound: true },
  ]
  const priv = await create(wa, pLeaves, { isPublic: false, name: 'E2E private campaign' })
  const privView = await loadCampaign(priv.id)
  ok('private campaign publishes no recipient list', privView.integrity === 'private' && !privView.leaves)
  const payload = decodeClaimPayload(encodeClaimPayload({ ...pLeaves[0], proof: proofFor(priv.tree, 0) }))!
  ok('claim link payload round-trips', verifyProof({ index: payload.index, account: payload.account, amount: payload.amount, walletBound: payload.walletBound }, payload.proof, priv.tree.root, priv.tree.total, 3))
  await wait(await wb.writeContract({ address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [priv.id, { index: 0n, account: payload.account, amount: payload.amount, walletBound: true }, payload.proof, 0n, '0x'] }))
  ok('private campaign claim from the link payload succeeded', (await readClaimedFlags(priv.id, 3))[0] === true)

  // ---- Scheduled campaign can be cancelled for a full refund, only by the creator.
  const sch = await create(wa, [{ index: 0, account: B.address, amount: cents(10), walletBound: true }], { isPublic: true, startOffset: 600, name: 'E2E scheduled campaign' })
  ok('claims are not open before the start time', await reverts(publicClient.simulateContract({ account: B, address: CONTRACT, abi: flowAbi, functionName: 'claim', args: [sch.id, { index: 0n, account: B.address, amount: cents(10), walletBound: true }, [], 0n, '0x'] })))
  ok('non-creator cannot cancel', await reverts(publicClient.simulateContract({ account: B, address: CONTRACT, abi: flowAbi, functionName: 'cancelCampaign', args: [sch.id] })))
  const aBefore = await bal(A.address)
  await wait(await wa.writeContract({ address: CONTRACT, abi: flowAbi, functionName: 'cancelCampaign', args: [sch.id] }))
  const cancelled = await loadCampaign(sch.id)
  ok('cancellation refunded the full amount', cancelled.campaign.cancelled && (await bal(A.address)) > aBefore + cents(10) - 100_000n)

  console.log(failed === 0 ? '\nAll checks passed' : `\n${failed} check(s) failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
