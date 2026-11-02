import { encodeAbiParameters, keccak256, parseAbiParameters, zeroHash, type Address, type Hex } from 'viem'

/**
 * Tagged Merkle sum tree, matching GiftFlow.sol exactly.
 *   leaf = keccak256(abi.encode(0, index, account, amount, walletBound)), sum = amount
 *   node = keccak256(abi.encode(1, leftHash, leftSum, rightHash, rightSum)), sum = leftSum + rightSum
 * Padded to a power of two with empty leaves (hash 0x00, sum 0). A valid proof therefore proves the
 * allocations total the funded amount.
 */
export interface Leaf {
  index: number
  account: Address
  amount: bigint
  walletBound: boolean
}

export interface ProofNode {
  hash: Hex
  sum: bigint
}

export interface SumTree {
  root: Hex
  total: bigint
  depth: number
  levels: ProofNode[][]
}

const LEAF_ABI = parseAbiParameters('uint256 tag, uint256 index, address account, uint256 amount, bool walletBound')
const NODE_ABI = parseAbiParameters('uint256 tag, bytes32 lh, uint256 ls, bytes32 rh, uint256 rs')

export const leafHash = (l: Leaf): Hex =>
  keccak256(encodeAbiParameters(LEAF_ABI, [0n, BigInt(l.index), l.account, l.amount, l.walletBound]))

export const nodeHash = (l: ProofNode, r: ProofNode): Hex =>
  keccak256(encodeAbiParameters(NODE_ABI, [1n, l.hash, l.sum, r.hash, r.sum]))

export function depthFor(count: number): number {
  let depth = 0
  while (1 << depth < count) depth++
  return depth
}

export function buildTree(leaves: Leaf[]): SumTree {
  if (leaves.length === 0) throw new Error('A campaign needs at least one recipient')
  const depth = depthFor(leaves.length)
  const width = 1 << depth
  const level0: ProofNode[] = Array.from({ length: width }, (_, i) =>
    i < leaves.length ? { hash: leafHash(leaves[i]), sum: leaves[i].amount } : { hash: zeroHash, sum: 0n },
  )
  const levels = [level0]
  for (let d = 0; d < depth; d++) {
    const prev = levels[d]
    const next: ProofNode[] = []
    for (let i = 0; i < prev.length; i += 2) {
      next.push({ hash: nodeHash(prev[i], prev[i + 1]), sum: prev[i].sum + prev[i + 1].sum })
    }
    levels.push(next)
  }
  const top = levels[depth][0]
  return { root: top.hash, total: top.sum, depth, levels }
}

export function proofFor(tree: SumTree, index: number): ProofNode[] {
  const proof: ProofNode[] = []
  let i = index
  for (let d = 0; d < tree.depth; d++) {
    proof.push(tree.levels[d][i ^ 1])
    i >>= 1
  }
  return proof
}

/** Recompute the root from one leaf and its proof, exactly like the contract does. */
export function verifyProof(leaf: Leaf, proof: ProofNode[], root: Hex, total: bigint, recipientCount: number): boolean {
  if (proof.length !== depthFor(recipientCount)) return false
  let node: ProofNode = { hash: leafHash(leaf), sum: leaf.amount }
  for (let d = 0; d < proof.length; d++) {
    node =
      ((leaf.index >> d) & 1) === 0
        ? { hash: nodeHash(node, proof[d]), sum: node.sum + proof[d].sum }
        : { hash: nodeHash(proof[d], node), sum: node.sum + proof[d].sum }
  }
  return node.hash === root && node.sum === total
}
