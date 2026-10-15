import { useMemo, useState } from 'react'
import { type Lang, type Product, type ShopState, type Supplier } from './model'
import { buildSupplierReport } from './supplierReport'
import { suppliersTranslator } from './suppliersCopy'
import { Icon } from './Icons'

export function SupplierTransactionReport({ supplier, state, catalog, lang, now }: { supplier: Supplier; state: ShopState; catalog: Product[]; lang: Lang; now: Date }) {
  const t = suppliersTranslator(lang)
  const generatedMinute = Math.floor(now.getTime() / 60000)
  const report = useMemo(() => buildSupplierReport(supplier, state, catalog, lang, new Date(generatedMinute * 60000)), [supplier, state, catalog, lang, generatedMinute])
  const [downloading, setDownloading] = useState(false), [error, setError] = useState('')
  const download = async () => {
    if (downloading) return
    setDownloading(true); setError('')
    try {
      const { downloadSupplierReportPdf } = await import('./supplierReportPdf')
      await downloadSupplierReportPdf(report)
    }
    catch { setError(t('reportError')) }
    finally { setDownloading(false) }
  }
  return <section className="panel supplier-ledger supplier-transaction-report" aria-label={report.title}>
    <div className="panel-heading">
      <div className="section-title"><Icon name="clock" size={16}/><h2>{report.title}</h2><span className="count-badge">{report.rows.length}</span></div>
      <button className="secondary-button supplier-report-download" type="button" disabled={downloading} onClick={() => void download()}><Icon name="download" size={14}/>{t(downloading ? 'downloadingReport' : 'downloadReport')}</button>
    </div>
    <p className="supplier-report-scope">{report.scope}</p>
    {report.notice && <p className="supplier-report-notice">{report.notice}</p>}
    {error && <p className="field-error supplier-report-notice" role="alert">{error}</p>}
    {report.rows.length ? <div className="data-table-wrap"><table className="data-table supplier-report-table">
      <thead><tr>{report.columns.map((label, i) => <th key={label} className={i === 2 ? 'numeric-cell' : undefined} scope="col">{label}</th>)}</tr></thead>
      <tbody>{report.rows.map(row => <tr key={row.id}>{row.cells.map((cell, i) => <td key={i} className={`${i === 2 ? 'numeric-cell' : ''} ${i === 1 ? `supplier-report-tone-${row.tone}` : ''}`}>{cell}</td>)}</tr>)}</tbody>
    </table></div> : <div className="empty-state supplier-empty"><p>{report.empty}</p></div>}
  </section>
}
