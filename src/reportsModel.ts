import { allocateDiscount, cleanSearchText, customerAccountingReady, fallbackProduct, isService, lineTotal, receiptLineCost, receiptLineCostStatus, receiptOutstandingDue, receiptProfit, reportRange, reportWindowMode, type AccountTransaction, type CostStatus, type Expense, type Product, type Purchase, type Receipt, type ReportWindow, type Return } from './model'

const hasAccountingIssue = (entry: object) => 'accountingIssue' in entry && Boolean(entry.accountingIssue)

function costFlags(line: Receipt['lines'][number]) {
  const costStatus = receiptLineCostStatus(line)
  return {
    costStatus,
    costKnown: costStatus === 'recorded' || costStatus === 'estimated',
    estimatedCost: costStatus === 'estimated',
    unassignedServiceCost: costStatus === 'unassigned',
    unverifiedCost: costStatus === 'unverified',
  }
}

export function reportSummary(receipts: Receipt[]) {
  const totals = receipts.reduce((sum, receipt) => ({
    sales: sum.sales + receipt.total,
    gross: sum.gross + receipt.subtotal,
    discount: sum.discount + receipt.discount,
    paid: sum.paid + receipt.paid,
    due: sum.due + receipt.due,
    profit: sum.profit + receiptProfit(receipt),
  }), { sales: 0, gross: 0, discount: 0, paid: 0, due: 0, profit: 0 })
  return { ...totals, count: receipts.length, average: receipts.length ? Math.round(totals.sales / receipts.length) : 0,
    margin: totals.sales ? totals.profit / totals.sales * 100 : 0,
    collectionRate: totals.sales ? totals.paid / totals.sales * 100 : 0,
    cost: totals.sales - totals.profit,
    estimatedCost: receipts.some(r => r.lines.some(line => costFlags(line).estimatedCost)),
    unassignedServiceCost: receipts.some(r => r.lines.some(line => costFlags(line).unassignedServiceCost)),
    unverifiedCost: receipts.some(r => hasAccountingIssue(r) || r.lines.some(line => costFlags(line).unverifiedCost)),
    accountingIssue: receipts.some(hasAccountingIssue),
  }
}

export function reportLines(receipt: Receipt) {
  const gross = receipt.lines.map(line => line.gross ?? lineTotal(line.product.price, line.quantity))
  const discounts = allocateDiscount(gross, receipt.discount)
  return receipt.lines.map((line, index) => {
    const cost = receiptLineCost(line)
    const flags = costFlags(line)
    const amountsKnown = !hasAccountingIssue(receipt)
    return { ...line, ...flags, costKnown: amountsKnown && flags.costKnown,
      unverifiedCost: !amountsKnown || flags.unverifiedCost, amountsKnown,
      gross: gross[index], discount: discounts[index], cost,
      revenue: gross[index] - discounts[index], profit: gross[index] - discounts[index] - cost }
  })
}

export type ItemActivity = {
  id: string
  type: 'sale' | 'return' | 'replacement'
  createdAt: string
  receiptId: string
  receiptNumber: number
  receipt?: Receipt
  product: Product
  quantity: number
  revenue: number
  cost: number
  profit: number
  discount: number
  costStatus: CostStatus
  costKnown: boolean
  estimatedCost: boolean
  unassignedServiceCost: boolean
  unverifiedCost: boolean
  amountsKnown: boolean
  quantitiesKnown: boolean
}

