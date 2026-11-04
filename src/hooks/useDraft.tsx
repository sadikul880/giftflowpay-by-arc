import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { LIMITS, newRow, type CampaignTypeId, type DistMode, type RecipientRow } from '@/lib/flow'
import { loadPrefs } from '@/lib/prefs'

/** A campaign draft. It lives in memory only and disappears on reload; nothing is saved until you fund it. */
export interface Draft {
  name: string
  description: string
  type: CampaignTypeId
  message: string
  isPublic: boolean
  startNow: boolean
  startAt: string
  deadlineAt: string
  rows: RecipientRow[]
  /** list: wallets and CSV. open / codes: equal shares for people without a wallet on file. */
  mode: DistMode
  shareCount: string
  shareAmount: string
  /** codes mode only: optional names, one per line. They stay in this browser and become labels. */
  shareNames: string
}

function freshDraft(): Draft {
  const prefs = loadPrefs()
  const now = Math.floor(Date.now() / 1000)
  return {
    name: '',
    description: '',
    type: 'airdrop',
    message: '',
    isPublic: prefs.defaultPublic,
    startNow: true,
    startAt: toLocalInput(now + 3600),
    deadlineAt: toLocalInput(now + prefs.defaultWindowDays * 86400),
    rows: [newRow()],
    mode: 'list',
    shareCount: '50',
    shareAmount: '5',
    shareNames: '',
  }
}

interface Ctx {
  draft: Draft
  patch: (p: Partial<Draft>) => void
  reset: () => void
}

const DraftContext = createContext<Ctx | null>(null)

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(freshDraft)
  const value = useMemo<Ctx>(
    () => ({ draft, patch: (p) => setDraft((d) => ({ ...d, ...p })), reset: () => setDraft(freshDraft()) }),
    [draft],
  )
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useDraft(): Ctx {
  const v = useContext(DraftContext)
  if (!v) throw new Error('useDraft must be used inside DraftProvider')
  return v
}

export const draftTimes = (d: Draft, chainNow: number) => ({
  start: d.startNow ? chainNow : fromLocalInput(d.startAt),
  deadline: fromLocalInput(d.deadlineAt),
})

/** The recipients that will be funded: the table in list mode, or N equal shares in open and codes mode. */
export function draftRows(d: Draft): RecipientRow[] {
  if (d.mode === 'list') return d.rows
  const names = d.mode === 'codes' ? d.shareNames.split('\n').map((s) => s.trim()).filter(Boolean) : []
  const count = names.length > 0 ? names.length : Math.floor(Number(d.shareCount) || 0)
  return Array.from({ length: Math.min(Math.max(count, 0), LIMITS.publicRecipients + 1) }, (_, i) => ({
    id: `share-${i}`,
    label: names[i] ?? '',
    wallet: '',
    amount: d.shareAmount,
  }))
}

/** Open and codes campaigns always publish their list so the claim page can find a share without a personal proof. */
export const draftPublic = (d: Draft): boolean => (d.mode === 'list' ? d.isPublic : true)
