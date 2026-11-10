import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, Upload } from 'lucide-react'
import { useDraft } from '@/hooks/useDraft'
import { checkRows, LIMITS, newRow, rowsFromCsv } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'
import { Notice } from '@/components/ui'
import { ModePicker, ShareForm } from './ModePicker'

const PAGE = 20
const TEMPLATE = 'wallet,amount,label\n0x0000000000000000000000000000000000000001,25,Example (replace with a real wallet)\n,10,Link-based recipient (leave wallet empty)\n'

function ListEditor({ showErrors }: { showErrors: boolean }) {
  const { draft, patch } = useDraft()
  const [page, setPage] = useState(0)
  const [note, setNote] = useState<string>()
  const file = useRef<HTMLInputElement>(null)
  const max = draft.isPublic ? LIMITS.publicRecipients : LIMITS.privateRecipients
  const check = useMemo(() => checkRows(draft.rows, max), [draft.rows, max])
  const pages = Math.max(1, Math.ceil(draft.rows.length / PAGE))
  const safe = Math.min(page, pages - 1)
  const visible = draft.rows.slice(safe * PAGE, safe * PAGE + PAGE)

  const setRow = (id: string, p: Partial<(typeof draft.rows)[number]>) => patch({ rows: draft.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) })

  async function onFile(f: File | undefined) {
    if (!f) return
    const imported = rowsFromCsv(await f.text())
    if (imported.length === 0) return setNote('No rows found in that file.')
    const base = draft.rows.length === 1 && !draft.rows[0].amount && !draft.rows[0].wallet ? [] : draft.rows
    patch({ rows: [...base, ...imported] })
    setNote(`Imported ${imported.length} rows. Review any highlighted rows below.`)
    if (file.current) file.current.value = ''
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'giftflow-recipients-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => file.current?.click()}><Upload className="size-4" /> Import CSV</button>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Import recipients CSV" />
          <button type="button" className="btn btn-ghost" onClick={download}><Download className="size-4" /> Template</button>
        </div>
        <div className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
          {draft.rows.length} recipients · <strong style={{ color: 'var(--ink)' }}>${fmtUsd(check.total)}</strong> total
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Columns: wallet, amount in USDC, optional label. Leave the wallet empty to create a claim link instead, useful when you do not know a recipient&rsquo;s wallet. Labels stay in your browser and are never published.
      </p>
      {note ? <Notice>{note}</Notice> : null}
      {draft.rows.length > max ? <Notice tone="error">A {draft.isPublic ? 'public' : 'private'} campaign supports up to {max.toLocaleString()} recipients.</Notice> : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>#</th><th>Wallet (optional)</th><th>Amount (USDC)</th><th>Label</th><th><span className="sr-only">Remove</span></th></tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const err = check.errors[r.id]
              return (
                <tr key={r.id} style={showErrors && err ? { background: 'rgba(255,107,129,0.08)' } : undefined}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>{safe * PAGE + i + 1}</td>
                  <td className="min-w-64">
                    <input className="field mono !min-h-9 !text-[12.5px]" placeholder="0x… or empty for a claim link" aria-label="Wallet" value={r.wallet} onChange={(e) => setRow(r.id, { wallet: e.target.value })} />
                    {err && (showErrors || r.wallet || r.amount) ? <div className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{err}</div> : null}
                  </td>
                  <td className="w-36">
                    <input className="field !min-h-9 tabular-nums" inputMode="decimal" placeholder="0.00" aria-label="Amount" value={r.amount} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setRow(r.id, { amount: v }) }} />
                  </td>
                  <td className="min-w-40">
                    <input className="field !min-h-9" placeholder="Name or handle" aria-label="Label" maxLength={60} value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label="Remove recipient" onClick={() => patch({ rows: draft.rows.length > 1 ? draft.rows.filter((x) => x.id !== r.id) : [newRow()] })}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn btn-secondary" onClick={() => { patch({ rows: [...draft.rows, newRow()] }); setPage(Math.ceil((draft.rows.length + 1) / PAGE) - 1) }}>
          <Plus className="size-4" /> Add recipient
        </button>
        {pages > 1 ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
            <span className="tabular-nums">Page {safe + 1} of {pages}</span>
            <button type="button" className="btn btn-secondary !min-h-9 !px-2.5" disabled={safe === 0} onClick={() => setPage(safe - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></button>
            <button type="button" className="btn btn-secondary !min-h-9 !px-2.5" disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)} aria-label="Next page"><ChevronRight className="size-4" /></button>
          </div>
        ) : null}
      </div>
      {showErrors && Object.keys(check.errors).length > 0 ? (
        <Notice tone="error">{Object.keys(check.errors).length} rows need attention before you can continue.</Notice>
      ) : null}
    </div>
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
