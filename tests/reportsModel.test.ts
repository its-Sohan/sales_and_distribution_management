import test from 'node:test'
import assert from 'node:assert/strict'
import { allProducts, filterReceiptsByWindow, makeExpense, makePurchase, makeReceipt, makeReturn, makeReturnExchange, receiptProfit, reportRange, type Receipt } from '../src/model.ts'
import { initialState, products } from './fixtures/catalog.ts'
import { csvText, expenseBuckets, expenseSummary, filterReportBills, itemActivity, itemPerformance, netProfitAfter, netReportSummary, netSalesBuckets, overviewExportRows, purchaseSummary, reportBillAccountingReady, reportLines, reportSummary, returnBuckets, returnSummary, salesBuckets, salesShare } from '../src/reportsModel.ts'

const receipt = (createdAt = '2026-10-09T18:00:00.000Z'): Receipt => ({ ...makeReceipt(initialState, 900, 'cash'), createdAt })

test('Dhaka reporting crosses UTC midnight correctly and excludes the next day', () => {
  const now = new Date('2026-10-09T18:30:00.000Z') // October 10 in Dhaka
  const rows = [receipt('2026-10-09T17:59:59.999Z'), receipt('2026-10-09T18:00:00.000Z'), receipt('2026-10-10T17:59:59.999Z'), receipt('2026-10-10T18:00:00.000Z')]
  assert.deepEqual(filterReceiptsByWindow(rows, 'today', now), rows.slice(1, 3))
  assert.equal(reportRange('month', now).days, 10)
  assert.equal(new Date(reportRange('month', now).start).toISOString(), '2026-09-30T18:00:00.000Z')
  assert.deepEqual(filterReceiptsByWindow([receipt('2026-10-12T12:00:00.000Z')], 'month', now), [])
})

test('daily exports preserve zero-sale days and the previous month in a seven-day range', () => {
  const now = new Date('2026-10-02T12:00:00.000Z')
  const rows = [receipt('2026-09-28T12:00:00.000Z')]
  const buckets = salesBuckets(rows, '7days', now, true)
  assert.equal(buckets.length, 7)
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.sales, 0), rows[0].total)
  assert.equal(buckets.filter(bucket => !bucket.count).length, 6)
  assert.equal(salesBuckets([], 'today', now).length, 12)
})

test('discount allocation reconciles item totals to bills down to the last taka', () => {
  const r = makeReceipt({ ...initialState, discount: 10, customerId: 'c1' }, 890, 'cash')
  const lines = reportLines(r)
  assert.equal(lines.reduce((sum, line) => sum + line.discount, 0), 10)
  assert.equal(lines.reduce((sum, line) => sum + line.revenue, 0), r.total)
  assert.equal(lines.reduce((sum, line) => sum + line.profit, 0), receiptProfit(r))
  const summary = reportSummary([r])
  assert.equal(summary.gross - summary.discount, summary.sales)
  assert.equal(summary.sales - summary.cost, summary.profit)
  assert.equal(summary.paid + summary.due, summary.sales)
  assert.equal(summary.paid, 890)
})

test('historical discounts that exceed item margin still produce a visible loss', () => {
  const sale = makeReceipt({ ...initialState, lines: [{ productId: 'mouse-opt', quantity: 1000 }], discount: 0 }, 350, 'cash')
  // Previously accepted loss-making receipts remain valid report inputs.
  const r = { ...sale, discount: 150, total: 200, paid: 200, tendered: 200 }
  assert.equal(receiptProfit(r), -40)
  assert.equal(reportSummary([r]).profit, -40)
  assert.equal(itemPerformance(products, [r]).find(item => item.product.id === 'mouse-opt')?.profit, -40)
})

