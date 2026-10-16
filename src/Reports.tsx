import { useRef, useState } from 'react'
import { Icon, ProductArt } from './Icons'
import { purchaseAccount, purchaseCashEntries, supplierOutstandingDue, invoiceReceivingStatus, type StockReceiving, type SupplierPayment, type PurchaseSettlement, cleanSearchText, dhakaDateKey, filterByWindow, filterReceiptsByWindow, money, quantityWithUnit, receiptOutstandingDue, reportRange, reportWindowMode, type AccountTransaction, type Expense, type Lang, type Product, type Purchase, type Receipt, type ReportWindow, type Return } from './model'
import { suppliersTranslator } from './suppliersCopy'
import { translator } from './i18n'
import { reportsTranslator } from './reportsCopy'
import { expenseSummary, filterReportBills, itemPerformance, netReportSummary, netSalesBuckets, purchaseSummary, reportBillAccountingReady, reportSummary, returnSummary, salesShare } from './reportsModel'
import './reports.css'
import { ReportWindowControl } from './ReportWindowControl'
import { useReportMotion } from './useReportMotion'
import { formatUiDate } from './dateFormat'

type Props = {
  receipts: Receipt[]; catalog: Product[]; lang: Lang; now: Date; window: ReportWindow
  stockReceivings?: StockReceiving[]
  supplierPayments?: SupplierPayment[]; purchaseSettlements?: PurchaseSettlement[]
  purchases: Purchase[]; expenses: Expense[]; returns: Return[]; transactions?: AccountTransaction[]
  onWindow: (window: ReportWindow) => void; onReceipt: (receipt: Receipt) => void
  onItem: (product: Product) => void; onCounter: () => void
}
type Tab = 'overview' | 'bills' | 'items'
const number = (value: number) => String(value).padStart(4, '0')
const amount = (value: number) => `৳ ${money(value)}`

