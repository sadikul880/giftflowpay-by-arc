/**
 * End-to-end test of the app's own libraries (Merkle tree, claim keys, codes, gift plans, payroll batching)
 * against the real GiftFlow contract on a local Anvil node. It needs no testnet funds.
 *
 *   bash scripts/e2e-local.sh        # starts Anvil in Docker, deploys, runs this file, stops Anvil
 *
 * The test skips itself when no node answers on ANVIL_URL.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import {
  createPublicClient, createTestClient, createWalletClient, getAddress, http, parseEther, walletActions, publicActions,
  type Address, type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { flowAbi } from '../../src/lib/abi'
import {
  CLAIM_TYPES, claimKey, codeFor, encodePublished, keyAddress, keyFromCode, keyMessage, leavesFromRows, masterFromSignature,
  newRow, randomSalt, type RecipientRow,
} from '../../src/lib/flow'
import { giftPlan } from '../../src/lib/gift'
import { splitBatches } from '../../src/lib/payroll'
import { buildTree, proofFor, type Leaf, type SumTree } from '../../src/lib/tree'

const URL = process.env.ANVIL_URL ?? 'http://127.0.0.1:8545'
// The first two contracts deployed by Anvil's well-known dev account (public, test-only), as printed by DeployLocal.
const USDC = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address
const FLOW = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address
// Anvil's public dev key #0. It holds only fake ETH on a throwaway local chain.
const DEV_KEY = (process.env.ANVIL_DEV_KEY ?? '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as Hex

const erc20Abi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

async function reachable(): Promise<boolean> {
  try {
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}
const up = await reachable()

const pub = createPublicClient({ chain: foundry, transport: http(URL) })
const node = createTestClient({ chain: foundry, mode: 'anvil', transport: http(URL) }).extend(publicActions).extend(walletActions)

const wallets = new Map<string, ReturnType<typeof newWallet>>()
function newWallet(key: Hex = generatePrivateKey()) {
  const account = privateKeyToAccount(key)
  return { account, client: createWalletClient({ account, chain: foundry, transport: http(URL) }) }
}
async function funded(label: string, usdc = 1_000_000n * 10n ** 6n) {
  const w = newWallet()
  wallets.set(label, w)
  await node.setBalance({ address: w.account.address, value: parseEther('100') })
  const dev = newWallet(DEV_KEY)
  await dev.client.writeContract({ address: USDC, abi: erc20Abi, functionName: 'mint', args: [w.account.address, usdc] })
  await w.client.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [FLOW, usdc] })
  return w
}
const bal = (a: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const now = async () => Number((await pub.getBlock()).timestamp)

type Wallet = ReturnType<typeof newWallet>

async function create(w: Wallet, leaves: Leaf[], o: { isPublic: boolean; start?: number; window?: number }) {
  const tree = buildTree(leaves)
  const t = await now()
  const start = BigInt(o.start ?? t)
  const hash = await w.client.writeContract({
    address: FLOW,
    abi: flowAbi,
    functionName: 'createCampaign',
    args: [
      { merkleRoot: tree.root, totalAllocation: tree.total, recipientCount: leaves.length, startTime: start, claimDeadline: start + BigInt(o.window ?? 7200), isPublic: o.isPublic, salt: randomSalt() },
      JSON.stringify({ n: 'local e2e', d: '', t: 'other', m: '' }),
      o.isPublic ? encodePublished(leaves) : '0x',
    ],
  })
  await pub.waitForTransactionReceipt({ hash })
  const id = await pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'campaignCount' })
  return { id, tree }
}

async function claimWithKey(w: Wallet, id: bigint, leaf: Leaf, tree: SumTree, key: Hex) {
  const deadline = BigInt((await now()) + 1800)
  const signature = await privateKeyToAccount(key).signTypedData({
    domain: { name: 'GiftFlow', version: '1', chainId: foundry.id, verifyingContract: FLOW },
    types: CLAIM_TYPES,
    primaryType: 'Claim',
    message: { campaignId: id, index: BigInt(leaf.index), recipient: w.account.address, deadline },
  })
  return w.client.writeContract({
    address: FLOW, abi: flowAbi, functionName: 'claim',
    args: [id, { index: BigInt(leaf.index), account: leaf.account, amount: leaf.amount, walletBound: false }, proofFor(tree, leaf.index), deadline, signature],
  })
}

async function claimBound(w: Wallet, id: bigint, leaf: Leaf, tree: SumTree) {
  return w.client.writeContract({
    address: FLOW, abi: flowAbi, functionName: 'claim',
    args: [id, { index: BigInt(leaf.index), account: leaf.account, amount: leaf.amount, walletBound: true }, proofFor(tree, leaf.index), 0n, '0x'],
  })
}

const done = async (p: Promise<Hex>) => pub.waitForTransactionReceipt({ hash: await p })

/** The contract's custom error name behind a failed call, or the message if it is not a known revert. */
async function revertOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    let cur: unknown = e
    while (cur && typeof cur === 'object') {
      const o = cur as { data?: { errorName?: string }; cause?: unknown; message?: string }
      if (o.data?.errorName) return o.data.errorName
      if (!o.cause) return o.message ?? String(e)
      cur = o.cause
    }
    return String(e)
  }
  return 'NO_REVERT'
}

