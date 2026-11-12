import type { AppKit } from '@circle-fin/app-kit'
import type { EIP1193Provider } from 'viem'

/**
 * Circle App Kit is large, so it is loaded only when the swap page asks for it.
 * No kit key is used: swaps run permissionless from the browser, signed by the user's own wallet.
 */
let kit: Promise<AppKit> | undefined
export function loadKit(): Promise<AppKit> {
  kit ??= import('@circle-fin/app-kit').then((m) => new m.AppKit()).catch((e: unknown) => {
    kit = undefined
    throw e
  })
  return kit
}

export async function walletAdapter(provider: EIP1193Provider) {
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')
  return createViemAdapterFromProvider({ provider })
}

/** Only this exact error means "no route". Network, validation and rate-limit failures do not. */
export const isNoRoute = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'INPUT_UNSUPPORTED_ROUTE'

export function kitMessage(e: unknown): string {
  if (isNoRoute(e)) return 'No swap route exists for this pair on Arc Testnet right now. Try another pair or amount.'
  const own = typeof e === 'object' && e !== null ? (e as { message?: unknown }).message : undefined
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : typeof own === 'string' ? own : ''
  if (/user (rejected|denied|cancelled|canceled)|rejected the request|cancelled the request/i.test(msg)) return 'Request cancelled in your wallet.'
  if (/insufficient/i.test(msg)) return 'Not enough balance or not enough USDC for the network fee.'
  return msg || 'Something went wrong. Please try again.'
}