export function Reports({ receipts, catalog, lang, now, window, purchases, expenses, returns, transactions = [], supplierPayments = [], purchaseSettlements = [], stockReceivings = [], onWindow, onReceipt, onItem, onCounter }: Props) {
  const t = translator(lang), rt = reportsTranslator(lang), st = suppliersTranslator(lang)
  const billWord = (count: number) => lang === 'en' && count === 1 ? 'bill' : rt('bills')
  const itemWord = (count: number) => lang === 'en' && count === 1 ? 'item' : rt('billItems')
  const resultWord = (count: number) => lang === 'en' && count === 1 ? 'result' : rt('results')
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [query, setQuery] = useState('')
  const [method, setMethod] = useState('all')
  const [status, setStatus] = useState('all')
  const [billSort, setBillSort] = useState('newest')
  const [itemSort, setItemSort] = useState('revenue')
  const [itemScope, setItemScope] = useState('sold')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(0)
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null)
  const motionRoot = useRef<HTMLElement>(null)
  const motionKey = typeof window === 'string' ? window : JSON.stringify(window)
  useReportMotion(motionRoot, motionKey)
  const locale = lang === 'bn' ? 'bn-BD' : 'en-GB'
  const date = (time: number | string) => formatUiDate(time)
  const time = (value: number | string) => new Date(value).toLocaleTimeString('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false })
  const range = reportRange(window, now)
  const mode = reportWindowMode(window)
  const setPeriod = (next: ReportWindow) => { onWindow(next); setPage(0); setSelectedBucket(null) }
  const period = filterReceiptsByWindow(receipts, window, now)
  const summary = reportSummary(period)
  const periodPurchases = filterByWindow(purchases, window, now)
  const periodExpenses = filterByWindow(expenses, window, now)
  const periodReturns = filterByWindow(returns, window, now)
  const periodTransactions = filterByWindow(transactions, window, now)
  const expensesTotal = expenseSummary(periodExpenses)
  const purchasesTotal = purchaseSummary(periodPurchases)
  const returnsTotal = returnSummary(periodReturns)
  const financial = netReportSummary(period, periodReturns, periodExpenses, receipts)
  const netSales = financial.sales
  const grossProfit = financial.profit
  const collected = financial.paid
  const customerPayments = periodTransactions.filter(tx => tx.type === 'payment').reduce((sum, tx) => sum + tx.amount, 0)
  const cashEntries = purchaseCashEntries(purchases, supplierPayments, purchaseSettlements)
  const stockEvents = [...purchases.filter(p=>p.mode!=='invoice'&&!p.voidedAt).map(p=>({createdAt:p.createdAt,total:p.total})),...stockReceivings.filter(r=>!purchases.find(p=>p.id===r.purchaseId)?.voidedAt).map(r=>({createdAt:r.createdAt,total:r.lines.reduce((s,l)=>s+l.total,0)}))]
  const periodStock = filterByWindow(stockEvents, window, now)
  const periodCash = filterByWindow(cashEntries, window, now)
  const purchasePayments = periodCash.filter(p => p.type === 'payment').reduce((s,p) => s + p.amount, 0)
  const supplierRefunds = periodCash.filter(p => p.type === 'refund').reduce((s,p) => s + p.amount, 0)
  const purchasesKnown = periodPurchases.every(p => purchaseAccount(p, supplierPayments, purchaseSettlements).known)
  const awaitingStockValue = purchases.filter(p=>!p.voidedAt).reduce((s,p)=>s+invoiceReceivingStatus(p,stockReceivings).remainingValue,0)
  const supplierDue = supplierOutstandingDue(purchases, supplierPayments, purchaseSettlements, range.end)
  const selectedDay = typeof window === 'object' && window.mode === 'day' ? window.date : dhakaDateKey(now)
  const supplierDueScope = mode === 'day' && selectedDay === dhakaDateKey(now) ? t('today') : `${rt('asOf')} ${date(range.end - 1)}`
  const moneyIn = collected + customerPayments + supplierRefunds
  const moneyOut = purchasePayments + expensesTotal.total + returnsTotal.paid
  const netMovement = moneyIn - moneyOut
  const netProfit = financial.netProfit
  const previous = netReportSummary(
    receipts.filter(r => Date.parse(r.createdAt) >= range.start - range.days * 86400000 && Date.parse(r.createdAt) < range.start),
    returns.filter(r => Date.parse(r.createdAt) >= range.start - range.days * 86400000 && Date.parse(r.createdAt) < range.start),
    [], receipts)
  const previousNetSales = previous.sales
  const change = financial.salesKnown && previous.salesKnown && previousNetSales ? (netSales - previousNetSales) / Math.abs(previousNetSales) * 100 : null
  const stats = itemPerformance(catalog, period, periodReturns, receipts)
  const topItems = stats.filter(item => item.activityCount).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const outstandingBills = period.map(r => ({ receipt: r,
    accountingReady: reportBillAccountingReady(r, receipts, transactions, returns),
    remaining: reportBillAccountingReady(r, receipts, transactions, returns) ? receiptOutstandingDue(r, receipts, transactions, returns) : 0 }))
  const periodDueKnown = outstandingBills.every(item => item.accountingReady)
  const periodOutstandingDue = outstandingBills.reduce((sum, item) => sum + item.remaining, 0)
  const activeDueCount = outstandingBills.filter(item => item.remaining > 0).length
  const bills = filterReportBills(period, { query, method, status, sort: billSort }, { allReceipts: receipts, transactions, returns })
  const search = cleanSearchText(query).trim()
  const items = stats.filter(item => (!search || item.variants.some(p => cleanSearchText(`${p.en} ${p.code}`).includes(search)))
    && (category === 'all' || item.product.category === category)
    && (itemScope === 'all' || (itemScope === 'sold' ? item.activityCount > 0 : item.activityCount === 0)))
    .sort((a, b) => itemSort === 'profit' ? b.profit - a.profit : itemSort === 'bills' ? b.count - a.count : b.revenue - a.revenue)
  const buckets = netSalesBuckets(period, periodReturns, periodExpenses, window, now, false, receipts)
  const maxSales = Math.max(1, ...buckets.map(bucket => bucket.salesKnown ? bucket.sales : 0))
  const inspected = selectedBucket === null ? null : buckets.find(bucket => bucket.start === selectedBucket)
  const count = activeTab === 'items' ? items.length : bills.length
  const lastPage = Math.max(0, Math.ceil(count / 20) - 1)
  const currentPage = Math.min(page, lastPage)
  const offset = currentPage * 20
  const filteredTotals = activeTab === 'items'
    ? items.reduce((sum, item) => ({ sales: sum.sales + item.revenue, profit: sum.profit + item.profit }), { sales: 0, profit: 0 })
    : reportSummary(bills)
  const filteredAmountsKnown = activeTab === 'items' ? items.every(item => item.amountsKnown) : !reportSummary(bills).accountingIssue
  const hasFilters = Boolean(query || (activeTab === 'bills' ? method !== 'all' || status !== 'all' : category !== 'all' || itemScope !== 'sold'))
  const resetFilters = () => { setQuery(''); setMethod('all'); setStatus('all'); setCategory('all'); setItemScope('sold'); setPage(0) }
  const switchTab = (next: Tab) => { setActiveTab(next); setQuery(''); setPage(0) }
  const showDue = () => { switchTab('bills'); setMethod('all'); setStatus(periodDueKnown ? 'due' : 'all') }
  const bucketLabel = (start: number) => mode === 'day' ? time(start) : date(start)
  const empty = <div className="empty-state report-empty"><Icon name={hasFilters ? 'search' : 'reports'} size={28}/><h3>{hasFilters ? rt('noMatches') : t('noSales')}</h3><p>{hasFilters ? rt('noMatchesHint') : rt('emptyHint')}</p><button className="text-button" onClick={hasFilters ? resetFilters : onCounter}>{hasFilters ? rt('showAll') : t('sales')}<Icon name="arrow" size={14}/></button></div>

  return <section className="secondary-view reports-view" aria-label={t('reports')} ref={motionRoot}>
    <div className="report-toolbar">
      <div className="report-period"><span className="eyebrow">{rt('periodSummary')}</span><strong>{date(range.start)}{range.days > 1 && ` — ${date(range.end - 1)}`}</strong></div>
      <div className="report-toolbar-actions"><ReportWindowControl window={window} onWindow={setPeriod} now={now} lang={lang} idPrefix="report" /></div>
    </div>
    <div className="metrics-grid report-metrics">
      <div className="metric-card"><div><span className="eyebrow">{rt('netSales')}</span><Icon name="reports" size={16}/></div><strong>{financial.salesKnown ? amount(netSales) : '—'}</strong><p>{summary.count} {billWord(summary.count)}<span>·</span>{rt('averageBill')} {amount(summary.average)}</p><small className="report-comparison">{change === null ? rt('noPrevious') : `${change > 0 ? '+' : ''}${change.toFixed(1)}% ${rt('previous')} ${range.days} ${rt('days')}`}</small></div>
      <div className="metric-card"><div><span className="eyebrow">{rt('grossProfit')}</span><Icon name="cash" size={16}/></div><strong className={grossProfit < 0 ? 'report-loss' : ''}>{financial.accountingIssue ? '—' : amount(grossProfit)}</strong><p>{financial.unassignedServiceCost || financial.unverifiedCost ? '—' : `${financial.margin.toFixed(1)}% ${rt('margin')}`}</p><small>{rt('profitHint')}</small></div>
      <div className="metric-card"><div><span className="eyebrow">{rt('collected')}</span><Icon name="check" size={16}/></div><strong>{financial.settlementKnown ? amount(collected) : '—'}</strong><p>{rt('paymentHint')}</p><small>{t('cash')} / {t('mobile')} / {t('bank')}</small></div>
      <div className="metric-card"><div><span className="eyebrow">{rt('newDue')}</span><Icon name="accounts" size={16}/></div><strong>{periodDueKnown ? amount(periodOutstandingDue) : '—'}</strong><p>{rt('dueBills')}: {periodDueKnown ? activeDueCount : '—'}</p><button className="text-button" onClick={showDue}>{rt('viewBills')}<Icon name="arrow" size={13}/></button></div>
    </div>
    <div className="report-navigation" role="group" aria-label={t('reports')}>
      {(['overview', 'bills', 'items'] as Tab[]).map(item => <button key={item} aria-pressed={activeTab === item} className={activeTab === item ? 'active' : ''} onClick={() => switchTab(item)}>{item === 'items' ? t('reportsTabsProducts') : item === 'bills' ? t('reportsTabsSales') : rt('overview')}{item !== 'overview' && <span className="report-nav-count">{item === 'bills' ? period.length : stats.filter(item => item.activityCount).length}</span>}</button>)}
    </div>
    {activeTab === 'overview' ? <>
      <div className="report-overview-grid">
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{rt('salesTrend')}</h2></div><span className="report-panel-meta">{rt(mode === 'day' ? 'twoHours' : 'daily')}</span></div><div className="report-chart-body"><div className="report-chart-title"><span><i/>{rt('trendHint')}</span><strong className="report-digit">{financial.salesKnown ? amount(netSales) : '—'}</strong></div><div className="report-chart" role="group" aria-label={rt('salesTrend')}>
          {buckets.map((bucket, index) => <button key={bucket.start} className={`report-chart-column ${selectedBucket === bucket.start ? 'selected' : ''} ${bucket.salesKnown && bucket.sales > 0 ? 'has-sales' : ''}`} onClick={() => setSelectedBucket(selectedBucket === bucket.start ? null : bucket.start)} aria-pressed={selectedBucket === bucket.start} aria-label={`${bucketLabel(bucket.start)} — ${bucket.salesKnown ? amount(bucket.sales) : '—'}, ${bucket.count} ${billWord(bucket.count)}`} title={`${bucketLabel(bucket.start)} — ${bucket.salesKnown ? amount(bucket.sales) : '—'}`}><span className="report-bar-space"><span className="report-bar" style={{ height: bucket.salesKnown && bucket.sales > 0 ? `${Math.max(3, bucket.sales / maxSales * 100)}%` : '2px' }}><span className="report-bar-value report-digit" aria-hidden="true">{bucket.salesKnown ? amount(bucket.sales) : '—'}</span></span></span><small className="report-digit">{buckets.length <= 12 || index % Math.ceil(buckets.length / 8) === 0 || index === buckets.length - 1 ? (mode === 'day' ? time(bucket.start).slice(0, 2) : new Date(bucket.start).toLocaleDateString(locale, { timeZone: 'Asia/Dhaka', day: '2-digit' })) : '\u00a0'}</small></button>)}
        </div><div className="report-chart-detail" aria-live="polite">{inspected ? <><strong className="report-digit">{bucketLabel(inspected.start)}{mode === 'day' && ` — ${time(inspected.end - 1)}`}</strong><span><span className="report-digit">{inspected.salesKnown ? amount(inspected.sales) : '—'}</span> · <span className="report-digit">{inspected.count}</span> {billWord(inspected.count)} · {rt('profit')} <span className="report-digit">{inspected.accountingIssue ? '—' : amount(inspected.profit)}</span></span></> : <span>{rt('selectBar')}</span>}</div></div></div>
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{rt('paymentBreakdown')}</h2></div></div><div className="report-payment-body"><p className="report-description">{rt('paymentHint')}</p>{(['cash', 'mobile', 'bank'] as const).map(method => {
          const received = period.filter(r => r.method === method).reduce((sum, r) => sum + r.paid, 0) + periodReturns.filter(r => r.settlement?.method === method).reduce((sum, r) => sum + (r.settlement?.received ?? 0), 0)
          return <div className="report-payment-method" key={method}><div><span><Icon name={method} size={15}/>{t(method)}</span><strong className="report-digit">{financial.settlementKnown ? amount(received) : '—'}</strong></div><div className="report-meter"><span style={{ width: `${financial.settlementKnown && collected ? received / collected * 100 : 0}%` }}/></div></div>
        })}<div className="report-payment-total"><span>{rt('received')}</span><strong className="report-digit">{financial.settlementKnown ? amount(collected) : '—'}</strong></div></div></div>
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{rt('reconciliation')}</h2></div><span className="report-panel-meta">BDT</span></div>
          <dl className="report-reconciliation">
            <div><dt>{rt('grossSales')}</dt><dd className="report-digit">{amount(summary.gross)}</dd></div>
            <div><dt>{rt('discounts')}</dt><dd className="report-digit">− {amount(summary.discount)}</dd></div>
            <div><dt>{rt('checkoutSales')}</dt><dd className="report-digit">{amount(summary.sales)}</dd></div>
            <div><dt>{rt('returnValue')}</dt><dd className="report-digit">− {amount(returnsTotal.refunded)}</dd></div>
            <div><dt>{rt('exchangeSales')}</dt><dd className="report-digit">+ {financial.salesKnown ? amount(returnsTotal.replacementSales) : '—'}</dd></div>
            <div className="report-subtotal"><dt>{rt('netSales')}</dt><dd className="report-digit">{financial.salesKnown ? amount(netSales) : '—'}</dd></div>
            <div><dt>{rt('cost')}</dt><dd className="report-digit">− {financial.accountingIssue ? '—' : amount(financial.cost)}</dd></div>
            <div className="report-profit-total"><dt>{rt('grossProfit')}</dt><dd className={`report-digit ${grossProfit < 0 ? 'report-loss' : ''}`}>{financial.accountingIssue ? '—' : amount(grossProfit)}</dd></div>
            <div><dt>{rt('expenses')}</dt><dd className="report-digit">− {amount(expensesTotal.total)}</dd></div>
            <div className="report-profit-total"><dt>{rt('netProfit')}</dt><dd className={`report-digit ${netProfit < 0 ? 'report-loss' : ''}`}>{financial.accountingIssue ? '—' : amount(netProfit)}</dd></div>
          </dl>
        </div>
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{st('suppliers')}</h2></div></div><dl className="report-reconciliation"><div><dt>{st('purchaseValue')}</dt><dd className="report-digit">{amount(purchasesTotal.total)}</dd></div><div><dt>{st('due')} ({supplierDueScope})</dt><dd className="report-digit">{amount(supplierDue)}</dd></div><div><dt>{st('stockReceived')}</dt><dd className="report-digit">{amount(periodStock.reduce((s,p)=>s+p.total,0))}</dd></div><div><dt>{st('unreceivedValue')}</dt><dd className="report-digit">{amount(awaitingStockValue)}</dd></div></dl>{purchases.some(p => !p.voidedAt && !purchaseAccount(p, supplierPayments, purchaseSettlements).known) && <div className="report-panel-note">{st('reviewReport')}</div>}</div>
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{rt('moneyOut')}</h2></div><span className="report-panel-meta">BDT</span></div><dl className="report-reconciliation"><div><dt>{st('payments')}</dt><dd className="report-digit">{purchasesKnown ? amount(purchasePayments) : '—'}</dd></div><div><dt>{rt('expenses')}</dt><dd className="report-digit">{amount(expensesTotal.total)}</dd></div><div><dt>{rt('refunds')}</dt><dd className="report-digit">{financial.settlementKnown ? amount(returnsTotal.paid) : '—'}</dd></div><div className="report-subtotal"><dt>{rt('totalOut')}</dt><dd className="report-digit">{financial.settlementKnown && purchasesKnown ? amount(moneyOut) : '—'}</dd></div></dl></div>
        <div className="panel report-panel"><div className="panel-heading"><div className="section-title"><h2>{rt('topItems')}</h2></div><button className="text-button" onClick={() => switchTab('items')}>{rt('viewAll')}<Icon name="arrow" size={13}/></button></div><p className="report-description report-top-description">{rt('topHint')}</p>{topItems.length ? <div className="report-top-items">{topItems.map((item, index) => <button key={item.key} onClick={() => onItem(item.product)}><span className="report-top-product"><span className="report-rank report-digit">{String(index + 1).padStart(2, '0')}</span><ProductArt product={item.product}/><span className="report-top-name"><strong>{item.product.en}</strong><small><span className="report-digit">{item.quantitiesKnown && item.quantities.length ? item.quantities.map(q => quantityWithUnit(q.quantity, q.unit)).join(' / ') : '—'}</span><span aria-hidden="true"> · </span><span className="report-digit">{item.count}</span> {billWord(item.count)}</small></span></span><span className="report-top-metrics"><span className="report-top-metric"><small>{rt('netRevenue')}</small><strong className="report-top-amount report-digit">{item.amountsKnown ? amount(item.revenue) : '—'}</strong></span><span className="report-top-metric"><small>{rt('grossProfit')}</small><strong className={`report-top-profit report-digit ${item.profit < 0 ? 'report-loss' : ''}`}>{item.costKnown ? amount(item.profit) : '—'}</strong></span></span><Icon name="chevron" size={13}/></button>)}</div> : <div className="report-top-empty"><Icon name="inventory" size={25}/><p>{t('noSales')}</p><button className="text-button" onClick={onCounter}>{t('sales')}<Icon name="arrow" size={13}/></button></div>}</div>
        <div className="panel report-panel report-movement"><div className="panel-heading"><div className="section-title"><h2>{rt('moneyMovement')}</h2></div><span className="report-panel-meta">BDT</span></div><dl className="report-reconciliation">
          <div><dt>{rt('checkoutPayments')}</dt><dd className="report-digit">{financial.settlementKnown ? amount(collected) : '—'}</dd></div>
          <div><dt>{st('refunds')}</dt><dd className="report-digit">{amount(supplierRefunds)}</dd></div><div><dt>{rt('customerPayments')}</dt><dd className="report-digit">{amount(customerPayments)}</dd></div>
          <div className="report-subtotal"><dt>{rt('totalIn')}</dt><dd className="report-digit">{financial.settlementKnown ? amount(moneyIn) : '—'}</dd></div>
          <div><dt>{rt('totalOut')}</dt><dd className="report-digit">− {financial.settlementKnown && purchasesKnown ? amount(moneyOut) : '—'}</dd></div>
          <div className="report-profit-total"><dt>{rt('moneyMovement')}</dt><dd className={`report-digit ${netMovement < 0 ? 'report-loss' : ''}`}>{!financial.settlementKnown || !purchasesKnown ? '—' : netMovement < 0 ? `− ${amount(-netMovement)}` : amount(netMovement)}</dd></div>
        </dl></div>
      </div>
    </> : <div className="panel data-panel report-results">
      <div className="report-filters"><div className="report-search"><Icon name="search" size={16}/><input aria-label={rt('searchLabel')} placeholder={rt(activeTab === 'bills' ? 'searchBills' : 'searchItems')} value={query} onChange={e => { setQuery(e.target.value); setPage(0) }}/>{query && <button aria-label={rt('showAll')} onClick={() => { setQuery(''); setPage(0) }}><Icon name="close" size={14}/></button>}</div>
        {activeTab === 'bills' ? <><label><span>{rt('paymentMethod')}</span><select value={method} onChange={e => { setMethod(e.target.value); setPage(0) }}><option value="all">{rt('allMethods')}</option>{(['cash', 'mobile', 'bank'] as const).map(method => <option key={method} value={method}>{t(method)}</option>)}</select></label><label><span>{rt('paymentStatus')}</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="all">{rt('allStatuses')}</option><option value="paid">{rt('paid')}</option><option value="settled">{rt('settled')}</option><option value="due">{rt('due')}</option></select></label><label><span>{rt('sort')}</span><select value={billSort} onChange={e => { setBillSort(e.target.value); setPage(0) }}><option value="newest">{rt('newest')}</option><option value="oldest">{rt('oldest')}</option><option value="amount">{rt('largest')}</option><option value="settled">{rt('settled')}</option></select></label></>
        : <><label><span>{rt('category')}</span><select value={category} onChange={e => { setCategory(e.target.value); setPage(0) }}><option value="all">{rt('allCategories')}</option>{(['staples', 'fresh', 'household'] as const).map(category => <option key={category} value={category}>{t(category)}</option>)}</select></label><label><span>{rt('itemScope')}</span><select value={itemScope} onChange={e => { setItemScope(e.target.value); setPage(0) }}><option value="sold">{rt('soldItems')}</option><option value="all">{rt('allItems')}</option><option value="unsold">{rt('unsoldItems')}</option></select></label><label><span>{rt('sort')}</span><select value={itemSort} onChange={e => { setItemSort(e.target.value); setPage(0) }}><option value="revenue">{rt('bySales')}</option><option value="profit">{rt('byProfit')}</option><option value="bills">{rt('byBills')}</option></select></label></>}
      </div>
      <div className="report-results-summary" aria-live="polite"><span>{count} {resultWord(count)}{hasFilters && <button onClick={resetFilters}>{rt('showAll')}<Icon name="close" size={12}/></button>}</span><span>{rt('filteredSales')} <strong>{filteredAmountsKnown ? amount(filteredTotals.sales) : '—'}</strong><span className="report-result-profit">{rt('filteredProfit')} <strong>{filteredAmountsKnown ? amount(filteredTotals.profit) : '—'}</strong></span></span></div>
      {count ? <div className="data-table-wrap"><table className="data-table report-table"><caption className="sr-only">{activeTab === 'bills' ? t('reportsTabsSales') : t('reportsTabsProducts')} · {date(range.start)} — {date(range.end - 1)}</caption>
        {activeTab === 'bills' ? <><thead><tr><th>{t('transaction')} / {rt('date')}</th><th>{t('customer')} / {t('items')}</th><th>{rt('paymentMethod')}</th><th className="numeric-cell">{rt('amount')}</th><th className="numeric-cell">{rt('received')}</th><th className="numeric-cell">{t('due')}</th><th>{rt('status')}</th><th><span className="sr-only">{t('viewReceipt')}</span></th></tr></thead><tbody>{bills.slice(offset, offset + 20).map(r => {
          const accountingReady = reportBillAccountingReady(r, receipts, transactions, returns)
          const currentDue = accountingReady ? receiptOutstandingDue(r, receipts, transactions, returns) : null
          const isSettled = r.due > 0 && currentDue === 0
          return <tr key={r.id} className="clickable-row" tabIndex={0} onClick={event => { if ((event.target as Element).closest("button, a, input, select, textarea, [role=button]")) return; onReceipt(r) }} onKeyDown={event => { if ((event.target as Element).closest("button, a, input, select, textarea, [role=button]")) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onReceipt(r) } }}><td><button className="report-bill-link" onClick={() => onReceipt(r)}>#{number(r.number)}</button><small className="report-cell-detail">{date(r.createdAt)} · {time(r.createdAt)}</small></td><td><strong>{r.customer?.[lang] ?? t('walkIn')}</strong><small className="report-cell-detail report-item-preview" title={r.lines.map(line => line.product.en).join(', ')}>{r.lines.length} {itemWord(r.lines.length)} · {r.lines.map(line => line.product.en).join(', ')}</small></td><td><span className="report-method"><Icon name={r.method} size={13}/>{t(r.method)}</span></td><td className="numeric-cell"><strong>{amount(r.total)}</strong>{r.discount > 0 && <small className="report-cell-detail">{rt('discounts')} {amount(r.discount)}</small>}</td><td className="numeric-cell">{amount(r.paid)}</td><td className="numeric-cell">{currentDue ? <strong className="report-due-text">{amount(currentDue)}</strong> : isSettled ? <small style={{ color: 'var(--muted, #888)' }}>0.00</small> : '—'}</td><td><span className={`report-status ${!accountingReady ? 'unknown' : currentDue ? 'due' : 'paid'}`}>{rt(!accountingReady ? 'unavailable' : currentDue ? 'due' : isSettled ? 'settled' : 'paid')}</span></td><td><button className="icon-button" aria-label={`${t('viewReceipt')} #${number(r.number)}`} onClick={() => onReceipt(r)}><Icon name="chevron" size={16}/></button></td></tr>
        })}</tbody></>
        : <><thead><tr><th>{t('product')}</th><th className="numeric-cell">{rt('quantity')}</th><th className="numeric-cell">{rt('netRevenue')}</th><th className="numeric-cell">{rt('profit')}</th><th className="numeric-cell">{rt('margin')}</th><th className="numeric-cell">{t('receiptsToday')}</th><th className="numeric-cell">{rt('share')}</th><th><span className="sr-only">{t('viewItemStats')}</span></th></tr></thead><tbody>{items.slice(offset, offset + 20).map(item => <tr key={item.key} className="clickable-row" tabIndex={0} onClick={event => { if ((event.target as Element).closest("button, a, input, select, textarea, [role=button]")) return; onItem(item.product) }} onKeyDown={event => { if ((event.target as Element).closest("button, a, input, select, textarea, [role=button]")) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onItem(item.product) } }}><td><div className="inventory-product"><ProductArt product={item.product}/><span><button className="report-item-link" onClick={() => onItem(item.product)}>{item.product.en}</button><small>{item.variants.map(p => p.code).join(' / ')}{item.variants.length > 1 ? ` · ${item.variants.length} ${t('variants')}` : ''}{item.variants.every(p => p.archived) ? ` · ${t('statusInactive')}` : ''}</small></span></div></td><td className="numeric-cell">{item.quantitiesKnown && item.quantities.length ? item.quantities.map(q => <div key={q.unit}>{quantityWithUnit(q.quantity, q.unit)}</div>) : '—'}</td><td className="numeric-cell"><strong>{item.amountsKnown ? amount(item.revenue) : '—'}</strong></td><td className={`numeric-cell ${item.profit < 0 ? 'report-loss' : 'report-profit'}`}>{item.costKnown ? amount(item.profit) : '—'}</td><td className="numeric-cell">{item.revenue > 0 && item.costKnown ? `${item.margin.toFixed(1)}%` : '—'}</td><td className="numeric-cell">{item.count}</td><td className="numeric-cell"><div className="report-share">{salesShare(item.revenue, financial.salesKnown && item.amountsKnown ? netSales : 0) === null ? '—' : `${salesShare(item.revenue, financial.salesKnown && item.amountsKnown ? netSales : 0)!.toFixed(1)}%`}<span><i style={{ width: `${Math.min(100, Math.max(0, salesShare(item.revenue, financial.salesKnown && item.amountsKnown ? netSales : 0) ?? 0))}%` }}/></span></div></td><td><button className="icon-button" aria-label={`${t('viewItemStats')}: ${item.product.en}`} onClick={() => onItem(item.product)}><Icon name="chevron" size={16}/></button></td></tr>)}</tbody></>}
      </table></div> : empty}
      {count > 0 && <div className="report-pagination"><span>{offset + 1}–{Math.min(count, offset + 20)} {rt('of')} {count}</span><div><button aria-label={rt('previousPage')} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><Icon name="chevron" size={13}/></button><span>{rt('page')} {currentPage + 1} {rt('of')} {lastPage + 1}</span><button aria-label={rt('nextPage')} disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><Icon name="chevron" size={13}/></button></div></div>}

    </div>}
    <div className="report-source-note"><span><i/>{rt('source')} · {rt('dhakaTime')}</span><span>{rt('scopeNote')}</span></div>
  </section>
}
