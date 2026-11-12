import { useState, useSyncExternalStore } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError, getSession, setSession, subscribeSession, type Paged, type Session, type TicketSummary } from '@/lib/support'

/** Calls the API with the session's token. An expired or revoked session is dropped, so the page asks for a new sign-in. */
export async function authed<T>(token: string, path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await api<T>(path, { ...opts, token })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setSession(undefined)
    throw e
  }
}

/** The wallet that has the admin panel, as the API reports it. Undefined while loading, null if there is none or no API. */
export function useAdminAddress(): string | null | undefined {
  const q = useQuery({
    queryKey: ['support-config'],
    queryFn: () => api<{ admin: string | null }>('/config').then((c) => c.admin).catch(() => null),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return q.data
}

/** True only when the connected wallet is the admin wallet. The API checks again on every admin request. */
export function useIsAdmin(): boolean {
  const { address } = useAccount()
  const admin = useAdminAddress()
  return Boolean(address && admin && address.toLowerCase() === admin)
}

/** Sign-in with the connected wallet. One free signature, valid for this tab for 12 hours. */
export function useSupportSession() {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const stored = useSyncExternalStore(subscribeSession, getSession, getSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const session: Session | undefined = stored && address && stored.address === address.toLowerCase() ? stored : undefined

  async function signIn() {
    if (!address) return
    setBusy(true)
    setError(undefined)
    try {
      const n = await api<{ nonce: string; message: string }>('/auth/nonce', { method: 'POST', body: { address } })
      const signature = await signMessageAsync({ message: n.message })
      const v = await api<Session>('/auth/verify', { method: 'POST', body: { address, nonce: n.nonce, signature } })
      setSession(v)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setError(/rejected|denied|cancel/i.test(msg) ? 'Sign-in was cancelled in your wallet.' : e instanceof ApiError ? e.message : 'Could not sign in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function signOut() {
    const token = session?.token
    setSession(undefined)
    if (token) void api('/auth/logout', { method: 'POST', token }).catch(() => undefined)
  }

  return { session, signIn, signOut, busy, error }
}

/** Number of conversations with a reply the user has not read yet. Zero when not signed in. */
export function useUnreadReplies(): number {
  const { session } = useSupportSession()
  const q = useQuery({
    queryKey: ['support-unread', session?.address],
    queryFn: () => authed<Paged<TicketSummary>>(session?.token ?? '', '/tickets?pageSize=1'),
    enabled: Boolean(session),
    refetchInterval: 30_000,
    retry: false,
  })
  return q.data?.unread ?? 0
}
