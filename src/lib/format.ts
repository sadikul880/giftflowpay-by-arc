import { BaseError, ContractFunctionRevertedError } from 'viem'
import { formatUsdc } from '@/onchain-money'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export const shortAddr = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/** "1,234.50" from raw 6-decimal USDC. Whole amounts have no decimals; fractions keep 2 to 6 digits. */
export function fmtUsd(raw: bigint): string {
  const [int, frac = ''] = formatUsdc(raw).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const trimmed = frac.replace(/0+$/, '')
  if (!trimmed) return grouped
  return `${grouped}.${trimmed.padEnd(2, '0')}`
}

export const fmtDate = (sec: bigint | number): string =>
  new Date(Number(sec) * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export function timeLeft(target: bigint | number, nowSec: number): string {
  const diff = Number(target) - nowSec
  if (diff <= 0) return 'now'
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${Math.max(m, 1)}m`
}

/** Value for a datetime-local input, in the browser's timezone. */
export function toLocalInput(sec: number): string {
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const fromLocalInput = (value: string): number => Math.floor(new Date(value).getTime() / 1000)

const REVERTS: Record<string, string> = {
  CampaignNotFound: 'This campaign does not exist.',
  NotCampaignCreator: 'Only the campaign creator can do this.',
  CampaignIsCancelled: 'This campaign was cancelled.',
  ClaimsNotStarted: 'Claims have not opened yet.',
  ClaimWindowClosed: 'The claim window has closed.',
  AlreadyClaimed: 'This allocation has already been claimed.',
  InvalidProof: 'The allocation proof is not valid for this campaign.',
  WalletMismatch: 'This allocation belongs to a different wallet.',
  SignatureExpired: 'The claim authorization expired. Please try again.',
  InvalidSignature: 'This claim link is not valid for this allocation.',
  RefundNotAvailable: 'The claim window is still open, so a refund is not available yet.',
  NothingToRefund: 'There is nothing left to refund.',
  CancellationNotAllowed: 'A campaign can only be cancelled before claims open.',
  PublishedDataMismatch: 'The published recipient list does not match the committed allocation tree.',
  InvalidClaimWindow: 'The claim window must be between 1 hour and 2 years.',
  InvalidStartTime: 'The start time is too far in the future.',
  InvalidTotalAllocation: 'The total is outside the allowed range.',
  InvalidRecipientCount: 'The number of recipients is outside the allowed range.',
  InvalidRecipientsData: 'The recipient list could not be encoded.',
  MetadataTooLong: 'The campaign name, description or message is too long.',
  InvalidBatchSize: 'A direct distribution batch must have 1 to 100 recipients.',
  EnforcedPause: 'GiftFlow is paused right now. Please try again later.',
  ERC20InsufficientBalance: 'Your USDC balance is too low.',
  ERC20InsufficientAllowance: 'USDC spending approval is missing.',
}

export function isUserRejection(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false
  const hit = error.walk((e) => {
    const code = (e as { code?: number }).code
    return code === 4001 || /user rejected|user denied/i.test((e as Error).message ?? '')
  })
  return hit !== null && hit !== undefined
}

export function explainError(error: unknown): string {
  if (isUserRejection(error)) return 'Request cancelled in your wallet. Nothing was sent.'
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && REVERTS[name]) return REVERTS[name]
      if (reverted.reason) return reverted.reason
    }
    const msg = error.shortMessage || error.message
    if (/insufficient funds/i.test(msg)) return 'Not enough USDC to pay the network fee.'
    if (/network|timeout|fetch|HTTP request failed/i.test(msg)) return 'Network issue. Check your connection and retry.'
    return msg
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
