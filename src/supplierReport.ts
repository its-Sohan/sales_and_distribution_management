import { invoiceReceivingStatus, money, purchaseAccount, quantityWithUnit, supplierAccount, supplierHistory, type Lang, type Product, type ShopState, type Supplier } from './model'
import { formatUiDateTime } from './dateFormat'
import { suppliersTranslator } from './suppliersCopy'

export type SupplierReport = {
  fileName: string
  title: string
  supplierName: string
  details: string
  detailsHeading?: string
  profileFields?: Array<{ label: string; value: string }>
  generated: string
  scope: string
  summary: string
  balances: Array<{ label: string; value: string; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }>
  notice: string
  columns: [string, string, string, string]
  rows: Array<{ id: string; cells: [string, string, string, string]; tone: 'neutral' | 'warning' | 'danger' | 'positive' }>
  empty: string
  page: string
  continued: string
  recordCount: string
}

export function buildSupplierReport(supplier: Supplier, state: ShopState, catalog: Product[], lang: Lang, now: Date): SupplierReport {
  const t = suppliersTranslator(lang)
  const purchases = state.purchases ?? [], payments = state.supplierPayments ?? [], settlements = state.purchaseSettlements ?? [], receivings = state.stockReceivings ?? []
  const account = supplierAccount(supplier.id, purchases, payments, settlements)
  const amount = (value: number) => `৳ ${money(value)}`
  const product = (id: string) => catalog.find(p => p.id === id)
  const productName = (id: string) => { const p = product(id); return p ? `${p.code} ${p.en}` : id }
  const report: SupplierReport = {
    fileName: `hisab-supplier-${supplier.name.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'supplier'}-transactions-${formatUiDateTime(now).slice(0, 10).split('/').reverse().join('-')}`,
    title: t('transactionReport'), supplierName: supplier.name,
    details: [supplier.phone, supplier.address, supplier.archived ? t('archived') : '', supplier.note].filter(Boolean).join(' · '),
    detailsHeading: lang === 'bn' ? 'সরবরাহকারীর তথ্য' : 'Supplier details',
    profileFields: [
      { label: t('phone'), value: supplier.phone || '-' },
      { label: t('address'), value: supplier.address || '-' },
      ...(supplier.note ? [{ label: t('note'), value: supplier.note }] : []),
      ...(supplier.archived ? [{ label: t('name'), value: `${supplier.name} (${t('archived')})` }] : []),
    ],
    generated: `${t('reportGenerated')}: ${formatUiDateTime(now)} (Asia/Dhaka)`, scope: t('reportScope'),
    summary: `${t('total')}: ${amount(account.total)}   |   ${t('reportNetPaid')}: ${amount(account.paid)}   |   ${t('due')}: ${amount(account.due)}`,
    balances: [
      { label: t('total'), value: amount(account.total) },
      { label: t('reportNetPaid'), value: amount(account.paid), tone: 'positive' },
      { label: t('due'), value: account.unknown ? t('unknown') : amount(account.due), tone: account.unknown ? 'warning' : account.due > 0 ? 'danger' : 'positive' },
    ],
    notice: account.unknown ? t('reviewReport') : '',
    columns: [t('reportDate'), t('reportEvent'), t('amount'), t('reportDetails')], rows: [], empty: t('noHistory'), page: t('reportPage'), continued: t('reportContinued'),
    recordCount: t('reportRecords'),
  }
  report.rows = supplierHistory(supplier.id, purchases, payments, settlements, receivings).map(event => {
    const p = event.purchase, a = purchaseAccount(p, payments, settlements)
    const reference = `${t('reportInvoice')}: ${p.invoiceNumber || p.id}`
    let label: string = t(event.type === 'invoice' ? 'reportInvoice' : event.type === 'initialPayment' ? 'reportInitial' : event.type === 'receiving' ? 'stockReceived' : event.type === 'review' ? 'reportReview' : event.type === 'void' ? 'voided' : event.type)
    let value = amount(event.amount)
    let tone: SupplierReport['rows'][number]['tone'] = 'neutral'
    const details = [reference]
    if (event.type === 'invoice') {
      const status = p.voidedAt ? t('voided') : !a.known ? t('unknown') : a.due === 0 ? t('settled') : a.paid > 0 ? t('reportPartial') : t('reportUnpaid')
      label += `\n${status}`
      if (!p.voidedAt) label += `\n${t(p.mode === 'invoice' ? invoiceReceivingStatus(p, receivings).status : 'earlierStock')}`
      value += a.known ? `\n${t('reportPaid')}: ${amount(a.paid)}\n${t('reportDue')}: ${amount(a.due)}` : `\n${t('unknown')}`
      tone = p.voidedAt ? 'danger' : !a.known || a.due > 0 ? 'warning' : 'positive'
      if (p.mode === 'invoice') {
        details.push(...invoiceReceivingStatus(p, receivings).lines.map(l => `${l.description} · ${quantityWithUnit(l.quantity, l.unit)} · ${amount(l.total)} · ${t('receivedQty')}: ${quantityWithUnit(l.receivedQuantity, l.unit)}`))
      } else {
        details.push(...p.lines.map(l => `${productName(l.productId)} · ${quantityWithUnit(l.quantity, product(l.productId)?.unit ?? 'pc')} @ ${amount(l.unitCost)} · ${amount(l.total)}`))
      }
      if (p.accountingIssue) details.push(p.accountingIssue)
    } else if (event.type === 'receiving') {
      details.push(t('reportReceivingHint'))
      details.push(...event.receiving!.lines.map(l => {
        const description = p.invoiceLines?.find(i => i.id === l.invoiceLineId)?.description
        return `${description ? `${description} → ` : ''}${productName(l.productId)} · ${quantityWithUnit(l.quantity, product(l.productId)?.unit ?? 'pc')} · ${amount(l.total)}`
      }))
    } else if (event.type === 'review') {
      details.push(t('reportReviewHint'))
    } else if (event.type === 'void') {
      tone = 'danger'
    } else {
      tone = event.type === 'refund' ? 'warning' : 'positive'
    }
    if (event.method) details.push(`${t('method')}: ${t(event.method)}`)
    if (event.note) details.push(event.note)
    return { id: event.id, cells: [formatUiDateTime(event.createdAt), label, value, details.join('\n')], tone }
  })
  return report
}