test('service sales count in revenue while unknown direct cost leaves item margin unavailable', () => {
  const r = makeReceipt({ ...initialState, lines: [{ productId: 'service-custom', quantity: 1000, unitPrice: 500 }] }, 500, 'cash')
  const summary = reportSummary([r])
  const service = itemPerformance(products, [r]).find(item => item.product.id === 'service-custom')!
  assert.equal(summary.sales, 500)
  assert.equal(summary.unassignedServiceCost, true)
  assert.equal(summary.estimatedCost, false)
  assert.equal(service.count, 1)
  assert.equal(service.revenue, 500)
  assert.equal(service.costKnown, false)
})

test('historical costs and discontinued products survive catalog changes', () => {
  const r = receipt()
  const changedCatalog = products.filter(p => p.id !== 'mouse-opt').map(p => ({ ...p, cost: 0, price: 1, archived: true }))
  const items = itemPerformance(changedCatalog, [r])
  assert.ok(items.find(item => item.product.id === 'mouse-opt'))
  assert.equal(items.reduce((sum, item) => sum + item.revenue, 0), r.total)
  assert.equal(items.reduce((sum, item) => sum + item.profit, 0), receiptProfit(r))
})

test('grouped variants count a bill once and keep different quantity units separate', () => {
  const r = receipt()
  r.lines = r.lines.slice(0, 2).map((line, index) => ({ ...line, product: { ...line.product, groupId: 'mixed', unit: index ? 'kg' : 'pc' } }))
  const [item] = itemPerformance([], [r])
  assert.equal(item.count, 1)
  assert.equal(item.variants.length, 2)
  assert.deepEqual(item.quantities, [{ unit: 'pc', quantity: 1000 }, { unit: 'kg', quantity: 1000 }])
})

test('bill filters combine payment, status, bilingual search, and actual timestamps', () => {
  const paid = { ...receipt('2026-10-08T10:00:00Z'), number: 21 }
  const due = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 100, 'mobile'), number: 22, createdAt: '2026-10-09T10:00:00Z' }
  const base = { query: '', method: 'all', status: 'all', sort: 'newest' }
  assert.deepEqual(filterReportBills([paid, due], base), [due, paid])
  assert.deepEqual(filterReportBills([paid, due], { ...base, method: 'mobile', status: 'due', query: 'নাদিয়া' }), [due])
  assert.deepEqual(filterReportBills([paid, due], { ...base, query: '#০০২১' }), [paid])
  assert.deepEqual(filterReportBills([paid, due], { ...base, status: 'paid', query: 'Mouse' }), [paid])
  assert.deepEqual(filterReportBills([paid, due], { ...base, method: 'bank' }), [])

  // When customer has paid their due in account transactions, due bill shows as paid/settled
  const paymentTx = { id: 'tx-1', customerId: 'c1', type: 'payment' as const, amount: due.due, createdAt: '2026-10-09T11:00:00Z' }
  assert.deepEqual(filterReportBills([due], { ...base, status: 'due' }, { allReceipts: [due], transactions: [paymentTx] }), [])
  assert.deepEqual(filterReportBills([due], { ...base, status: 'paid' }, { allReceipts: [due], transactions: [paymentTx] }), [due])
  assert.deepEqual(filterReportBills([due, paid], { ...base, status: 'settled' }, { allReceipts: [due, paid], transactions: [paymentTx] }), [due])
  assert.deepEqual(filterReportBills([paid, due], { ...base, sort: 'settled' }, { allReceipts: [due, paid], transactions: [paymentTx] }), [due, paid])
})

test('empty reports have finite zero values and flag estimated costs only when used', () => {
  const summary = reportSummary([])
  assert.equal(summary.average, 0)
  assert.equal(summary.margin, 0)
  assert.equal(summary.collectionRate, 0)
  const r = receipt()
  r.lines[0].product = { ...r.lines[0].product, cost: undefined }
  delete r.lines[0].costAmount
  delete r.lines[0].costStatus
  assert.equal(reportSummary([r]).estimatedCost, true)
})

test('CSV preserves Bangla, quotes and newlines, and neutralizes text formulas', () => {
  const output = csvText([['নাদিয়া', 'a"b\nc', '=SUM(A1)', '  @formula', -12.5]])
  assert.ok(output.startsWith('\uFEFF'))
  assert.ok(output.includes('"a""b\nc"'))
  assert.ok(output.includes('"\'=SUM(A1)"'))
  assert.ok(output.includes('"\'  @formula"'))
  assert.ok(output.includes('"-12.5"'))
})

