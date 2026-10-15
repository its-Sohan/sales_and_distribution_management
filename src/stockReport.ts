import {
  filterByWindow,
  inventoryValuationReady,
  isService,
  lineCost,
  money,
  productCost,
  quantityWithUnit,
  stockFor,
  unitMargin,
  unitMarginPercent,
  type Lang,
  type Product,
  type ShopState,
} from './model'
import { formatUiDateTime } from './dateFormat'

export type StockReportSummary = {
  fileName: string
  title: string
  subject?: string
  generated: string
  scope: string
  notice?: string
  detailsHeading?: string
  filterDetails: Array<{ label: string; value: string }>
  balances: Array<{ label: string; value: string; tone?: 'neutral' | 'positive' | 'warning' | 'danger' }>
  tableHeading: string
  columns: [string, string, string, string]
  widths: [number, number, number, number]
  rows: Array<{
    id: string
    cells: [string, string, string, string]
    tone: 'neutral' | 'warning' | 'danger' | 'positive'
  }>
  empty: string
  page: string
  continued: string
}

export function stockReceivedThisMonthTotal(state: ShopState, now: Date): number {
  const stockEvents = [
    ...(state.purchases ?? []).filter(p => p.mode !== 'invoice' && !p.voidedAt),
    ...(state.stockReceivings ?? [])
      .filter(r => !(state.purchases ?? []).find(p => p.id === r.purchaseId)?.voidedAt)
      .map(r => ({ createdAt: r.createdAt, total: r.lines.reduce((s, l) => s + l.total, 0) })),
  ]
  return filterByWindow(stockEvents, 'month', now).reduce((sum, event) => sum + event.total, 0)
}