const D = describe.skipIf(!up)

D('GiftFlow with the app libraries on a local chain', () => {
  beforeAll(async () => {
    const code = await pub.getCode({ address: FLOW })
    if (!code || code === '0x') throw new Error('GiftFlow is not deployed at the expected address; run scripts/e2e-local.sh')
  })

  test('gift with a secret code: right code claims once, wrong code and replays fail', async () => {
    const sender = await funded('sender')
    const alice = await funded('alice', 0n)
    const eve = await funded('eve', 0n)
    const salt = randomSalt()
    const master = masterFromSignature(await sender.client.signMessage({ message: keyMessage(FLOW, foundry.id, salt) }))
    const plan = giftPlan('code', 25_000_000n, { master, salt })
    const { id, tree } = await create(sender, [plan.leaf], { isPublic: true })

    // Eve guesses a different code: the contract rejects it.
    const wrong = keyFromCode('AAAA-BBBB-CCCC', salt)
    expect(await revertOf(claimWithKey(eve, id, plan.leaf, tree, wrong))).toBe('InvalidSignature')

    const before = await bal(alice.account.address)
    await done(claimWithKey(alice, id, plan.leaf, tree, plan.key as Hex))
    expect((await bal(alice.account.address)) - before).toBe(25_000_000n)

    // The code is single use, for anyone.
    expect(await revertOf(claimWithKey(eve, id, plan.leaf, tree, plan.key as Hex))).toBe('AlreadyClaimed')
    expect(await pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'isClaimed', args: [id, 0n] })).toBe(true)
  })

  test('a signature made for one wallet cannot be used by another', async () => {
    const sender = await funded('s2')
    const alice = await funded('a2', 0n)
    const eve = await funded('e2', 0n)
    const plan = giftPlan('link', 10_000_000n, { master: ('0x' + '42'.repeat(32)) as Hex })
    const { id, tree } = await create(sender, [plan.leaf], { isPublic: true })
    const deadline = BigInt((await now()) + 1800)
    const forAlice = await privateKeyToAccount(plan.key as Hex).signTypedData({
      domain: { name: 'GiftFlow', version: '1', chainId: foundry.id, verifyingContract: FLOW }, types: CLAIM_TYPES, primaryType: 'Claim',
      message: { campaignId: id, index: 0n, recipient: alice.account.address, deadline },
    })
    const args = [id, { index: 0n, account: plan.leaf.account, amount: plan.leaf.amount, walletBound: false }, proofFor(tree, 0), deadline, forAlice] as const
    expect(await revertOf(eve.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'claim', args }))).toBe('InvalidSignature')
    await done(alice.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'claim', args }))
    expect(await bal(alice.account.address)).toBe(10_000_000n)
  })

  test('gift for a named wallet: only that wallet can claim', async () => {
    const sender = await funded('s3')
    const bob = await funded('b3', 0n)
    const eve = await funded('e3', 0n)
    const plan = giftPlan('wallet', 5_000_000n, { wallet: bob.account.address })
    const { id, tree } = await create(sender, [plan.leaf], { isPublic: true })
    expect(await revertOf(claimBound(eve, id, plan.leaf, tree))).toBe('WalletMismatch')
    await done(claimBound(bob, id, plan.leaf, tree))
    expect(await bal(bob.account.address)).toBe(5_000_000n)
  })

  test('one shared link with 5 shares: each share once, extra claims on a used share fail', async () => {
    const sender = await funded('s4')
    const a = await funded('a4', 0n)
    const b = await funded('b4', 0n)
    const master = ('0x' + '07'.repeat(32)) as Hex
    const rows: RecipientRow[] = Array.from({ length: 5 }, () => newRow({ amount: '5' }))
    const leaves = leavesFromRows(rows, master)
    const { id, tree } = await create(sender, leaves, { isPublic: true })
    await done(claimWithKey(a, id, leaves[0], tree, claimKey(master, 0)))
    await done(claimWithKey(b, id, leaves[3], tree, claimKey(master, 3)))
    expect(await revertOf(claimWithKey(b, id, leaves[0], tree, claimKey(master, 0)))).toBe('AlreadyClaimed')
    const c = await pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'getCampaign', args: [id] })
    expect(c.claimedCount).toBe(2)
    expect(c.claimed).toBe(10_000_000n)
  })

  test('100 secret codes: the first, a middle and the last index all claim', async () => {
    const sender = await funded('s5')
    const salt = randomSalt()
    const master = ('0x' + '09'.repeat(32)) as Hex
    const rows: RecipientRow[] = Array.from({ length: 100 }, () => newRow({ amount: '5' }))
    const leaves = leavesFromRows(rows, master, (i) => keyFromCode(codeFor(master, i), salt))
    const { id, tree } = await create(sender, leaves, { isPublic: true })
    for (const i of [0, 49, 99]) {
      const w = await funded(`code-${i}`, 0n)
      await done(claimWithKey(w, id, leaves[i], tree, keyFromCode(codeFor(master, i), salt)))
      expect(await bal(w.account.address)).toBe(5_000_000n)
      expect(keyAddress(keyFromCode(codeFor(master, i), salt))).toBe(leaves[i].account)
    }
  }, 60_000)

  test('payroll for 100 employees: two batches of 50 pay everyone exactly once', async () => {
    const boss = await funded('boss')
    const staff = Array.from({ length: 100 }, () => getAddress(privateKeyToAccount(generatePrivateKey()).address))
    const rows = staff.map((w, i) => newRow({ wallet: w, amount: String(10 + i), label: `E${i}` }))
    const leaves = leavesFromRows(rows, undefined)
    const { id, tree } = await create(boss, leaves, { isPublic: false })
    const entry = (l: Leaf) => ({ a: { index: BigInt(l.index), account: l.account, amount: l.amount, walletBound: true }, proof: proofFor(tree, l.index) })
    for (const batch of splitBatches(leaves, 50)) {
      await done(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'distribute', args: [id, batch.map(entry)] }))
    }
    for (const l of leaves) expect(await bal(l.account)).toBe(l.amount)
    const c = await pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'getCampaign', args: [id] })
    expect(c.claimedCount).toBe(100)
    expect(c.claimed).toBe(c.totalAllocation)
    // Paying again is impossible: the whole batch reverts and nobody is paid twice.
    expect(await revertOf(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'distribute', args: [id, splitBatches(leaves, 50)[0].map(entry)] }))).toBe('AlreadyClaimed')
    expect(await bal(leaves[0].account)).toBe(leaves[0].amount)
  }, 90_000)

  test('payroll resume: after one batch, only the unpaid wallets are sent', async () => {
    const boss = await funded('boss2')
    const staff = Array.from({ length: 60 }, () => getAddress(privateKeyToAccount(generatePrivateKey()).address))
    const leaves = leavesFromRows(staff.map((w) => newRow({ wallet: w, amount: '3' })), undefined)
    const { id, tree } = await create(boss, leaves, { isPublic: false })
    const entry = (l: Leaf) => ({ a: { index: BigInt(l.index), account: l.account, amount: l.amount, walletBound: true }, proof: proofFor(tree, l.index) })
    await done(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'distribute', args: [id, leaves.slice(0, 50).map(entry)] }))
    // The app reads isClaimed for every row, then sends the rest.
    const flags = await Promise.all(leaves.map((l) => pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'isClaimed', args: [id, BigInt(l.index)] })))
    const pending = leaves.filter((l) => !flags[l.index])
    expect(pending).toHaveLength(10)
    await done(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'distribute', args: [id, pending.map(entry)] }))
    for (const l of leaves) expect(await bal(l.account)).toBe(3_000_000n)
  }, 60_000)

  test('refund after the deadline returns exactly the unclaimed part, once, to the creator only', async () => {
    const boss = await funded('boss3')
    const bob = await funded('bob3', 0n)
    const rows = [newRow({ wallet: bob.account.address, amount: '4' }), newRow({ wallet: getAddress(privateKeyToAccount(generatePrivateKey()).address), amount: '6' })]
    const leaves = leavesFromRows(rows, undefined)
    const { id, tree } = await create(boss, leaves, { isPublic: false, window: 3600 })
    await done(claimBound(bob, id, leaves[0], tree))
    expect(await revertOf(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'refund', args: [id] }))).toBe('RefundNotAvailable')
    await node.increaseTime({ seconds: 3700 })
    await node.mine({ blocks: 1 })
    expect(await revertOf(bob.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'refund', args: [id] }))).toBe('NotCampaignCreator')
    const before = await bal(boss.account.address)
    await done(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'refund', args: [id] }))
    expect((await bal(boss.account.address)) - before).toBe(6_000_000n)
    expect(await revertOf(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'refund', args: [id] }))).toBe('NothingToRefund')
    // Claims are closed after the deadline.
    expect(await revertOf(claimBound(bob, id, leaves[0], tree))).toBe('ClaimWindowClosed')
  }, 60_000)

  test('cancel before the start returns everything and blocks claims', async () => {
    const boss = await funded('boss4')
    const bob = await funded('bob4', 0n)
    const leaves = leavesFromRows([newRow({ wallet: bob.account.address, amount: '9' })], undefined)
    const start = (await now()) + 3600
    const { id, tree } = await create(boss, leaves, { isPublic: false, start, window: 7200 })
    expect(await revertOf(claimBound(bob, id, leaves[0], tree))).toBe('ClaimsNotStarted')
    const before = await bal(boss.account.address)
    await done(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'cancelCampaign', args: [id] }))
    expect((await bal(boss.account.address)) - before).toBe(9_000_000n)
    await node.increaseTime({ seconds: 3700 })
    await node.mine({ blocks: 1 })
    expect(await revertOf(claimBound(bob, id, leaves[0], tree))).toBe('CampaignIsCancelled')
  }, 60_000)

  test('funding is checked against the committed total: a tree that overstates the deposit cannot pay out more', async () => {
    const boss = await funded('boss5')
    const leaves = leavesFromRows([newRow({ wallet: getAddress(privateKeyToAccount(generatePrivateKey()).address), amount: '2' })], undefined)
    const tree = buildTree(leaves)
    const t = await now()
    // Declaring a smaller total than the tree's own sum is rejected at claim time because the proof sums to a different total.
    const hash = await boss.client.writeContract({
      address: FLOW, abi: flowAbi, functionName: 'createCampaign',
      args: [{ merkleRoot: tree.root, totalAllocation: 1_000_000n, recipientCount: 1, startTime: BigInt(t), claimDeadline: BigInt(t + 7200), isPublic: false, salt: randomSalt() }, '{}', '0x'],
    })
    await pub.waitForTransactionReceipt({ hash })
    const id = await pub.readContract({ address: FLOW, abi: flowAbi, functionName: 'campaignCount' })
    const entry = { a: { index: 0n, account: leaves[0].account, amount: leaves[0].amount, walletBound: true }, proof: proofFor(tree, 0) }
    expect(await revertOf(boss.client.writeContract({ address: FLOW, abi: flowAbi, functionName: 'distribute', args: [id, [entry]] }))).toBe('InvalidProof')
  })
})