// Period activity uses sale-time snapshots even when the original bill is outside
// the selected range. Signed events also drive the detail history and variants.
export function itemActivity(catalog: Product[], receipts: Receipt[], returns: Return[] = [], allReceipts: Receipt[] = receipts): ItemActivity[] {
  const receiptById = new Map(allReceipts.map(receipt => [receipt.id, receipt]))
  const activity: ItemActivity[] = []
  receipts.forEach(receipt => reportLines(receipt).forEach((line, index) => activity.push({
    id: `sale-${receipt.id}-${index}`, type: 'sale', createdAt: receipt.createdAt,
    receiptId: receipt.id, receiptNumber: receipt.number, receipt, product: line.product,
    quantity: line.quantity, revenue: line.revenue, cost: line.cost, profit: line.profit,
    discount: line.discount, ...costFlags(line), costKnown: line.costKnown,
    unverifiedCost: line.unverifiedCost, amountsKnown: line.amountsKnown, quantitiesKnown: true,
  })))
  returns.forEach(entry => {
    const receipt = receiptById.get(entry.receiptId)
    const refunds = allocateDiscount(entry.lines.map(line => line.amount), entry.refunded)
    entry.lines.forEach((line, index) => {
      const source = receipt?.lines.find(part => part.productId === line.productId)
      const product = source?.product ?? catalog.find(part => part.id === line.productId) ?? fallbackProduct(line.productId)
      const flags = source ? costFlags({ ...source, costStatus: line.costStatus ?? source.costStatus })
        : { costStatus: 'unverified' as const, costKnown: false, estimatedCost: false, unassignedServiceCost: false, unverifiedCost: true }
      const cost = !isService(product) && (line.condition ? line.condition === 'sellable' : entry.restock) ? -line.cost : 0
      const revenue = -refunds[index]
      const amountsKnown = Boolean(source) && !hasAccountingIssue(entry) && !hasAccountingIssue(receipt!)
      activity.push({
        id: `return-${entry.id}-${index}`, type: 'return', createdAt: entry.createdAt,
        receiptId: entry.receiptId, receiptNumber: entry.receiptNumber, receipt, product,
        quantity: -line.quantity, revenue, cost, profit: revenue - cost, discount: 0, ...flags,
        amountsKnown, quantitiesKnown: Boolean(source), costKnown: amountsKnown && flags.costKnown, unverifiedCost: !amountsKnown || flags.unverifiedCost,
      })
    })
    const replacements = entry.replacementLines ?? []
    replacements.forEach((line, index) => {
      const product = line.product ?? catalog.find(part => part.id === line.productId) ?? fallbackProduct(line.productId)
      const flags = line.product ? costFlags(line)
        : { costStatus: 'unverified' as const, costKnown: false, estimatedCost: false, unassignedServiceCost: false, unverifiedCost: true }
      const amountsKnown = Boolean(line.product) && !hasAccountingIssue(entry)
      activity.push({
        id: `replacement-${entry.id}-${index}`, type: 'replacement', createdAt: entry.createdAt,
        receiptId: entry.receiptId, receiptNumber: entry.receiptNumber, receipt, product,
        quantity: line.quantity, revenue: line.amount, cost: line.cost, profit: line.amount - line.cost,
        discount: 0, ...flags, amountsKnown, quantitiesKnown: Boolean(line.product), costKnown: amountsKnown && flags.costKnown,
        unverifiedCost: !amountsKnown || flags.unverifiedCost,
      })
    })
  })
  return activity
}

export function itemPerformance(catalog: Product[], receipts: Receipt[], returns: Return[] = [], allReceipts: Receipt[] = receipts) {
  type Totals = { product: Product; quantities: Map<string, { unit: Product['unit']; quantity: number }>; revenue: number; cost: number; profit: number; discount: number; costKnown: boolean; estimatedCost: boolean; unassignedServiceCost: boolean; unverifiedCost: boolean; amountsKnown: boolean; quantitiesKnown: boolean }
  type Item = Totals & { key: string; variants: Product[]; orders: Set<string>; activity: ItemActivity[]; variantStats: Map<string, Totals> }
  const items = new Map<string, Item>()
  const emptyTotals = (product: Product): Totals => ({ product, quantities: new Map(), revenue: 0, cost: 0, profit: 0, discount: 0, costKnown: true, estimatedCost: false, unassignedServiceCost: false, unverifiedCost: false, amountsKnown: true, quantitiesKnown: true })
  const ensure = (product: Product) => {
    const key = product.groupId ?? product.id
    let item = items.get(key)
    if (!item) {
      item = { ...emptyTotals(product), key, variants: [], orders: new Set(), activity: [], variantStats: new Map() }
      items.set(key, item)
    }
    if (!item.variants.some(variant => variant.id === product.id)) item.variants.push(product)
    if (!item.variantStats.has(product.id)) item.variantStats.set(product.id, emptyTotals(product))
    return item
  }
  catalog.forEach(ensure)
  itemActivity(catalog, receipts, returns, allReceipts).forEach(event => {
    const item = ensure(event.product)
    for (const totals of [item, item.variantStats.get(event.product.id)!]) {
      const quantity = totals.quantities.get(event.product.unit) ?? { unit: event.product.unit, quantity: 0 }
      quantity.quantity += event.quantity
      totals.quantities.set(event.product.unit, quantity)
      totals.revenue += event.revenue
      totals.cost += event.cost
      totals.profit += event.profit
      totals.discount += event.discount
      totals.costKnown = totals.costKnown && event.costKnown
      totals.estimatedCost ||= event.estimatedCost
      totals.unassignedServiceCost ||= event.unassignedServiceCost
      totals.unverifiedCost ||= event.unverifiedCost
      totals.amountsKnown &&= event.amountsKnown
      totals.quantitiesKnown &&= event.quantitiesKnown
    }
    item.activity.push(event)
    if (event.type !== 'return') item.orders.add(event.type === 'sale' ? event.receiptId : event.id.replace(/-\d+$/, ''))
  })
  return [...items.values()].map(item => ({ ...item, count: item.orders.size,
    activityCount: item.activity.length,
    margin: item.revenue ? item.profit / item.revenue * 100 : 0,
    quantities: [...item.quantities.values()],
    variantStats: [...item.variantStats.values()].map(variant => ({ ...variant, quantities: [...variant.quantities.values()] })),
  }))
}

