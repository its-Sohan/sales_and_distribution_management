import {
  invoiceReceivingStatus,
  money,
  purchaseAccount,
  quantityWithUnit,
  reportRange,
  type Lang,
  type Product,
  type Purchase,
  type PurchaseStatusFilter,
  type ReportWindow,
  type ShopState,
  type Supplier,
} from './model'
import { formatUiDate, formatUiDateTime } from './dateFormat'
import { suppliersTranslator } from './suppliersCopy'

export type PurchaseOrderSummaryReport = {
  fileName: string
  title: string
  subject: string
  generated: string
  scope: string
  detailsHeading?: string
  filterDetails: Array<{ label: string; value: string }>
  balances: Array<{ label: string; value: string; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }>
  notice: string
  tableHeading: string
  columns: [string, string, string, string]
  rows: Array<{
    id: string
    cells: [string, string, string, string]
    tone: 'neutral' | 'warning' | 'danger' | 'positive'
  }>
  empty: string
  page: string
  continued: string
  recordCount: string
}

export type PurchaseOrderReceipt = {
  fileName: string
  title: string
  subject: string
  generated: string
  scope: string
  detailsHeading: string
  details: Array<{ label: string; value: string }>
  balances: Array<{ label: string; value: string; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }>
  notice?: string
  tableHeading: string
  columns: [string, string, string, string]
  rows: Array<{
    id: string
    cells: [string, string, string, string]
    tone: 'neutral' | 'warning' | 'danger' | 'positive'
  }>
  empty: string
  page: string
  continued: string
}

