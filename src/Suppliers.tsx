import { useEffect, useRef, useState } from 'react'
import { filterPurchases, invoiceReceivingStatus, money, parseMoney, purchaseAccount, quantityWithUnit, supplierAccount, type Lang, type PaymentMethod, type Product, type Purchase, type PurchaseStatusFilter, type ReportWindow, type ShopState, type Supplier } from './model'
import { InvoiceEditor } from './InvoiceEditor'
import { Modal, type ModalHandle } from './Modal'
import { StockReceivingEditor } from './StockReceiving'
import { SupplierPicker } from './SupplierFields'
import { SupplierTransactionReport } from './SupplierTransactionReport'
import { ReportWindowControl } from './ReportWindowControl'
import { Icon } from './Icons'
import { suppliersTranslator } from './suppliersCopy'
import { formatUiDateTime } from './dateFormat'
import './suppliers.css'

type Props = { state: ShopState; catalog: Product[]; lang: Lang; now: Date; window: ReportWindow; onWindow: (window: ReportWindow) => void; purchaseRequest?: boolean; onPurchaseRequestHandled?: () => void; onUpdate: (fn: (s: ShopState) => ShopState) => Promise<boolean>; onVoid: (p: Purchase) => void }
export function Suppliers({ state, catalog, lang, now, window, onWindow, purchaseRequest, onPurchaseRequestHandled, onUpdate, onVoid }: Props) {
  const t = suppliersTranslator(lang), suppliers = state.suppliers ?? [], purchases = state.purchases ?? [], payments = state.supplierPayments ?? [], reviews = state.purchaseSettlements ?? []
  const [receivingId, setReceivingId] = useState<string | null>(null), [activeReceivingPurchase, setActiveReceivingPurchase] = useState<Purchase | null>(null)
  useEffect(() => { if (purchaseRequest) { setPurchaseOpen(true); setEditor(null); setTarget(null); setReceivingId(null); setActiveReceivingPurchase(null); onPurchaseRequestHandled?.() } }, [purchaseRequest, onPurchaseRequestHandled])
  const [selectedId, setSelectedId] = useState<string | null>(null), [query, setQuery] = useState(''), [showArchived, setShowArchived] = useState(false)
  const [purchaseQuery, setPurchaseQuery] = useState(''), [purchaseFilter, setPurchaseFilter] = useState<'all' | 'awaitingStock' | 'partReceived' | 'due'>('all')
  const [editor, setEditor] = useState<Supplier | null>(null), [purchaseOpen, setPurchaseOpen] = useState(false), [target, setTarget] = useState<Purchase | null>(null)
  const [paid, setPaid] = useState(''), [method, setMethod] = useState<PaymentMethod>('cash'), [reviewSupplier, setReviewSupplier] = useState(''), [reason, setReason] = useState('')
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [downloadingPoId, setDownloadingPoId] = useState<string | null>(null)
  const viewRef = useRef<HTMLElement>(null)
  const targetFormRef = useRef<HTMLFormElement | null>(null)
  const modalRef = useRef<ModalHandle>(null)
  const modalOpen = !!editor || purchaseOpen
  const closeModal = () => { if (!saving) modalRef.current?.exit() }
  const finishCloseModal = () => { setEditor(null); setPurchaseOpen(false); setError('') }
  useEffect(() => {
    if (!modalOpen) return
    const main = viewRef.current?.closest<HTMLElement>('.main-content')
    const bodyOverflow = document.body.style.overflow
    const mainOverflow = main?.style.overflow
    document.body.style.overflow = 'hidden'
    if (main) main.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      if (main) main.style.overflow = mainOverflow ?? ''
    }
  }, [modalOpen])
  const scrollToTargetForm = () => {
    const prefersReducedMotion = typeof globalThis.window !== 'undefined' && globalThis.window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth'
    targetFormRef.current?.scrollIntoView({ behavior, block: 'start' })
    targetFormRef.current?.closest('.main-content')?.scrollTo({ top: 0, behavior })
    if (typeof globalThis.window !== 'undefined') globalThis.window.scrollTo({ top: 0, behavior })
  }
  useEffect(() => {
    if (target) {
      scrollToTargetForm()
    }
  }, [target])
  const selected = suppliers.find(s => s.id === selectedId)
  const submit = async (fn: (s: ShopState) => ShopState) => { if (saving) return false; setSaving(true); setError(''); try { return await onUpdate(fn) } finally { setSaving(false) } }
  const openTarget = (p: Purchase) => {
    setTarget(p); setPaid(''); setMethod('cash'); setReviewSupplier(''); setReason(''); setError(''); setPurchaseOpen(false); setEditor(null); setReceivingId(null); setActiveReceivingPurchase(null)
    requestAnimationFrame(scrollToTargetForm)
  }
  const date = (value: string) => formatUiDateTime(value)
  const downloadPoReceipt = async (p: Purchase) => {
    if (downloadingPoId) return
    setDownloadingPoId(p.id); setError('')
    try {
      const { buildPurchaseOrderReceipt } = await import('./purchaseReport')
      const { downloadPurchaseOrderReceiptPdf } = await import('./purchaseReportPdf')
      const receiptData = buildPurchaseOrderReceipt(p, state, catalog, lang, now)
      await downloadPurchaseOrderReceiptPdf(receiptData)
    } catch {
      setError(t('reportError'))
    } finally {
      setDownloadingPoId(null)
    }
  }
  const purchaseDetail = (p: Purchase) => {
    const account = purchaseAccount(p, payments, reviews)
    const receiving = invoiceReceivingStatus(p, state.stockReceivings)
    const description = p.mode === 'invoice' ? p.invoiceLines?.map(l => l.description).join(', ') : p.lines.map(l => catalog.find(c => c.id === l.productId)?.en ?? l.productId).join(', ')
    return <details className={`supplier-bill${p.voidedAt ? ' supplier-bill-voided' : ''}`} key={p.id}>
      <summary>
        <span className="supplier-bill-chevron"><Icon name="chevron" size={15}/></span>
        <span className="supplier-bill-description"><strong>{p.invoiceNumber || description}</strong><small>{date(p.createdAt)} · {p.supplier || suppliers.find(s => s.id === account.supplierId)?.name || t('none')}</small></span>
        <span className="supplier-bill-statuses">{p.voidedAt ? <span className="supplier-status supplier-status-voided">{t('voided')}</span> : <>
          <span className={`supplier-status ${p.mode === 'invoice' && receiving.status !== 'received' ? 'supplier-status-pending' : 'supplier-status-neutral'}`}>{p.mode === 'invoice' ? t(receiving.status) : t('earlierStock')}</span>
          {!account.known && <span className="supplier-status supplier-status-pending">{t('unknown')}</span>}
        </>}</span>
        <div className="supplier-bill-pricing">
          <span className="supplier-bill-amount"><strong>৳ {money(p.total)}</strong>{!p.voidedAt && account.known && <small className={account.due > 0 ? 'supplier-balance-due' : 'supplier-balance-paid'}>{account.due > 0 ? `Due: ৳ ${money(account.due)}` : t('settled')}</small>}</span>
          <button
            type="button"
            className="supplier-bill-pdf-btn"
            title={`${t('downloadPoSummary')}: ${p.invoiceNumber || p.id}`}
            aria-label={`${t('downloadPoSummary')}: ${p.invoiceNumber || p.id}`}
            disabled={downloadingPoId === p.id}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              void downloadPoReceipt(p)
            }}
          >
            <Icon name="download" size={13}/>
            <span>{downloadingPoId === p.id ? '…' : 'PO PDF'}</span>
          </button>
        </div>
      </summary>
      <div className="supplier-bill-content">
      {p.mode === 'invoice' ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('invoiceDescription')}</th><th>{t('quantity')}</th><th>{t('receivedQty')}</th><th>{t('remaining')}</th><th>{t('cost')}</th></tr></thead><tbody>{receiving.lines.map(l => <tr key={l.id}><td>{l.description}</td><td>{quantityWithUnit(l.quantity,l.unit)}</td><td>{quantityWithUnit(l.receivedQuantity,l.unit)}</td><td>{quantityWithUnit(l.remainingQuantity,l.unit)}</td><td>৳ {money(l.total)}</td></tr>)}</tbody></table></div>
        : <div className="data-table-wrap"><table className="data-table"><thead><tr><th>{t('item')}</th><th>{t('quantity')}</th><th>{t('unitCost')}</th><th>{t('cost')}</th></tr></thead><tbody>{p.lines.map((line,index) => <tr key={index}><td>{catalog.find(c=>c.id===line.productId)?.en??line.productId}</td><td>{quantityWithUnit(line.quantity,catalog.find(c=>c.id===line.productId)?.unit??'pc')}</td><td>৳ {money(line.unitCost)}</td><td>৳ {money(line.total)}</td></tr>)}</tbody></table></div>}
      {(state.stockReceivings??[]).filter(r=>r.purchaseId===p.id).map(r=><details className="invoice-receiving-batch" key={r.id}><summary>{t('stockReceived')} · {date(r.createdAt)} · ৳ {money(r.lines.reduce((s,l)=>s+l.total,0))}</summary>{r.lines.map((l,i)=><p key={i}>{catalog.find(c=>c.id===l.productId)?.code} · {catalog.find(c=>c.id===l.productId)?.en} · {quantityWithUnit(l.quantity,catalog.find(c=>c.id===l.productId)?.unit??'pc')} · ৳ {money(l.total)}</p>)}{r.note&&<p>{r.note}</p>}</details>)}
      {p.note && <p>{p.note}</p>}{p.accountingIssue && <p className="field-error">{p.accountingIssue}</p>}
      {account.known && <p>{t('paid')}: ৳ {money(account.paid)} · {t('settlement')}: ৳ {money(account.due)}</p>}
      {reviews.find(r => r.purchaseId === p.id) && <p className="dialog-note">{t('reason')}: {reviews.find(r => r.purchaseId === p.id)!.note}</p>}
      {account.known && account.initialPaid > 0 && <p className="dialog-note">{date(p.createdAt)} · {t('payment')} · ৳ {money(account.initialPaid)} · {account.method ? t(account.method) : ''}</p>}
      {payments.filter(pay => pay.purchaseId === p.id).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt)).map(pay => <p className="dialog-note" key={pay.id}>{date(pay.createdAt)} · {t(pay.type === 'refund' ? 'refund' : 'payment')} · ৳ {money(pay.amount)} · {t(pay.method)}{pay.note ? ` · ${pay.note}` : ''}</p>)}
      <div className="supplier-actions">
        {!p.voidedAt && !p.accountingIssue && p.mode === 'invoice' && receiving.status !== 'received' && <button className="primary-button" onClick={()=>{setReceivingId(p.id);setActiveReceivingPurchase(p);setPurchaseOpen(false);setTarget(null);setEditor(null);setError('')}}>{t('receiveStock')}</button>}
        {!p.voidedAt && !p.accountingIssue && (!account.known || account.due > 0) && <button className="primary-button" onClick={() => openTarget(p)}>{t(account.known ? 'pay' : 'review')}</button>}
        <button className="secondary-button" type="button" disabled={downloadingPoId === p.id} onClick={() => void downloadPoReceipt(p)}><Icon name="download" size={14}/>{t(downloadingPoId === p.id ? 'downloadingReport' : 'poReceipt')}</button>
        {!p.voidedAt && !p.accountingIssue && <button className="secondary-button" onClick={() => onVoid(p)}>{t('void')}</button>}
      </div>
      {p.voidedAt && <p className="dialog-note">{date(p.voidedAt)} · {p.voidReason}</p>}
      </div>
    </details>
  }
  const account = selected ? supplierAccount(selected.id, purchases, payments, reviews) : null
  const matchingSuppliers = suppliers.filter(s => (showArchived || !s.archived) && `${s.name} ${s.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const unknown = purchases.filter(p => !p.voidedAt && !purchaseAccount(p, payments, reviews).known)
  const knownPurchases = purchases.filter(p => purchaseAccount(p, payments, reviews).known).slice().sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt))
  const totals = purchases.filter(p => !p.voidedAt).reduce((sum, p) => ({ total: sum.total + p.total, due: sum.due + purchaseAccount(p, payments, reviews).due }), { total: 0, due: 0 })

  const receivings = state.stockReceivings ?? []
  const purchaseCounts: Record<PurchaseStatusFilter, number> = {
    all: knownPurchases.length,
    awaitingStock: filterPurchases(knownPurchases, receivings, payments, reviews, { status: 'awaitingStock' }).length,
    partReceived: filterPurchases(knownPurchases, receivings, payments, reviews, { status: 'partReceived' }).length,
    due: filterPurchases(knownPurchases, receivings, payments, reviews, { status: 'due' }).length,
  }

  const filteredPurchases = filterPurchases(knownPurchases, receivings, payments, reviews, {
    status: purchaseFilter,
    query: purchaseQuery,
    suppliers,
    catalog,
  })

  const receivingTarget = (receivingId ? purchases.find(p => p.id === receivingId) : null) ?? activeReceivingPurchase

  return <section ref={viewRef} className="suppliers-view">
    <div className="supplier-actions supplier-toolbar">{selected && <button className="secondary-button supplier-back" onClick={() => { setSelectedId(null); setTarget(null); setEditor(null); setPurchaseOpen(false); setReceivingId(null); setActiveReceivingPurchase(null) }}><Icon name="arrow-left" size={15}/>{t('back')}</button>}{!selected && <ReportWindowControl window={window} onWindow={onWindow} now={now} lang={lang} idPrefix="suppliers"/>}<button className="secondary-button" onClick={() => { setEditor({ id: crypto.randomUUID(), name: '' }); setPurchaseOpen(false); setTarget(null); setReceivingId(null); setActiveReceivingPurchase(null) }}><Icon name="plus" size={15}/>{t('add')}</button><button className="primary-button" onClick={() => { setPurchaseOpen(true); setEditor(null); setTarget(null); setReceivingId(null); setActiveReceivingPurchase(null) }}><Icon name="expenses" size={15}/>{t('purchase')}</button></div>
    {!selected && <div className="metrics-grid supplier-overview">{([
      { label: 'active', value: String(suppliers.filter(s => !s.archived).length), icon: 'suppliers' },
      { label: 'total', value: `৳ ${money(totals.total)}`, icon: 'expenses' },
      { label: 'due', value: `৳ ${money(totals.due)}`, icon: 'cash' },
    ] as const).map(metric => <div className="metric-card" key={metric.label}><div><span className="eyebrow">{t(metric.label)}</span><Icon name={metric.icon} size={19}/></div><strong className={metric.label === 'due' && totals.due > 0 ? 'supplier-balance-due' : undefined}>{metric.value}</strong>{metric.label === 'due' && unknown.length > 0 && <small className="supplier-overview-note">{t('unconfirmedExcluded')}</small>}</div>)}</div>}
    {modalOpen && <Modal ref={modalRef} title={editor ? t(suppliers.some(s => s.id === editor.id) ? 'edit' : 'add') : t('purchase')} closeLabel={t('close')} onClose={closeModal} onExited={finishCloseModal} canClose={!saving} className={editor ? 'dialog-supplier' : 'dialog-supplier-invoice'}>
      {editor && <form className="panel supplier-form" onSubmit={async e => { e.preventDefault(); if (await submit(s => ({ ...s, suppliers: [...(s.suppliers ?? []).filter(v => v.id !== editor.id), { ...editor, name: editor.name.trim() }] }))) setEditor(null) }}>
        <h3>{suppliers.some(s => s.id === editor.id) ? t('edit') : t('add')}</h3><div className="form-grid">{(['name', 'phone', 'address', 'note'] as const).map(field => <div className="form-group" key={field}><label htmlFor={`supplier-${field}`}>{t(field)}{field === 'name' ? ' *' : ''}</label><input id={`supplier-${field}`} className="form-input" type={field === 'phone' ? 'tel' : 'text'} autoComplete={field === 'phone' ? 'tel' : undefined} value={editor[field] ?? ''} required={field === 'name'} maxLength={field === 'name' ? 200 : field === 'phone' ? 80 : 500} onChange={e => setEditor({ ...editor, [field]: e.target.value })}/></div>)}</div><div className="supplier-actions"><button className="primary-button" disabled={saving || !editor.name.trim()}>{t('save')}</button><button type="button" className="secondary-button" onClick={closeModal} disabled={saving}>{t('cancel')}</button></div>
      </form>}
      {purchaseOpen && <InvoiceEditor key={selectedId??'all'} purchases={purchases} suppliers={suppliers} lang={lang} supplierId={selected?.archived?'':selectedId??''} onSave={async (purchase, andReceive)=>{
        if(await submit(s=>({...s,purchases:[...s.purchases??[],purchase]}))){
          setPurchaseOpen(false)
          if (andReceive) {
            setActiveReceivingPurchase(purchase)
            setReceivingId(purchase.id)
          }
          return true
        }
        return false
      }} onCancel={closeModal}/>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>}
    {receivingTarget && <StockReceivingEditor key={receivingTarget.id} purchase={receivingTarget} receivings={state.stockReceivings??[]} catalog={catalog} lang={lang} onCreateProduct={p=>onUpdate(s=>({...s,customProducts:[...s.customProducts??[],p]}))} onSave={async r=>{
      if(await submit(s=>({...s,stockReceivings:[...s.stockReceivings??[],r]}))){
        setReceivingId(null)
        setActiveReceivingPurchase(null)
        return true
      }
      return false
    }} onCancel={()=>{setReceivingId(null);setActiveReceivingPurchase(null)}}/>}
    {target && <form ref={targetFormRef} className="panel supplier-form" onSubmit={async e => {
      e.preventDefault(); const amount = parseMoney(paid), known = purchaseAccount(target, payments, reviews).known
      const a = purchaseAccount(target, payments, reviews)
      if (amount === null || (known ? amount <= 0 || amount > a.due : amount > target.total || (amount < target.total && !reviewSupplier) || !reason.trim())) { setError(t('invalid')); return }
      const entry = { id: crypto.randomUUID(), purchaseId: target.id, createdAt: new Date().toISOString(), method, note: reason.trim() }
      const ok = known ? await submit(s => ({ ...s, supplierPayments: [...s.supplierPayments ?? [], { ...entry, supplierId: a.supplierId, type: 'payment', amount }] }))
        : await submit(s => ({ ...s, purchaseSettlements: [...s.purchaseSettlements ?? [], { ...entry, supplierId: reviewSupplier || undefined, paid: amount }] }))
      if (ok) setTarget(null)
    }}><h3>{t(purchaseAccount(target, payments, reviews).known ? 'pay' : 'review')}</h3><p>৳ {money(target.total)} · {date(target.createdAt)}</p>{purchaseAccount(target, payments, reviews).known && <p>{t('settlement')}: ৳ {money(purchaseAccount(target, payments, reviews).due)}</p>}
      {!purchaseAccount(target, payments, reviews).known && <><p className="dialog-note">{t('reviewHint')}</p><SupplierPicker suppliers={suppliers} lang={lang} value={reviewSupplier} onChange={setReviewSupplier}/></>}
      <div className="form-grid"><div className="form-group"><label htmlFor="supplier-payment-amount">{t('amount')}</label><input id="supplier-payment-amount" className="form-input" inputMode="numeric" value={paid} onChange={e => setPaid(e.target.value)} required/></div><div className="form-group"><label htmlFor="supplier-payment-method">{t('method')}</label><select id="supplier-payment-method" className="form-input" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{(['cash','mobile','bank'] as const).map(m => <option key={m} value={m}>{t(m)}</option>)}</select></div><div className="form-group"><label htmlFor="supplier-payment-note">{t(purchaseAccount(target, payments, reviews).known ? 'note' : 'reason')}</label><input id="supplier-payment-note" className="form-input" value={reason} onChange={e => setReason(e.target.value)} required={!purchaseAccount(target, payments, reviews).known} maxLength={500}/></div></div><div className="supplier-actions"><button className="primary-button" disabled={saving}>{t('save')}</button><button type="button" className="secondary-button" onClick={() => setTarget(null)}>{t('cancel')}</button></div></form>}
    {error && !modalOpen && <p className="field-error" role="alert">{error}</p>}
    {selected && account ? <><div className="panel supplier-profile"><div className="supplier-actions"><h2>{selected.name}</h2><button className="secondary-button" onClick={() => { setEditor({ ...selected }); setTarget(null); setPurchaseOpen(false); setReceivingId(null); setActiveReceivingPurchase(null) }}>{t('edit')}</button><button className="secondary-button" disabled={saving} onClick={() => void submit(s => ({ ...s, suppliers: (s.suppliers ?? []).map(v => v.id === selected.id ? { ...v, archived: !v.archived } : v) }))}>{t(selected.archived ? 'restore' : 'archive')}</button></div><p>{[selected.phone, selected.address, selected.archived ? t('archived') : ''].filter(Boolean).join(' · ')}</p>{selected.note && <p>{selected.note}</p>}<div className="supplier-stats">{([['total', account.total], ['paid', account.paid], ['due', account.due]] as const).map(([label, value]) => <div key={label}><span>{t(label)}</span><strong>৳ {money(value)}</strong></div>)}</div></div><SupplierTransactionReport key={selected.id} supplier={selected} state={state} catalog={catalog} lang={lang} now={now}/><div className="panel supplier-ledger"><div className="panel-heading"><div className="section-title"><Icon name="expenses" size={16}/><h2>{t('purchases')}</h2><span className="count-badge">{account.purchases.length}</span></div></div>{account.purchases.length ? [...account.purchases].sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(purchaseDetail) : <div className="empty-state supplier-empty"><p>{t('noHistory')}</p></div>}</div></>
      : <>
        <div className="panel supplier-ledger">
          <div className="panel-heading">
            <div className="section-title"><Icon name="expenses" size={16}/><h2>{t('purchases')}</h2><span className="count-badge">{filteredPurchases.length}</span></div>
            <div className="supplier-filter purchases-filter">
              <div className="category-tabs purchases-tabs" role="group" aria-label={t('purchases')}>
                {([
                  { id: 'all', label: 'filterAll' },
                  { id: 'awaitingStock', label: 'awaitingStockTab' },
                  { id: 'partReceived', label: 'partReceivedTab' },
                  { id: 'due', label: 'dueTab' },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={purchaseFilter === tab.id}
                    className={purchaseFilter === tab.id ? 'active' : ''}
                    onClick={() => setPurchaseFilter(tab.id)}
                  >
                    {t(tab.label)}
                    <span>{purchaseCounts[tab.id]}</span>
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="purchases-search">{t('search')}</label>
              <div className="supplier-list-search">
                <Icon name="search" size={15}/>
                <input
                  id="purchases-search"
                  className="form-input"
                  type="search"
                  value={purchaseQuery}
                  onChange={e => setPurchaseQuery(e.target.value)}
                  placeholder={t('searchInvoices')}
                />
              </div>
            </div>
          </div>
          {filteredPurchases.length ? filteredPurchases.map(purchaseDetail) : <div className="empty-state supplier-empty"><Icon name={knownPurchases.length ? 'search' : 'expenses'} size={25}/><p>{t(!knownPurchases.length ? 'noPurchases' : 'noMatch')}</p></div>}
        </div>
        <div className="panel supplier-directory">
          <div className="panel-heading">
            <div className="section-title"><Icon name="suppliers" size={17}/><h2>{t('all')}</h2><span className="count-badge">{matchingSuppliers.length}</span></div>
            <div className="supplier-filter">
              <label className="sr-only" htmlFor="supplier-search">{t('search')}</label>
              <div className="supplier-list-search"><Icon name="search" size={15}/><input id="supplier-search" className="form-input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search')}/></div>
              <label className="supplier-archive-filter"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>{t('includeArchived')}</label>
            </div>
          </div>
          <div className="data-table-wrap"><table className="data-table supplier-table"><thead><tr><th>{t('name')}</th><th>{t('phone')}</th><th className="numeric-cell">{t('total')}</th><th className="numeric-cell">{t('due')}</th><th>{t('last')}</th><th><span className="sr-only">{t('viewSupplier')}</span></th></tr></thead><tbody>{matchingSuppliers.map(s => {
            const a = supplierAccount(s.id, purchases, payments, reviews), dates = [...a.purchases.map(p => p.createdAt), ...payments.filter(p => p.supplierId === s.id).map(p => p.createdAt)].sort()
            const openSupplier = () => { setSelectedId(s.id); setTarget(null); setEditor(null); setPurchaseOpen(false); setReceivingId(null); setActiveReceivingPurchase(null) }
            return <tr key={s.id} className="clickable-row" onClick={openSupplier}>
              <td><div className="supplier-identity"><span className="supplier-avatar" aria-hidden="true">{Array.from(s.name.trim())[0]?.toLocaleUpperCase()}</span><div><button type="button" className="supplier-name" onClick={e => { e.stopPropagation(); openSupplier() }}>{s.name}</button>{s.archived && <small>{t('archived')}</small>}</div></div></td>
              <td>{s.phone || '—'}</td><td className="numeric-cell">৳ {money(a.total)}</td><td className="numeric-cell"><span className={a.due > 0 ? 'supplier-balance-due' : 'supplier-balance-paid'}>৳ {money(a.due)}</span>{a.unknown > 0 && <small className="supplier-table-unconfirmed">{t('unknown')}</small>}</td><td className="supplier-last-transaction">{dates.length ? date(dates[dates.length-1]) : '—'}</td><td><Icon name="chevron" size={14}/></td>
            </tr>
          })}</tbody></table></div>
          {!matchingSuppliers.length && <div className="empty-state supplier-empty"><Icon name={suppliers.length ? 'search' : 'suppliers'} size={25}/><p>{t(!suppliers.length ? 'empty' : 'noMatch')}</p></div>}
        </div>
        {unknown.length > 0 && <div className="panel supplier-ledger supplier-review-ledger">
          <div className="panel-heading"><div className="section-title"><Icon name="clock" size={16}/><h2>{t('legacy')}</h2><span className="count-badge">{unknown.length}</span></div></div>
          {unknown.slice().sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(purchaseDetail)}
        </div>}
    </>}
  </section>
}