test('expense and purchase summaries total exact taka', () => {
  const expenses = [
    makeExpense({ category: 'rent', amount: 5000, method: 'cash' }),
    makeExpense({ category: 'utility', amount: 1250, method: 'mobile' }),
  ]
  assert.deepEqual(expenseSummary(expenses), { total: 6250, count: 2 })
  assert.deepEqual(expenseSummary([]), { total: 0, count: 0 })

  const purchases = [
    makePurchase([{ productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 }]),
    makePurchase([{ productId: 'ssd-128gb', quantity: 2000, unitCost: 1180, total: 2360 }]),
  ]
  assert.deepEqual(purchaseSummary(purchases), { total: 2600, count: 2 })
  assert.deepEqual(purchaseSummary([]), { total: 0, count: 0 })
})

test('daily expense buckets align with sales buckets for the net profit export', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  const expenses = [
    { ...makeExpense({ category: 'rent', amount: 500, method: 'cash' }), createdAt: '2026-10-09T09:00:00.000Z' },
    { ...makeExpense({ category: 'utility', amount: 230, method: 'cash' }), createdAt: '2026-10-08T09:00:00.000Z' },
  ]
  const sales = salesBuckets([], '7days', now, true)
  const buckets = expenseBuckets(expenses, '7days', now, true)
  assert.equal(buckets.length, 7)
  assert.deepEqual(buckets.map(b => b.start), sales.map(b => b.start))
  assert.deepEqual(buckets.map(b => b.end), sales.map(b => b.end))
  assert.equal(buckets.reduce((sum, b) => sum + b.total, 0), 730)
  assert.equal(buckets.reduce((sum, b) => sum + b.count, 0), 2)
  assert.equal(buckets[6].total, 500)
  assert.equal(buckets[5].total, 230)
  assert.equal(buckets.slice(0, 5).every(b => b.total === 0), true)
})

test('voided purchases leave every money summary', () => {
  const active = makePurchase([{ productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 }])
  const voided = { ...makePurchase([{ productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 }]), voidedAt: '2026-10-09T10:00:00.000Z', voidReason: 'typo' }
  assert.deepEqual(purchaseSummary([active, voided]), { total: 240, count: 1 })
  assert.deepEqual(purchaseSummary([voided]), { total: 0, count: 0 })
})

test('return summaries split refunded, cost, profit impact, and payouts', () => {
  const bill = receipt()
  const paidBack = makeReturn(bill, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true })
  const dueBack = makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'due', restock: true })
  const summary = returnSummary([paidBack, dueBack])
  assert.equal(summary.refunded, 900)
  assert.equal(summary.cost, 620)
  assert.equal(summary.impact, 280)
  assert.equal(summary.paid, 550)
  assert.equal(summary.count, 2)
  assert.deepEqual(returnSummary([]), { refunded: 0, cost: 0, replacementSales: 0, replacementCost: 0, received: 0, impact: 0, paid: 0, count: 0 })
  assert.equal(netProfitAfter(110, summary.impact, 20), -190)
})

test('daily return buckets align with sales buckets and item performance nets returns', () => {
  const now = new Date('2026-10-09T12:00:00.000Z')
  const bill = receipt('2026-10-09T09:00:00.000Z')
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }), createdAt: '2026-10-09T09:00:00.000Z' }
  const sales = salesBuckets([], '7days', now, true)
  const buckets = returnBuckets([entry], '7days', now, true)
  assert.equal(buckets.length, 7)
  assert.deepEqual(buckets.map(b => b.start), sales.map(b => b.start))
  assert.equal(buckets.reduce((sum, b) => sum + b.refunded, 0), 350)
  assert.equal(buckets[6].refunded, 350)
  assert.equal(buckets[6].impact, 110)

  const plain = itemPerformance(products, [bill])
  const netted = itemPerformance(products, [bill], [entry])
  const before = plain.find(item => item.product.id === 'mouse-opt')!
  const after = netted.find(item => item.product.id === 'mouse-opt')!
  assert.equal(after.revenue, before.revenue - 350)
  assert.equal(after.profit, before.profit - 110)
  assert.equal(after.quantities[0].quantity, 0)
})

