import { Eye, EyeOff } from 'lucide-react'
import { useDraft } from '@/hooks/useDraft'
import { CAMPAIGN_TYPES, LIMITS, metaBytes, type CampaignTypeId } from '@/lib/flow'
import { fromLocalInput } from '@/lib/format'

const HOUR = 3600
const DAY = 86400

export interface DetailsCheck {
  errors: Partial<Record<'name' | 'meta' | 'start' | 'deadline', string>>
  valid: boolean
}

export function checkDetails(d: ReturnType<typeof useDraft>['draft'], now: number): DetailsCheck {
  const errors: DetailsCheck['errors'] = {}
  if (!d.name.trim()) errors.name = 'Give the campaign a name.'
  if (metaBytes({ n: d.name.trim(), d: d.description.trim(), t: d.type, m: d.message.trim() }) > LIMITS.metadataBytes) errors.meta = 'Name, description and message are too long together.'
  const start = d.startNow ? now : fromLocalInput(d.startAt)
  const deadline = fromLocalInput(d.deadlineAt)
  if (Number.isNaN(start)) errors.start = 'Pick a valid start time.'
  else if (!d.startNow && start < now) errors.start = 'The start time must be in the future.'
  else if (start > now + 365 * DAY) errors.start = 'Claims can open at most one year from now.'
  if (Number.isNaN(deadline)) errors.deadline = 'Pick a valid claim deadline.'
  else if (!Number.isNaN(start) && deadline < start + HOUR) errors.deadline = 'The claim window must last at least one hour.'
  else if (!Number.isNaN(start) && deadline > start + 730 * DAY) errors.deadline = 'The claim window can last at most two years.'
  return { errors, valid: Object.keys(errors).length === 0 }
}

export function DetailsStep({ now, showErrors }: { now: number; showErrors: boolean }) {
  const { draft, patch } = useDraft()
  const { errors } = checkDetails(draft, now)
  const err = (k: keyof typeof errors) => (showErrors && errors[k] ? <p className="mt-1 text-sm" style={{ color: 'var(--danger)' }}>{errors[k]}</p> : null)

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
        <label className="space-y-1.5">
          <span className="label">Campaign name</span>
          <input className="field" maxLength={LIMITS.name} placeholder="Season 1 contributor rewards" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
          {err('name')}
        </label>
        <label className="space-y-1.5">
          <span className="label">Type</span>
          <select className="field" value={draft.type} onChange={(e) => patch({ type: e.target.value as CampaignTypeId })}>
            {CAMPAIGN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="label flex justify-between"><span>Description</span><span className="tabular-nums normal-case tracking-normal">{draft.description.length}/{LIMITS.description}</span></span>
        <textarea className="field min-h-20 resize-y" maxLength={LIMITS.description} placeholder="What are these rewards for?" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
      </label>

      <label className="block space-y-1.5">
        <span className="label flex justify-between"><span>Message to recipients (optional)</span><span className="tabular-nums normal-case tracking-normal">{draft.message.length}/{LIMITS.message}</span></span>
        <textarea className="field min-h-16 resize-y" maxLength={LIMITS.message} placeholder="Thanks for building with us." value={draft.message} onChange={(e) => patch({ message: e.target.value })} />
        {err('meta')}
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>The name, description and message are written to a public onchain event. Do not include private information.</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="label mb-2">Recipient list visibility</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { v: true, Icon: Eye, title: 'Public', body: 'The recipient list is published onchain. Anyone can verify the totals, and recipients claim from the campaign page. Up to 1,000 recipients.' },
            { v: false, Icon: EyeOff, title: 'Private', body: 'Only a commitment is published. Each recipient gets their own claim link, so you must keep the links file. Up to 4,096 recipients.' },
          ] as const).map(({ v, Icon, title, body }) => (
            <label
              key={title}
              className="flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors"
              style={{ borderColor: draft.isPublic === v ? 'var(--green)' : 'var(--border-strong)', background: draft.isPublic === v ? 'var(--green-soft)' : 'var(--surface)' }}
            >
              <input type="radio" name="visibility" className="sr-only" checked={draft.isPublic === v} onChange={() => patch({ isPublic: v })} />
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="label">Claims open</span>
          <div className="flex gap-2">
            <button type="button" aria-pressed={draft.startNow} className={`btn ${draft.startNow ? 'btn-primary' : 'btn-secondary'}`} onClick={() => patch({ startNow: true })}>On funding</button>
            <button type="button" aria-pressed={!draft.startNow} className={`btn ${!draft.startNow ? 'btn-primary' : 'btn-secondary'}`} onClick={() => patch({ startNow: false })}>Schedule</button>
          </div>
          {!draft.startNow ? <input type="datetime-local" className="field" value={draft.startAt} onChange={(e) => patch({ startAt: e.target.value })} aria-label="Claims open at" /> : null}
          {err('start')}
        </div>
        <label className="space-y-2">
          <span className="label block">Claim deadline</span>
          <input type="datetime-local" className="field" value={draft.deadlineAt} onChange={(e) => patch({ deadlineAt: e.target.value })} />
          {err('deadline')}
          <span className="block text-xs" style={{ color: 'var(--muted)' }}>After this, unclaimed funds can be refunded to you.</span>
        </label>
      </div>
    </div>
  )
}