export function buildPurchaseOrderSummaryReport(
  purchases: Purchase[],
  state: ShopState,
  catalog: Product[],
  lang: Lang,
  now: Date,
  options?: {
    filterStatus?: PurchaseStatusFilter
    query?: string
    supplier?: Supplier
    window?: ReportWindow
  }
): PurchaseOrderSummaryReport {
  const t = suppliersTranslator(lang)
  const payments = state.supplierPayments ?? []
  const reviews = state.purchaseSettlements ?? []
  const receivings = state.stockReceivings ?? []
  const suppliers = state.suppliers ?? []
  const amount = (value: number) => `৳ ${money(value)}`
  const product = (id: string) => catalog.find(p => p.id === id)
  const productName = (id: string) => { const p = product(id); return p ? `${p.code} ${p.en}` : id }

  const statusLabel = options?.filterStatus === 'awaitingStock'
    ? t('awaitingStockTab')
    : options?.filterStatus === 'partReceived'
      ? t('partReceivedTab')
      : options?.filterStatus === 'due'
        ? t('dueTab')
        : t('filterAll')

  const filterDetails: Array<{ label: string; value: string }> = []
  if (options?.supplier) {
    filterDetails.push({ label: t('suppliers'), value: options.supplier.name })
    if (options.supplier.phone) filterDetails.push({ label: t('phone'), value: options.supplier.phone })
    if (options.supplier.address) filterDetails.push({ label: t('address'), value: options.supplier.address })
  }
  if (options?.filterStatus && options.filterStatus !== 'all') {
    filterDetails.push({ label: t('filterScope'), value: statusLabel })
  }
  if (options?.query?.trim()) {
    filterDetails.push({ label: t('search'), value: `"${options.query.trim()}"` })
  }
  if (options?.window) {
    const range = reportRange(options.window, now)
    filterDetails.push({ label: t('date'), value: `${formatUiDate(range.start)} – ${formatUiDate(range.end - 1)}` })
  }
  filterDetails.push({ label: t('reportRecords'), value: `${purchases.length}` })

  let totalPurchased = 0
  let totalPaid = 0
  let totalDue = 0
  let hasUnknown = false

  for (const p of purchases) {
    if (!p.voidedAt) {
      totalPurchased += p.total
      const a = purchaseAccount(p, payments, reviews)
      if (a.known) {
        totalPaid += a.paid
        totalDue += a.due
      } else {
        hasUnknown = true
      }
    }
  }

  const supplierPart = options?.supplier
    ? options.supplier.name.replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
    : 'purchases'
  const dateSlug = formatUiDateTime(now).slice(0, 10).split('/').reverse().join('-')
  const fileName = `hisab-po-summary-${supplierPart || 'orders'}-${dateSlug}`

  const scopeTokens = [
    options?.supplier ? options.supplier.name : t('allPurchases'),
    statusLabel,
    options?.query?.trim() ? `"${options.query.trim()}"` : '',
    `${t('reportRecords')}: ${purchases.length}`,
    'BDT (৳)',
  ].filter(Boolean)

  const rows = purchases.map(p => {
    const a = purchaseAccount(p, payments, reviews)
    const receiving = invoiceReceivingStatus(p, receivings)
    const supId = p.supplierId ?? a.supplierId
    const supName = p.supplier || suppliers.find(s => s.id === supId)?.name || t('oneTimeVendor')
    const ref = p.invoiceNumber ? `${t('reportInvoice')}: ${p.invoiceNumber}` : `PO #${p.id.slice(0, 8).toUpperCase()}`

    let statusLine = p.voidedAt
      ? t('voided')
      : `${p.mode === 'invoice' ? t(receiving.status) : t('earlierStock')}\n${!a.known ? t('unknown') : a.due === 0 ? t('settled') : a.paid > 0 ? t('reportPartial') : t('reportUnpaid')}`

    let amountCell = amount(p.total)
    if (!p.voidedAt) {
      amountCell += a.known
        ? `\n${t('reportPaid')}: ${amount(a.paid)}\n${t('reportDue')}: ${amount(a.due)}`
        : `\n${t('unknown')}`
    }

    const details: string[] = []
    if (p.mode === 'invoice') {
      details.push(
        ...receiving.lines.map(
          l => `${l.description} · ${quantityWithUnit(l.quantity, l.unit)} · ${amount(l.total)} · ${t('receivedQty')}: ${quantityWithUnit(l.receivedQuantity, l.unit)}`
        )
      )
    } else {
      details.push(
        ...p.lines.map(
          l => `${productName(l.productId)} · ${quantityWithUnit(l.quantity, product(l.productId)?.unit ?? 'pc')} @ ${amount(l.unitCost)} · ${amount(l.total)}`
        )
      )
    }
    if (p.note) details.push(p.note)
    if (p.voidedAt) details.push(`${t('voided')}: ${p.voidReason || ''}`)
    if (p.accountingIssue) details.push(p.accountingIssue)

    const tone: PurchaseOrderSummaryReport['rows'][number]['tone'] = p.voidedAt
      ? 'danger'
      : !a.known || a.due > 0
        ? 'warning'
        : 'positive'

    return {
      id: p.id,
      cells: [
        `${formatUiDateTime(p.createdAt).replace(/ (?=\d{2}:\d{2}$)/, '\n')}\n${ref}`,
        `${supName}\n${statusLine}`,
        amountCell,
        details.join('\n'),
      ] as [string, string, string, string],
      tone,
    }
  })

  return {
    fileName,
    title: t('purchaseOrderSummary'),
    subject: options?.supplier?.name ?? t('allPurchases'),
    generated: `${t('reportGenerated')}: ${formatUiDateTime(now)} (Asia/Dhaka)`,
    scope: scopeTokens.join(' · '),
    detailsHeading: t('filterScope'),
    filterDetails,
    balances: [
      { label: t('total'), value: amount(totalPurchased) },
      { label: t('reportNetPaid'), value: amount(totalPaid), tone: 'positive' },
      {
        label: t('due'),
        value: hasUnknown && totalDue === 0 ? t('unknown') : amount(totalDue),
        tone: hasUnknown ? 'warning' : totalDue > 0 ? 'danger' : 'positive',
      },
    ],
    notice: hasUnknown ? t('reviewReport') : '',
    tableHeading: t('purchases'),
    columns: [t('reportDate'), t('supplierAndStatus'), t('amount'), t('reportDetails')],
    rows,
    empty: t('noPurchases'),
    page: t('reportPage'),
    continued: t('reportContinued'),
    recordCount: t('reportRecords'),
  }
}