export function netReportSummary(receipts: Receipt[], returns: Return[] = [], expenses: Expense[] = [], allReceipts: Receipt[] = receipts) {
  const checkout = reportSummary(receipts)
  const returned = returnSummary(returns)
  const expenseTotal = expenseSummary(expenses).total
  const activity = itemActivity([], receipts, returns, allReceipts)
  const sales = checkout.sales - returned.refunded + returned.replacementSales
  const returnCost = activity.filter(event => event.type === 'return').reduce((sum, event) => sum + event.cost, 0)
  const cost = checkout.cost + returnCost + returned.replacementCost
  const profit = sales - cost
  const salesKnown = !activity.some(event => event.type === 'replacement' && !event.amountsKnown)
  const settlementKnown = !returns.some(entry => hasAccountingIssue(entry) && Boolean(entry.settlement))
  return { ...checkout, sales, cost, profit, checkoutSales: checkout.sales,
    margin: sales > 0 ? profit / sales * 100 : 0,
    paid: checkout.paid + returned.received,
    refunds: returned.paid, returnValue: returned.refunded, replacementSales: returned.replacementSales,
    returnsImpact: checkout.profit - profit, expenses: expenseTotal, netProfit: profit - expenseTotal,
    estimatedCost: activity.some(event => event.estimatedCost),
    unassignedServiceCost: activity.some(event => event.unassignedServiceCost),
    unverifiedCost: checkout.unverifiedCost || returns.some(hasAccountingIssue) || activity.some(event => event.unverifiedCost),
    accountingIssue: receipts.some(hasAccountingIssue) || returns.some(hasAccountingIssue) || activity.some(event => !event.amountsKnown),
    salesKnown, settlementKnown,
  }
}

export function salesShare(revenue: number, netSales: number): number | null {
  return netSales > 0 ? revenue / netSales * 100 : null
}

export function bucketize<T extends { createdAt: string }>(items: T[], window: ReportWindow, referenceDate: Date, daily = false) {
  const range = reportRange(window, referenceDate)
  const step = reportWindowMode(window) === 'day' && !daily ? 2 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return Array.from({ length: Math.round((range.end - range.start) / step) }, (_, index) => {
    const start = range.start + index * step
    const rows = items.filter(item => {
      const time = new Date(item.createdAt).getTime()
      return time >= start && time < start + step
    })
    return { start, end: start + step, items: rows }
  })
}

export function salesBuckets(receipts: Receipt[], window: ReportWindow, referenceDate: Date, daily = false) {
  return bucketize(receipts, window, referenceDate, daily).map(bucket => ({ start: bucket.start, end: bucket.end, ...reportSummary(bucket.items) }))
}

export function netSalesBuckets(receipts: Receipt[], returns: Return[], expenses: Expense[], window: ReportWindow, referenceDate: Date, daily = false, allReceipts: Receipt[] = receipts) {
  const returned = bucketize(returns, window, referenceDate, daily)
  const spent = bucketize(expenses, window, referenceDate, daily)
  return bucketize(receipts, window, referenceDate, daily).map((bucket, index) => ({
    start: bucket.start, end: bucket.end,
    ...netReportSummary(bucket.items, returned[index].items, spent[index].items, allReceipts),
  }))
}

// The overview and downloads share the same net values. Money stays numeric so
// negative return-day amounts cannot be mistaken for spreadsheet formulas.
export function overviewExportRows(buckets: ReturnType<typeof netSalesBuckets>, date: (start: number) => string | Date): (string | number | Date)[][] {
  return [['Date (Dhaka)', 'Bills', 'Without discounts (BDT)', 'Discount (BDT)', 'Total sales (BDT)', 'Cost of items (BDT)', 'Gross profit (BDT)', 'Returns impact (BDT)', 'Expenses (BDT)', 'Refunds (BDT)', 'Net profit (BDT)', 'Collected at checkout (BDT)', 'Due at checkout (BDT)'],
    ...buckets.map(bucket => [date(bucket.start), bucket.count, bucket.gross, bucket.discount,
      bucket.salesKnown ? bucket.sales : '', bucket.accountingIssue ? '' : bucket.cost, bucket.accountingIssue ? '' : bucket.profit,
      bucket.accountingIssue ? '' : bucket.returnsImpact, bucket.expenses,
      bucket.settlementKnown ? bucket.refunds : '', bucket.accountingIssue ? '' : bucket.netProfit,
      bucket.settlementKnown ? bucket.paid : '', bucket.due])]
}