test('exchange reporting counts replacement sales and keeps damaged return cost', () => {
  const bill = makeReceipt({ ...initialState, customerId: 'c1' }, 900, 'cash')
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'damaged' }], [{ productId: 'mouse-opt', quantity: 1000 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: false,
    reason: 'Defective', operator: 'Sam', now: new Date(bill.createdAt),
  })
  const totals = returnSummary([entry])
  assert.equal(totals.cost, 0)
  assert.equal(totals.replacementSales, 350)
  assert.equal(totals.replacementCost, 240)
  assert.equal(totals.impact, 440)
  const items = itemPerformance(products, [bill], [entry])
  assert.equal(items.find(item => item.product.id === 'keyboard-usb')!.profit, -380)
  assert.equal(items.find(item => item.product.id === 'mouse-opt')!.quantities[0].quantity, 2000)
})

test('item totals, variants, and signed history reconcile after returns and replacements', () => {
  const bill = receipt('2026-10-09T09:00:00.000Z')
  bill.lines = bill.lines.map(line => ({ ...line, costStatus: 'recorded' }))
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'damaged' }], [{ productId: 'mouse-opt', quantity: 1000 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: false,
    reason: 'Defective', operator: 'Sam', now: new Date(bill.createdAt),
  })
  const items = itemPerformance(products, [bill], [entry]).filter(item => item.activityCount)
  const totals = netReportSummary([bill], [entry])
  assert.equal(totals.sales, 700)
  assert.equal(totals.cost, 860)
  assert.equal(totals.profit, -160)
  assert.equal(items.reduce((sum, item) => sum + item.revenue, 0), totals.sales)
  assert.equal(items.reduce((sum, item) => sum + item.profit, 0), totals.profit)
  for (const item of items) {
    assert.equal(item.variantStats.reduce((sum, variant) => sum + variant.revenue, 0), item.revenue)
    assert.equal(item.variantStats.reduce((sum, variant) => sum + variant.profit, 0), item.profit)
    assert.equal(item.activity.reduce((sum, event) => sum + event.revenue, 0), item.revenue)
    assert.equal(item.activity.reduce((sum, event) => sum + event.profit, 0), item.profit)
    assert.ok(item.activity.every(event => event.receipt === bill))
  }
  assert.deepEqual(itemActivity(products, [bill], [entry]).map(event => event.type), ['sale', 'sale', 'return', 'replacement'])
  const mouse = items.find(item => item.product.id === 'mouse-opt')!
  assert.equal(mouse.revenue, 700)
  assert.equal(mouse.quantities[0].quantity, 2000)
  assert.equal(items.find(item => item.product.id === 'keyboard-usb')!.profit, -380)
})

test('return-only periods retain removed products and historical units and grouping', () => {
  const bill = receipt('2026-10-08T09:00:00.000Z')
  bill.lines[0] = { ...bill.lines[0], costStatus: 'recorded', product: { ...bill.lines[0].product, unit: 'kg', groupId: 'historical-group' } }
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }), createdAt: '2026-10-09T09:00:00.000Z' }
  const catalog = products.filter(product => product.id !== 'mouse-opt')
  const item = itemPerformance(catalog, [], [entry], [bill]).find(item => item.key === 'historical-group')!
  assert.equal(item.revenue, -350)
  assert.equal(item.cost, -240)
  assert.equal(item.profit, -110)
  assert.equal(item.count, 0)
  assert.equal(item.activityCount, 1)
  assert.equal(item.costKnown, true)
  assert.deepEqual(item.quantities, [{ unit: 'kg', quantity: -1000 }])
  assert.equal(item.activity[0].receipt, bill)
  assert.equal(netReportSummary([], [entry], [], [bill]).profit, -110)
})

