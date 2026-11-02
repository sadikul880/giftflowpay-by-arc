/**
 * Deploys GiftFlow to Arc Testnet with Foundry, signing from a keystore you control.
 *
 *   OWNER_ADDRESS=0x... FORGE_ACCOUNT=<keystore name> bun run deploy:testnet
 *
 * Create the keystore once with `cast wallet import <name> --interactive`. The script passes no private
 * key on the command line. Chain ID, RPC URL and USDC address come from src/onchain-facts.ts.
 * There is intentionally no mainnet script: mainnet is configured only after an explicit go-ahead.
 */
import { spawnSync } from 'node:child_process'
import { getUsdc, requireChain } from '../src/onchain-facts'

const TESTNET_CHAIN_ID = 5042002

const chain = requireChain(TESTNET_CHAIN_ID)
const usdc = getUsdc(TESTNET_CHAIN_ID)
if (!chain.isTestnet || !usdc) throw new Error('Arc Testnet facts are missing USDC or are not marked as a testnet')

const owner = process.env.OWNER_ADDRESS
const account = process.env.FORGE_ACCOUNT
if (!owner || !account) {
  console.error('Set OWNER_ADDRESS (pause/limit admin) and FORGE_ACCOUNT (Foundry keystore name).')
  process.exit(1)
}

const result = spawnSync(
  'forge',
  [
    'script',
    'contracts/script/DeployGiftFlow.s.sol:DeployGiftFlow',
    '--rpc-url',
    chain.rpcUrls[0],
    '--account',
    account,
    '--broadcast',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      USDC_ADDRESS: usdc.address,
      OWNER_ADDRESS: owner,
      EXPECTED_CHAIN_ID: String(TESTNET_CHAIN_ID),
    },
  },
)

if (result.status === 0) {
  console.log('\nNext: put the deployed address in .env as VITE_GIFTFLOW_ADDRESS_TESTNET and restart the dev server.')
}
process.exit(result.status ?? 1)