export function buildPurchaseOrderReceipt(
  p: Purchase,
  state: ShopState,
  catalog: Product[],
  lang: Lang,
  now: Date
): PurchaseOrderReceipt {
  const t = suppliersTranslator(lang)
  const allPayments = state.supplierPayments ?? []
  const allReviews = state.purchaseSettlements ?? []
  const allReceivings = state.stockReceivings ?? []
  const suppliers = state.suppliers ?? []
  const amount = (value: number) => `৳ ${money(value)}`
  const product = (id: string) => catalog.find(item => item.id === id)

  const a = purchaseAccount(p, allPayments, allReviews)
  const receiving = invoiceReceivingStatus(p, allReceivings)
  const supId = p.supplierId ?? a.supplierId
  const supplier = suppliers.find(s => s.id === supId)
  const supName = p.supplier || supplier?.name || t('oneTimeVendor')
  const poRef = p.invoiceNumber ? `${t('reportInvoice')}: ${p.invoiceNumber}` : `PO #${p.id.slice(0, 8).toUpperCase()}`

  const receivingsForP = allReceivings.filter(r => r.purchaseId === p.id)
  const paymentsForP = allPayments.filter(pay => pay.purchaseId === p.id).sort((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt))

  const dateSlug = formatUiDateTime(now).slice(0, 10).split('/').reverse().join('-')
  const poCleanSlug = (p.invoiceNumber || p.id.slice(0, 8)).replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'order'
  const fileName = `hisab-po-summary-${poCleanSlug}-${dateSlug}`

  const details: Array<{ label: string; value: string }> = [
    { label: t('poNumber'), value: p.invoiceNumber || p.id.slice(0, 8).toUpperCase() },
    { label: t('date'), value: formatUiDateTime(p.createdAt) },
    { label: t('suppliers'), value: supName },
    ...(supplier?.phone ? [{ label: t('phone'), value: supplier.phone }] : []),
    ...(supplier?.address ? [{ label: t('address'), value: supplier.address }] : []),
    {
      label: t('reportEvent'),
      value: p.voidedAt
        ? t('voided')
        : `${p.mode === 'invoice' ? t(receiving.status) : t('earlierStock')} · ${!a.known ? t('unknown') : a.due === 0 ? t('settled') : a.paid > 0 ? t('reportPartial') : t('reportUnpaid')}`,
    },
    ...(a.method ? [{ label: t('method'), value: t(a.method) }] : []),
    ...(p.note ? [{ label: t('note'), value: p.note }] : []),
    ...(p.voidedAt ? [{ label: t('void'), value: `${formatUiDateTime(p.voidedAt)} · ${p.voidReason || ''}` }] : []),
    ...(p.accountingIssue ? [{ label: t('review'), value: p.accountingIssue }] : []),
  ]

  if (receivingsForP.length > 0) {
    const totalRecVal = receivingsForP.reduce((s, r) => s + r.lines.reduce((sl, l) => sl + l.total, 0), 0)
    details.push({
      label: t('stockReceived'),
      value: `${receivingsForP.length} ${t('receivingRecords')} · ${amount(totalRecVal)}`,
    })
  }

  if (paymentsForP.length > 0) {
    details.push({
      label: t('payments'),
      value: paymentsForP.map(pay => `${formatUiDateTime(pay.createdAt)} · ${amount(pay.amount)} (${t(pay.method)})${pay.note ? ` · ${pay.note}` : ''}`).join('\n'),
    })
  }

  const rows: PurchaseOrderReceipt['rows'] = p.mode === 'invoice'
    ? receiving.lines.map((l, index) => {
        const unitBuy = l.quantity > 0 ? Math.round(l.total / (l.quantity / 1000)) : 0
        const tone: PurchaseOrderReceipt['rows'][number]['tone'] = p.voidedAt
          ? 'danger'
          : l.remainingQuantity === 0
            ? 'positive'
            : 'warning'
        return {
          id: l.id,
          cells: [
            `#${String(index + 1).padStart(2, '0')}`,
            l.description,
            `${amount(l.total)}\n@ ${amount(unitBuy)} / ${l.unit}`,
            `${t('orderedQty')}: ${quantityWithUnit(l.quantity, l.unit)}\n${t('receivedQty')}: ${quantityWithUnit(l.receivedQuantity, l.unit)} · ${t('remaining')}: ${quantityWithUnit(l.remainingQuantity, l.unit)}`,
          ] as [string, string, string, string],
          tone,
        }
      })
    : p.lines.map((l, index) => {
        const prod = product(l.productId)
        const unit = prod?.unit ?? 'pc'
        const name = prod?.en ?? l.productId
        const code = prod?.code ?? `#${String(index + 1).padStart(2, '0')}`
        const tone: PurchaseOrderReceipt['rows'][number]['tone'] = p.voidedAt ? 'danger' : 'positive'
        return {
          id: `${l.productId}-${index}`,
          cells: [
            code,
            name,
            `${amount(l.total)}\n@ ${amount(l.unitCost)} / ${unit}`,
            `${t('orderedQty')}: ${quantityWithUnit(l.quantity, unit)}\n${t('earlierStock')}`,
          ] as [string, string, string, string],
          tone,
        }
      })

  return {
    fileName,
    title: t('purchaseOrderSummary'),
    subject: `${poRef} · ${supName}`,
    generated: `${t('reportGenerated')}: ${formatUiDateTime(now)} (Asia/Dhaka)`,
    scope: `${t('singlePoScope')} · BDT (৳)`,
    detailsHeading: t('orderDetails'),
    details,
    balances: [
      { label: t('total'), value: amount(p.total) },
      { label: t('reportPaid'), value: amount(a.paid), tone: 'positive' },
      {
        label: t('reportDue'),
        value: !a.known ? t('unknown') : amount(a.due),
        tone: !a.known ? 'warning' : a.due > 0 ? 'danger' : 'positive',
      },
    ],
    notice: p.voidedAt ? `${t('voided')}: ${p.voidReason || ''}` : p.accountingIssue || '',
    tableHeading: t('orderItems'),
    columns: [t('itemCode'), t('invoiceDescription'), t('costAndTotal'), t('qtyAndReceiving')],
    rows,
    empty: t('noPurchases'),
    page: t('reportPage'),
    continued: t('reportContinued'),
  }
}

