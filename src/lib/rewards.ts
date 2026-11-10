import type { CampaignTypeId, DistMode } from './flow'

/** Ready-made starting points for reward campaigns. They only pre-fill the create form; nothing is stored. */
export interface RewardPreset {
  id: string
  title: string
  body: string
  type: CampaignTypeId
  mode: DistMode
  how: string
}

export const REWARD_PRESETS: RewardPreset[] = [
  { id: 'hackathon', title: 'Hackathon prizes', body: 'Pay winners from a list of wallets, with the totals public for everyone to verify.', type: 'hackathon', mode: 'list', how: 'Wallet list' },
  { id: 'airdrop', title: 'Community airdrop', body: 'Give equal shares to a crowd. Each person gets a secret code, so one code is one share.', type: 'airdrop', mode: 'codes', how: 'Secret codes' },
  { id: 'giveaway', title: 'Open giveaway', body: 'One link for everyone. The first people to claim take the shares until they run out.', type: 'airdrop', mode: 'open', how: 'One shared link' },
  { id: 'grants', title: 'Grants', body: 'Fund approved teams to their wallets, each with its own amount.', type: 'grant', mode: 'list', how: 'Wallet list' },
  { id: 'bounties', title: 'Bounties', body: 'Pay out completed bounties to the contributors who earned them.', type: 'bounty', mode: 'list', how: 'Wallet list' },
  { id: 'contributors', title: 'Contributor rewards', body: 'Reward people who helped your project, by wallet or with codes.', type: 'rewards', mode: 'list', how: 'Wallet list' },
]

/** Campaign types that have their own pages (gifts, payroll) and so are not reward campaigns. */
export const NON_REWARD_TYPES: readonly string[] = ['gift', 'payroll']

export const isRewardType = (type: string | undefined): boolean => type === undefined || !NON_REWARD_TYPES.includes(type)
