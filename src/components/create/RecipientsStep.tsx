import { RowsEditor } from '@/components/RowsEditor'
import { useDraft } from '@/hooks/useDraft'
import { LIMITS } from '@/lib/flow'
import { ModePicker, ShareForm } from './ModePicker'

const TEMPLATE = 'wallet,amount,label\n0x0000000000000000000000000000000000000001,25,Example (replace with a real wallet)\n,10,Link-based recipient (leave wallet empty)\n'

function ListEditor({ showErrors }: { showErrors: boolean }) {
  const { draft, patch } = useDraft()
  return (
    <RowsEditor
      rows={draft.rows}
      onChange={(rows) => patch({ rows })}
      max={draft.isPublic ? LIMITS.publicRecipients : LIMITS.privateRecipients}
      showErrors={showErrors}
      template={TEMPLATE}
      templateName="giftflowpay-recipients-template.csv"
      limitLabel={`A ${draft.isPublic ? 'public' : 'private'} campaign`}
      help={<>Columns: wallet, amount in USDC, optional label. Leave the wallet empty to create a claim link instead, useful when you do not know a recipient&rsquo;s wallet. Labels stay in your browser and are never published.</>}
    />
  )
}

export function RecipientsStep({ showErrors }: { showErrors: boolean }) {
  const { draft } = useDraft()
  return (
    <div className="space-y-6">
      <ModePicker />
      {draft.mode === 'list' ? <ListEditor showErrors={showErrors} /> : <ShareForm showErrors={showErrors} />}
    </div>
  )
}