export function buildStockReportSummary(
  products: Product[],
  state: ShopState,
  lang: Lang,
  now: Date,
  options?: { query?: string; totalCatalog?: Product[] }
): StockReportSummary {
  const totalCatalog = options?.totalCatalog ?? products
  const physicalCatalog = totalCatalog.filter(p => !isService(p))
  const totalValuationReady = !physicalCatalog.some(p => !inventoryValuationReady(p))
  const totalStockValue = totalValuationReady
    ? physicalCatalog.reduce((sum, p) => sum + (p.inventoryValue ?? 0), 0)
    : null

  const lowStockCount = totalCatalog.filter(
    p => !isService(p) && stockFor(p, state.receipts, state.adjustments ?? [], state.returns ?? []) < 10000
  ).length

  const outOfStockCount = products.filter(
    p => !isService(p) && stockFor(p, state.receipts, state.adjustments ?? [], state.returns ?? []) <= 0
  ).length

  const activeCount = products.filter(p => !p.archived).length
  const discontinuedCount = products.filter(p => p.archived).length
  const serviceCount = products.filter(p => isService(p)).length
  const physicalCount = products.length - serviceCount

  const receivedThisMonth = stockReceivedThisMonthTotal(state, now)
  const query = options?.query?.trim()

  const dayKey = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date(date)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const scopeText = query
    ? lang === 'bn'
      ? `খোঁজা হচ্ছে: "${query}" · প্রদর্শিত পণ্য: ${products.length} টি · মুদ্রা: টাকা (BDT)`
      : `Filtered by: "${query}" · Displayed: ${products.length} items · Currency: BDT (৳)`
    : lang === 'bn'
      ? `সকল পণ্য · মোট পণ্য: ${products.length} টি · মুদ্রা: টাকা (BDT)`
      : `All items · Total items: ${products.length} · Currency: BDT (৳)`

  const rows: StockReportSummary['rows'] = products.map(p => {
    const isSvc = isService(p)
    const currentStock = isSvc ? 0 : stockFor(p, state.receipts, state.adjustments ?? [], state.returns ?? [])
    const cost = productCost(p)
    const margin = unitMargin(p)
    const marginPct = unitMarginPercent(p)
    const valuationReady = inventoryValuationReady(p)

    // Determine status & tone
    let statusText: string
    let tone: StockReportSummary['rows'][number]['tone']
    if (p.archived) {
      statusText = lang === 'bn' ? 'স্থগিত' : 'Discontinued'
      tone = 'danger'
    } else if (isSvc) {
      statusText = lang === 'bn' ? 'সার্ভিস' : 'Service'
      tone = 'neutral'
    } else if (currentStock <= 0) {
      statusText = lang === 'bn' ? 'মজুত শেষ' : 'Out of stock'
      tone = 'danger'
    } else if (currentStock < 10000) {
      statusText = lang === 'bn' ? 'কম মজুত' : 'Low stock'
      tone = 'warning'
    } else {
      statusText = lang === 'bn' ? 'মজুত আছে' : 'In stock'
      tone = 'positive'
    }

    // Col 0: Product Name & description
    const detail = (lang === 'en' ? p.detail : p.detailBn) || p.detail || p.code
    const col0 = `${p.en}\n${detail}`

    // Col 1: Code & Status
    const col1 = `${p.code}\n${statusText}`

    // Col 2: Current Stock & Inventory Value (right-aligned in PDF)
    const stockQtyText = isSvc ? (lang === 'bn' ? 'সার্ভিস' : 'Service') : quantityWithUnit(currentStock, p.unit)
    let itemValueText: string
    if (isSvc) {
      itemValueText = '—'
    } else if (p.inventoryValue !== undefined) {
      itemValueText = `${lang === 'bn' ? 'মূল্য' : 'Value'}: ৳ ${money(p.inventoryValue)}`
    } else if (valuationReady) {
      const computedValue = currentStock > 0 ? lineCost(cost, currentStock) : 0
      itemValueText = `${lang === 'bn' ? 'মূল্য' : 'Value'}: ৳ ${money(computedValue)}`
    } else {
      itemValueText = lang === 'bn' ? 'মূল্য বাকি' : 'Valuation pending'
    }
    const col2 = `${stockQtyText}\n${itemValueText}`

    // Col 3: Selling Price & Margin
    const saleText = `${lang === 'bn' ? 'বিক্রয়' : 'Sale'}: ৳ ${money(p.price)}`
    let marginText: string
    if (isSvc) {
      marginText = p.cost !== undefined
        ? `Cost: ৳ ${money(cost)} · Margin: ${marginPct.toFixed(0)}%`
        : (lang === 'bn' ? 'সরাসরি খরচ নেই' : 'No direct cost')
    } else {
      marginText = `Cost: ৳ ${money(cost)} · Margin: ৳ ${money(margin)} (${marginPct.toFixed(0)}%)`
    }
    const col3 = `${saleText}\n${marginText}`

    return {
      id: p.id,
      tone,
      cells: [col0, col1, col2, col3],
    }
  })

  return {
    fileName: `hisab-stock-report-${dayKey(now)}`,
    title: lang === 'bn' ? 'মজুত সারসংক্ষেপ প্রতিবেদন' : 'Stock Summary Report',
    subject: lang === 'bn' ? 'মজুত ও পণ্যের বিবরণ' : 'Inventory & Stock Valuation Summary',
    generated: `${lang === 'bn' ? 'তৈরির সময়' : 'Generated'}: ${formatUiDateTime(now)} (Asia/Dhaka)`,
    scope: scopeText,
    notice: !totalValuationReady
      ? (lang === 'bn'
        ? 'কিছু পণ্যের প্রারম্ভিক মজুত মূল্য নির্ধারণ বাকি রয়েছে। সেগুলো মোট মূল্যে ধরা হয়নি।'
        : 'Some physical items require opening stock valuation. Unvalued items are omitted from total stock value.')
      : undefined,
    detailsHeading: lang === 'bn' ? 'মজুত বিবরণ ও পরিসংখ্যান' : 'Stock Overview & Details',
    filterDetails: [
      { label: lang === 'bn' ? 'মোট প্রদর্শিত পণ্য' : 'Displayed items', value: String(products.length) },
      { label: lang === 'bn' ? 'সক্রিয় পণ্য' : 'Active items', value: String(activeCount) },
      { label: lang === 'bn' ? 'স্থগিত পণ্য' : 'Discontinued items', value: String(discontinuedCount) },
      { label: lang === 'bn' ? 'ভৌত পণ্য' : 'Physical products', value: String(physicalCount) },
      { label: lang === 'bn' ? 'সার্ভিস আইটেম' : 'Service items', value: String(serviceCount) },
      { label: lang === 'bn' ? 'মজুত শেষ' : 'Out of stock items', value: String(outOfStockCount) },
      ...(query ? [{ label: lang === 'bn' ? 'অনুসন্ধান' : 'Search filter', value: query }] : []),
    ],
    balances: [
      {
        label: lang === 'bn' ? 'মজুতের মোট দাম' : 'Total stock value',
        value: totalStockValue !== null ? `৳ ${money(totalStockValue)}` : '—',
        tone: totalStockValue !== null ? 'positive' : 'warning',
      },
      {
        label: lang === 'bn' ? 'মোট পণ্য' : 'Total items',
        value: String(totalCatalog.length),
        tone: 'neutral',
      },
      {
        label: lang === 'bn' ? 'কম মজুতের পণ্য' : 'Low stock items',
        value: String(lowStockCount),
        tone: lowStockCount > 0 ? 'warning' : 'neutral',
      },
      {
        label: lang === 'bn' ? 'এই মাসে গৃহীত স্টক' : 'Stock received this month',
        value: `৳ ${money(receivedThisMonth)}`,
        tone: 'neutral',
      },
    ],
    tableHeading: lang === 'bn' ? 'পণ্যের তালিকা ও বর্তমান মজুত' : 'Product Inventory & Stock Status',
    columns: [
      lang === 'bn' ? 'পণ্য' : 'Product',
      lang === 'bn' ? 'কোড ও অবস্থা' : 'Code & Status',
      lang === 'bn' ? 'মজুত ও মোট মূল্য' : 'Stock & Value',
      lang === 'bn' ? 'বিক্রয় ও মার্জিন' : 'Price & Margin',
    ],
    widths: [332, 200, 240, 340],
    rows,
    empty: lang === 'bn' ? 'কোনো পণ্য পাওয়া যায়নি' : 'No items found matching the report criteria',
    page: lang === 'bn' ? 'পৃষ্ঠা' : 'Page',
    continued: lang === 'bn' ? 'চলমান' : 'cont.',
  }
}

