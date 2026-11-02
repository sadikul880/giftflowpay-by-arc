/** UI preferences only. Campaign, allocation and payment state never touch localStorage. */
export interface Prefs {
  defaultPublic: boolean
  defaultWindowDays: number
  compactTables: boolean
}

const KEY = 'giftflow:prefs'
export const DEFAULT_PREFS: Prefs = { defaultPublic: true, defaultWindowDays: 30, compactTables: false }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const o = JSON.parse(raw) as Partial<Prefs>
    return {
      defaultPublic: typeof o.defaultPublic === 'boolean' ? o.defaultPublic : DEFAULT_PREFS.defaultPublic,
      defaultWindowDays: typeof o.defaultWindowDays === 'number' && o.defaultWindowDays >= 1 && o.defaultWindowDays <= 730 ? o.defaultWindowDays : DEFAULT_PREFS.defaultWindowDays,
      compactTables: typeof o.compactTables === 'boolean' ? o.compactTables : DEFAULT_PREFS.compactTables,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* preferences are optional */
  }
}
