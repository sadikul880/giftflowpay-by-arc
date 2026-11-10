import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, Upload } from 'lucide-react'
import { Notice } from '@/components/ui'
import { checkRows, newRow, rowsFromCsv, type RecipientRow } from '@/lib/flow'
import { fmtUsd } from '@/lib/format'

const PAGE = 20

/**
 * Table of recipients (wallet, amount, label) with CSV import. Shared by campaigns and payroll.
 * With `requireWallet`, a row without a wallet is an error instead of a claim-link recipient.
 */
export function RowsEditor({
  rows,
  onChange,
  max,
  showErrors,
  requireWallet = false,
  template,
  templateName,
  help,
  limitLabel,
  noun = 'recipient',
}: {
  rows: RecipientRow[]
  onChange: (rows: RecipientRow[]) => void
  max: number
  showErrors: boolean
  requireWallet?: boolean
  template: string
  templateName: string
  help: ReactNode
  limitLabel: string
  noun?: string
}) {
  const [page, setPage] = useState(0)
  const [note, setNote] = useState<string>()
  const file = useRef<HTMLInputElement>(null)

  const check = useMemo(() => {
    const c = checkRows(rows, max)
    if (!requireWallet) return c
    const errors = { ...c.errors }
    for (const r of rows) if (r.wallet.trim() === '') errors[r.id] = 'A wallet address is required.'
    return { ...c, errors, valid: c.valid && rows.every((r) => r.wallet.trim() !== '') }
  }, [rows, max, requireWallet])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const safe = Math.min(page, pages - 1)
  const visible = rows.slice(safe * PAGE, safe * PAGE + PAGE)
  const setRow = (id: string, p: Partial<RecipientRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))

  async function onFile(f: File | undefined) {
    if (!f) return
    const imported = rowsFromCsv(await f.text())
    if (imported.length === 0) return setNote('No rows found in that file.')
    const base = rows.length === 1 && !rows[0].amount && !rows[0].wallet ? [] : rows
    onChange([...base, ...imported])
    setNote(`Imported ${imported.length} rows. Review any highlighted rows below.`)
    if (file.current) file.current.value = ''
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = templateName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => file.current?.click()}><Upload className="size-4" /> Import CSV</button>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} aria-label={`Import ${noun}s CSV`} />
          <button type="button" className="btn btn-ghost" onClick={download}><Download className="size-4" /> Template</button>
        </div>
        <div className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
          {rows.length} {noun}s · <strong style={{ color: 'var(--ink)' }}>${fmtUsd(check.total)}</strong> total
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>{help}</p>
      {note ? <Notice>{note}</Notice> : null}
      {rows.length > max ? <Notice tone="error">{limitLabel} supports up to {max.toLocaleString()} {noun}s.</Notice> : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>#</th><th>Wallet{requireWallet ? '' : ' (optional)'}</th><th>Amount (USDC)</th><th>Label</th><th><span className="sr-only">Remove</span></th></tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const err = check.errors[r.id]
              return (
                <tr key={r.id} style={showErrors && err ? { background: 'rgba(255,107,129,0.08)' } : undefined}>
                  <td className="tabular-nums" style={{ color: 'var(--muted)' }}>{safe * PAGE + i + 1}</td>
                  <td className="min-w-64">
                    <input className="field mono !min-h-9 !text-[12.5px]" placeholder={requireWallet ? '0x… wallet' : '0x… or empty for a claim link'} aria-label="Wallet" value={r.wallet} onChange={(e) => setRow(r.id, { wallet: e.target.value })} />
                    {err && (showErrors || r.wallet || r.amount) ? <div className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{err}</div> : null}
                  </td>
                  <td className="w-36">
                    <input className="field !min-h-9 tabular-nums" inputMode="decimal" placeholder="0.00" aria-label="Amount" value={r.amount} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setRow(r.id, { amount: v }) }} />
                  </td>
                  <td className="min-w-40">
                    <input className="field !min-h-9" placeholder="Name or handle" aria-label="Label" maxLength={60} value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label={`Remove ${noun}`} onClick={() => onChange(rows.length > 1 ? rows.filter((x) => x.id !== r.id) : [newRow()])}>
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
        <button type="button" className="btn btn-secondary" onClick={() => { onChange([...rows, newRow()]); setPage(Math.ceil((rows.length + 1) / PAGE) - 1) }}>
          <Plus className="size-4" /> Add {noun}
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