test('daily overview exports share net sales, costs and profit and keep negative CSV cells numeric', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const bill = receipt('2026-10-09T09:00:00Z')
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }), createdAt: '2026-10-10T09:00:00Z' }
  const expense = { ...makeExpense({ category: 'rent', amount: 20, method: 'cash' }), createdAt: entry.createdAt }
  const summary = netReportSummary([bill], [entry], [expense])
  const buckets = netSalesBuckets([bill], [entry], [expense], '3days', now, true)
  const rows = overviewExportRows(buckets, start => new Date(start).toISOString())
  assert.equal(summary.sales, 550)
  assert.equal(summary.cost, 380)
  assert.equal(summary.profit, 170)
  assert.equal(summary.netProfit, 150)
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.profit, 0), summary.profit)
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.netProfit, 0), summary.netProfit)
  assert.deepEqual(rows[3].slice(4, 11), [-350, -240, -110, 110, 20, 350, -130])
  rows.slice(1).forEach(row => assert.ok(row.slice(1).every(value => typeof value === 'number')))
  const csv = csvText(rows as (string | number)[][])
  assert.ok(csv.includes('"-350","-240","-110"'))
  assert.equal(csv.includes("'-350"), false)
})

test('net sales shares use returned sales and remain unavailable for zero or negative net sales', () => {
  const bill = receipt()
  const entry = makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true })
  const net = netReportSummary([bill], [entry])
  const keyboard = itemPerformance(products, [bill], [entry]).find(item => item.product.id === 'keyboard-usb')!
  assert.equal(salesShare(keyboard.revenue, net.sales), 100)
  assert.equal(salesShare(-100, 500), -20)
  assert.equal(salesShare(600, 500), 120)
  assert.equal(salesShare(0, 0), null)
  assert.equal(salesShare(-350, -350), null)
})

test('exact historical gross and allocated cost amounts override rounded unit prices', () => {
  const bill = receipt()
  bill.lines = [{ ...bill.lines[0], quantity: 3000, product: { ...bill.lines[0].product, unit: 'kg', price: 33, cost: 23 }, gross: 100, costAmount: 70, costStatus: 'recorded' }]
  Object.assign(bill, { subtotal: 100, discount: 0, total: 100, paid: 100, tendered: 100, change: 0, due: 0 })
  assert.equal(reportLines(bill)[0].revenue, 100)
  assert.equal(reportLines(bill)[0].cost, 70)
  assert.equal(reportSummary([bill]).profit, 30)
  const item = itemPerformance([], [bill])[0]
  assert.equal(item.revenue, 100)
  assert.equal(item.profit, 30)
  assert.equal(item.costKnown, true)
})

test('persisted cost status distinguishes unknown service cost, recorded zero and unverified history', () => {
  const bill = makeReceipt({ ...initialState, lines: [{ productId: 'service-windows', quantity: 1000 }] }, 500, 'cash')
  bill.lines[0] = { ...bill.lines[0], product: { ...bill.lines[0].product, cost: 0 }, costAmount: 0, costStatus: 'unassigned' }
  assert.equal(netReportSummary([bill]).unassignedServiceCost, true)
  assert.equal(itemPerformance(products, [bill]).find(item => item.product.id === 'service-windows')!.costKnown, false)
  bill.lines[0].costStatus = 'recorded'
  assert.equal(netReportSummary([bill]).unassignedServiceCost, false)
  assert.equal(itemPerformance(products, [bill]).find(item => item.product.id === 'service-windows')!.costKnown, true)
  bill.lines[0].costStatus = 'unverified'
  assert.equal(netReportSummary([bill]).unverifiedCost, true)
  assert.equal(itemPerformance(products, [bill]).find(item => item.product.id === 'service-windows')!.costKnown, false)
})