export type BillFilters = { query: string; method: string; status: string; sort: string }
export function reportBillAccountingReady(receipt: Receipt, receipts: Receipt[], transactions: AccountTransaction[] = [], returns: Return[] = []) {
  return !receipt.customer || customerAccountingReady(receipt.customer, receipts, transactions, returns)
}

export function filterReportBills(
  receipts: Receipt[],
  filters: BillFilters,
  context?: { allReceipts?: Receipt[]; transactions?: AccountTransaction[]; returns?: Return[] }
) {
  const query = cleanSearchText(filters.query).trim().replace(/^#/, '')
  const allReceipts = context?.allReceipts ?? receipts
  const transactions = context?.transactions ?? []
  const returns = context?.returns ?? []

  return receipts.filter(r => {
    const text = cleanSearchText([String(r.number).padStart(4, '0'), r.customer?.en, r.customer?.bn, r.customer?.phone,
      ...r.lines.flatMap(line => [line.product.en, line.product.code])].join(' '))
    const accountingReady = reportBillAccountingReady(r, allReceipts, transactions, returns)
    const remainingDue = !accountingReady ? null : context
      ? receiptOutstandingDue(r, allReceipts, transactions, returns)
      : r.due
    const isDue = remainingDue !== null && remainingDue > 0
    const isSettled = r.due > 0 && remainingDue === 0
    const matchesStatus = filters.status === 'all'
      || (filters.status === 'due' && isDue)
      || (filters.status === 'settled' && isSettled)
      || (filters.status === 'paid' && accountingReady && !isDue)

    return (!query || text.includes(query)) && (filters.method === 'all' || r.method === filters.method)
      && matchesStatus
  }).sort((a, b) => filters.sort === 'amount' ? b.total - a.total : filters.sort === 'oldest'
    ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
    : filters.sort === 'settled'
      ? Number((reportBillAccountingReady(b, allReceipts, transactions, returns) && b.due > 0 && receiptOutstandingDue(b, allReceipts, transactions, returns) === 0))
        - Number((reportBillAccountingReady(a, allReceipts, transactions, returns) && a.due > 0 && receiptOutstandingDue(a, allReceipts, transactions, returns) === 0))
        || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      : Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function csvText(rows: (string | number)[][]) {
  // Neutralize spreadsheet formulas in customer and item names; keep numeric cells numeric.
  return '\uFEFF' + rows.map(row => row.map(value => {
    const text = typeof value === 'string' && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value)
    return `"${text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}

export function expenseSummary(expenses: Expense[]) {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  return { total, count: expenses.length }
}

export function purchaseSummary(purchases: Purchase[]) {
  const active = purchases.filter(purchase => !purchase.voidedAt)
  const total = active.reduce((sum, purchase) => sum + purchase.total, 0)
  return { total, count: active.length }
}

export function returnSummary(returns: Return[]) {
  const refunded = returns.reduce((sum, entry) => sum + entry.refunded, 0)
  const cost = returns.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + ((line.condition ? line.condition === 'sellable' : entry.restock) ? line.cost : 0), 0), 0)
  const replacementSales = returns.reduce((sum, entry) => sum + (entry.replacementLines ?? []).reduce((lineSum, line) => lineSum + line.amount, 0), 0)
  const replacementCost = returns.reduce((sum, entry) => sum + (entry.replacementLines ?? []).reduce((lineSum, line) => lineSum + line.cost, 0), 0)
  const paid = returns.reduce((sum, entry) => sum + (entry.settlement ? entry.settlement.payout : entry.method === 'due' ? 0 : entry.refunded), 0)
  const received = returns.reduce((sum, entry) => sum + (entry.settlement?.received ?? 0), 0)
  return { refunded, cost, replacementSales, replacementCost, received, impact: refunded - cost - replacementSales + replacementCost, paid, count: returns.length }
}

export function netProfitAfter(grossProfit: number, returnsImpact: number, expensesTotal: number) {
  return grossProfit - returnsImpact - expensesTotal
}

export function expenseBuckets(expenses: Expense[], window: ReportWindow, referenceDate: Date, daily = false) {
  return bucketize(expenses, window, referenceDate, daily).map(bucket => ({ start: bucket.start, end: bucket.end, ...expenseSummary(bucket.items) }))
}

export function returnBuckets(returns: Return[], window: ReportWindow, referenceDate: Date, daily = false) {
  return bucketize(returns, window, referenceDate, daily).map(bucket => ({ start: bucket.start, end: bucket.end, ...returnSummary(bucket.items) }))
}
