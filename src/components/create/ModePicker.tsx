import { KeyRound, Link2, ListChecks } from 'lucide-react'
import { Notice } from '@/components/ui'
import { draftRows, useDraft } from '@/hooks/useDraft'
import { checkRows, LIMITS, type DistMode } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'

const MODES: Array<{ id: DistMode; title: string; body: string; Icon: typeof ListChecks }> = [
  { id: 'list', title: 'Wallet list', body: 'You know each wallet, for example salaries or DAO payouts. Everyone opens one page, connects, and claims.', Icon: ListChecks },
  { id: 'open', title: 'One shared link', body: 'Equal shares for people without a wallet on file. Anyone with the link claims one share until they run out.', Icon: Link2 },
  { id: 'codes', title: 'Secret codes', body: 'Equal shares, one personal code per person. Each code works once, so each person gets exactly one share.', Icon: KeyRound },
]

export function ModePicker() {
  const { draft, patch } = useDraft()
  return (
    <fieldset className="space-y-3">
      <legend className="label">How do recipients get paid?</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map(({ id, title, body, Icon }) => (
          <label
            key={id}
            className="flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3.5 text-sm"
            style={{ borderColor: draft.mode === id ? 'var(--green)' : 'var(--border-strong)', background: draft.mode === id ? 'var(--green-soft)' : 'var(--surface)' }}
          >
            <input type="radio" name="mode" className="sr-only" checked={draft.mode === id} onChange={() => patch({ mode: id })} />
            <span className="flex items-center gap-2 font-semibold"><Icon className="size-4" /> {title}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{body}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Equal-share form for the "open" and "codes" modes. */
export function ShareForm({ showErrors }: { showErrors: boolean }) {
  const { draft, patch } = useDraft()
  const rows = draftRows(draft)
  const check = checkRows(rows, LIMITS.publicRecipients)
  const named = draft.mode === 'codes' && draft.shareNames.trim() !== ''
  const problem = rows.length === 0 ? 'Enter how many people will be paid.' : rows.length > LIMITS.publicRecipients ? `At most ${LIMITS.publicRecipients.toLocaleString()} people per campaign.` : check.errors[rows[0]?.id] ?? undefined

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="label">Number of people</span>
          <input
            className="field tabular-nums"
            inputMode="numeric"
            disabled={named}
            value={named ? String(rows.length) : draft.shareCount}
            onChange={(e) => patch({ shareCount: e.target.value.replace(/\D/g, '').slice(0, 4) })}
          />
        </label>
        <label className="space-y-1.5">
          <span className="label">Amount each (USDC)</span>
          <input
            className="field tabular-nums"
            inputMode="decimal"
            placeholder="5"
            value={draft.shareAmount}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) patch({ shareAmount: v }) }}
          />
        </label>
      </div>

      {draft.mode === 'codes' ? (
        <label className="block space-y-1.5">
          <span className="label">Names (optional, one per line)</span>
          <textarea
            className="field min-h-28 resize-y"
            placeholder={'Rahim\nKarim\nSumaiya'}
            value={draft.shareNames}
            onChange={(e) => patch({ shareNames: e.target.value })}
          />
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>
            Names only label your code sheet so you know whom to send each code. They stay in this browser and are never published. People claim with their code, not their name, because a name is easy to guess.
          </span>
        </label>
      ) : null}

      <div className="inset flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="tabular-nums">{rows.length} × ${draft.shareAmount || '0'} each</span>
        <span className="font-semibold tabular-nums">${fmtUsd(check.total)} total</span>
      </div>

      {showErrors && problem ? <Notice tone="error">{problem}</Notice> : null}
      <Notice>
        {draft.mode === 'open'
          ? 'You get one link. Anyone who has it can claim one share, first come first served, until all shares are taken. One person can claim more than one share with the same link, so send it only to people you trust, or use secret codes for strictly one share each.'
          : 'You get a code sheet (name, code, link). Each code works once. Share the campaign page and give each person their own code, or send the personal link that fills it in.'}
        {' '}The recipient list is published onchain so the claim page can find a free share. Names and codes are not.
      </Notice>
    </div>
  )
}