test('inconsistent legacy accounting retains header sales and suppresses definitive profit exports', () => {
  const bill = { ...receipt('2026-10-09T09:00:00Z'), accountingIssue: 'Historical payload money differs from receipt header' }
  const summary = netReportSummary([bill])
  assert.equal(summary.sales, bill.total)
  assert.equal(summary.accountingIssue, true)
  assert.equal(summary.unverifiedCost, true)
  const item = itemPerformance(products, [bill]).find(item => item.product.id === 'mouse-opt')!
  assert.equal(item.amountsKnown, false)
  assert.equal(item.costKnown, false)
  const rows = overviewExportRows(netSalesBuckets([bill], [], [], 'today', new Date(bill.createdAt), true), start => new Date(start))
  assert.equal(rows[1][4], bill.total)
  assert.equal(rows[1][5], '')
  assert.equal(rows[1][6], '')
  assert.equal(rows[1][10], '')
})

test('a return of an inconsistent older bill keeps profit unavailable outside its sale period', () => {
  const bill = receipt('2026-10-08T09:00:00Z')
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }), createdAt: '2026-10-09T09:00:00Z' }
  const legacyBill = { ...bill, accountingIssue: 'Historical payload money differs from receipt header' }
  const summary = netReportSummary([], [entry], [], [legacyBill])
  assert.equal(summary.sales, -350)
  assert.equal(summary.salesKnown, true)
  assert.equal(summary.accountingIssue, true)
  const rows = overviewExportRows(netSalesBuckets([], [entry], [], 'today', new Date(entry.createdAt), true, [legacyBill]), start => new Date(start))
  assert.equal(rows[1][4], -350)
  assert.equal(rows[1][6], '')
})

test('missing historical return snapshots retain records without inventing units or definitive profit', () => {
  const bill = receipt()
  const entry = makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true })
  const item = itemPerformance([], [], [entry], [])[0]
  assert.equal(item.activityCount, 1)
  assert.equal(item.amountsKnown, false)
  assert.equal(item.quantitiesKnown, false)
  assert.equal(item.costKnown, false)
  const summary = netReportSummary([], [entry], [], [])
  assert.equal(summary.sales, -350)
  assert.equal(summary.salesKnown, true)
  assert.equal(summary.accountingIssue, true)
  assert.equal(summary.unverifiedCost, true)
  const missingPayload = { ...bill, lines: [], accountingIssue: 'Historical payload is missing' }
  const missingSummary = netReportSummary([missingPayload])
  assert.equal(missingSummary.count, 1)
  assert.equal(missingSummary.sales, bill.total)
  assert.equal(missingSummary.unverifiedCost, true)
})

test('unresolved customer histories retain bills but never become paid or settled filter results', () => {
  const bill = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), createdAt: '2026-10-08T09:00:00Z' }
  const newer = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 900, 'cash'), createdAt: '2026-10-09T09:00:00Z' }
  const unrelated = makeReceipt({ ...initialState, customerId: 'c2' }, 900, 'cash')
  const entry = { ...makeReturn(bill, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true }),
    accountingIssue: 'Legacy settlement currency differs from header',
    settlement: { dueReduced: 35000, exchangeCredit: 0, payout: 0, creditIssued: 0, received: 0, newDue: 0, method: 'cash' as const },
  }
  const receipts = [bill, newer, unrelated]
  const context = { allReceipts: receipts, returns: [entry] }
  const filters = { query: '', method: 'all', status: 'all', sort: 'newest' }
  assert.equal(reportBillAccountingReady(bill, receipts, [], [entry]), false)
  assert.equal(reportBillAccountingReady(newer, receipts, [], [entry]), false)
  assert.equal(reportBillAccountingReady(unrelated, receipts, [], [entry]), true)
  assert.equal(filterReportBills(receipts, filters, context).length, 3)
  assert.deepEqual(filterReportBills(receipts, { ...filters, status: 'paid' }, context), [unrelated])
  assert.deepEqual(filterReportBills(receipts, { ...filters, status: 'settled' }, context), [])
  assert.deepEqual(filterReportBills(receipts, { ...filters, status: 'due' }, context), [])
  assert.equal(bill.due, 900)
})
