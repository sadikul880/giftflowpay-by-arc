import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { newRow, type CampaignTypeId, type RecipientRow } from '@/lib/flow'
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
