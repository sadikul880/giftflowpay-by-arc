import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { checkDetails, DetailsStep } from '@/components/create/DetailsStep'
import { LaunchDone, type LaunchResult } from '@/components/create/LaunchResult'
import { RecipientsStep } from '@/components/create/RecipientsStep'
import { ReviewStep } from '@/components/create/ReviewStep'
import { PageHeader, Pill } from '@/components/ui'
import { draftPublic, draftRows, useDraft } from '@/hooks/useDraft'
import { useNow } from '@/hooks/useFlow'
import { checkRows, LIMITS } from '@/lib/flow'

const STEPS = ['Details', 'Recipients', 'Review and fund']

export default function Create() {
  const { draft, reset } = useDraft()
  const now = useNow(30000)
  const [step, setStep] = useState(0)
  const [tried, setTried] = useState(false)
  const [result, setResult] = useState<LaunchResult>()

  if (result) {
    return (
      <LaunchDone
        result={result}
        onAnother={() => {
          reset()
          setResult(undefined)
          setStep(0)
          setTried(false)
        }}
      />
    )
  }

  const details = checkDetails(draft, now)
  const rows = checkRows(draftRows(draft), draftPublic(draft) ? LIMITS.publicRecipients : LIMITS.privateRecipients)
  const valid = [details.valid, rows.valid, true][step]

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Create campaign"
        subtitle="Create once, fund once, distribute by rules. Everything stays in this draft until you fund it."
        actions={<Pill tone="warn">Draft, not saved onchain</Pill>}
      />

      <ol className="mb-8 flex items-center gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="flex size-6 items-center justify-center rounded-full text-xs font-semibold"
              style={{ background: i < step ? 'var(--green)' : i === step ? 'var(--accent)' : 'var(--surface-muted)', color: i <= step ? '#fff' : 'var(--subtle)' }}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={i === step ? 'font-medium' : ''} style={{ color: i === step ? 'var(--ink)' : 'var(--muted)' }}>{s}</span>
            {i < STEPS.length - 1 ? <span className="mx-1 h-px w-6 sm:w-10" style={{ background: 'var(--border-strong)' }} /> : null}
          </li>
        ))}
      </ol>

      <div className="card p-5 sm:p-7">
        {step === 0 ? <DetailsStep now={now} showErrors={tried} /> : null}
        {step === 1 ? <RecipientsStep showErrors={tried} /> : null}
        {step === 2 ? <ReviewStep now={now} onDone={setResult} /> : null}

        {step < 2 ? (
          <div className="mt-8 flex items-center justify-between border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              <ArrowLeft className="size-4" /> Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!valid) return setTried(true)
                setTried(false)
                setStep(step + 1)
              }}
            >
              Continue <ArrowRight className="size-4" />
            </button>
          </div>
        ) : (
          <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" /> Back to recipients
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
