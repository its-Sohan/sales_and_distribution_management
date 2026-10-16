import { useState } from 'react'
import { computeTotalFromUnitCost, computeUnitCostFromTotal, makeInvoice, money, parseMoney, parseQuantity, type InvoiceLine, type Lang, type PaymentMethod, type Purchase, type Supplier } from './model'
import { SupplierPicker, PurchasePaymentFields } from './SupplierFields'
import { suppliersTranslator } from './suppliersCopy'
import { Icon } from './Icons'
import { dateInputLocale, formatDateInput } from './dateFormat'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
export function InvoiceEditor({ suppliers, lang, supplierId: initial, purchases, onSave, onCancel }: {
  suppliers: Supplier[]; purchases: Purchase[]; lang: Lang; supplierId: string
  onSave: (p: Purchase, andReceive?: boolean) => Promise<boolean>; onCancel: () => void
}) {
  const t = suppliersTranslator(lang)
  const [invoiceId] = useState(()=>crypto.randomUUID())
  const [supplierId, setSupplierId] = useState(initial), [seller, setSeller] = useState('')
  const [paid, setPaid] = useState(''), [method, setMethod] = useState<PaymentMethod>('cash')
  const [invoiceNumber, setInvoice] = useState(''), [note, setNote] = useState(''), [purchaseDate, setDate] = useState(today())
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const [lines, setLines] = useState([{ id: crypto.randomUUID(), description: '', unit: 'pc' as InvoiceLine['unit'], quantity: '', unitCost: '', total: '' }])
  const total = lines.reduce((s,l) => s + (parseMoney(l.total) ?? 0), 0)
  const amountPaid = paid.trim() ? parseMoney(paid) : total
  const changeLine = (id: string, change: Partial<typeof lines[number]>) => setLines(lines.map(l => l.id === id ? { ...l, ...change } : l))

  const updateQuantity = (id: string, newQty: string) => {
    setLines(lines.map(l => {
      if (l.id !== id) return l
      let newTotal = l.total
      let newUnitCost = l.unitCost
      const computedTotal = computeTotalFromUnitCost(newQty, l.unit, l.unitCost)
      if (computedTotal !== null) {
        newTotal = computedTotal
      } else if (l.total.trim() !== '') {
        const computedUc = computeUnitCostFromTotal(newQty, l.unit, l.total)
        if (computedUc !== null) {
          newUnitCost = computedUc
        }
      }
      return { ...l, quantity: newQty, total: newTotal, unitCost: newUnitCost }
    }))
  }

  const updateUnit = (id: string, newUnit: InvoiceLine['unit']) => {
    setLines(lines.map(l => {
      if (l.id !== id) return l
      let newTotal = l.total
      let newUnitCost = l.unitCost
      const computedTotal = computeTotalFromUnitCost(l.quantity, newUnit, l.unitCost)
      if (computedTotal !== null) {
        newTotal = computedTotal
      } else if (l.total.trim() !== '') {
        const computedUc = computeUnitCostFromTotal(l.quantity, newUnit, l.total)
        if (computedUc !== null) {
          newUnitCost = computedUc
        }
      }
      return { ...l, unit: newUnit, total: newTotal, unitCost: newUnitCost }
    }))
  }

  const updateUnitCost = (id: string, newUnitCost: string) => {
    setLines(lines.map(l => {
      if (l.id !== id) return l
      let newTotal = l.total
      const computedTotal = computeTotalFromUnitCost(l.quantity, l.unit, newUnitCost)
      if (computedTotal !== null) {
        newTotal = computedTotal
      }
      return { ...l, unitCost: newUnitCost, total: newTotal }
    }))
  }

  const updateTotal = (id: string, newTotal: string) => {
    setLines(lines.map(l => {
      if (l.id !== id) return l
      let newUnitCost = l.unitCost
      const computedUc = computeUnitCostFromTotal(l.quantity, l.unit, newTotal)
      if (computedUc !== null) {
        newUnitCost = computedUc
      }
      return { ...l, total: newTotal, unitCost: newUnitCost }
    }))
  }

  const submitInvoice = async (receiveImmediately: boolean) => {
    if (saving) return
    setError('')
    if (amountPaid === null || amountPaid > total || (amountPaid < total && !supplierId)) {
      setError(t('dueHint'))
      return
    }
    let purchase: Purchase
    try {
      purchase = makeInvoice(lines.map(l => {
        const quantity = parseQuantity(l.quantity, l.unit), amount = parseMoney(l.total)
        if (quantity === null || amount === null) throw new Error('invoice')
        return { id: l.id, description: l.description, unit: l.unit, quantity, total: amount }
      }), {
        supplierId: supplierId || undefined,
        supplier: suppliers.find(s => s.id === supplierId)?.name ?? seller.trim(),
        paid: amountPaid,
        method,
        invoiceNumber: invoiceNumber.trim(),
        note: note.trim(),
        createdAt: new Date(`${purchaseDate}T00:00:00+06:00`).toISOString()
      })
    } catch {
      setError(t('invalidInvoice'))
      return
    }
    purchase.id = invoiceId
    setSaving(true)
    try {
      const ok = await onSave(purchase, receiveImmediately)
      if (!ok) setError(t('invalidInvoice'))
    } catch {
      setError(t('invalidInvoice'))
    } finally {
      setSaving(false)
    }
  }

  if(purchases.some(p=>p.id===invoiceId))return <div className="panel supplier-form"><p>{t('invoiceSaved')}</p><button className="primary-button" onClick={onCancel}>{t('close')}</button></div>
  return <form className="panel supplier-form invoice-form" onSubmit={e => { e.preventDefault(); void submitInvoice(false) }}>
    <h3>{t('purchase')}</h3><p className="dialog-note">{t('invoiceHint')}</p>
    <SupplierPicker suppliers={suppliers} lang={lang} value={supplierId} onChange={setSupplierId}/>
    <div className={`form-grid invoice-details${!supplierId ? ' has-seller' : ''}`}>
      {!supplierId && <div className="form-group invoice-seller"><label htmlFor="purchase-seller">{t('seller')}</label><input id="purchase-seller" className="form-input" value={seller} onChange={e => setSeller(e.target.value)} maxLength={200}/></div>}
      <div className="form-group"><label htmlFor="purchase-date">{t('date')}</label><span className="date-input-control form-input-control"><input id="purchase-date" className="form-input" type="date" lang={dateInputLocale} max={today()} value={purchaseDate} required onChange={e => setDate(e.target.value)}/><span aria-hidden="true">{formatDateInput(purchaseDate)}</span></span></div>
      <div className="form-group"><label htmlFor="purchase-invoice">{t('invoice')}</label><input id="purchase-invoice" className="form-input" value={invoiceNumber} onChange={e => setInvoice(e.target.value)} maxLength={200}/></div>
    </div>
    {lines.map((l,index) => <fieldset className="invoice-entry-line" key={l.id}><legend>{t('invoiceLine')} {index + 1}</legend>
      <div className="form-grid invoice-line-fields">
        <div className="form-group invoice-description"><label htmlFor={`invoice-description-${l.id}`}>{t('invoiceDescription')}</label><input id={`invoice-description-${l.id}`} className="form-input" required maxLength={500} value={l.description} onChange={e => changeLine(l.id, {description:e.target.value})} placeholder={t('descriptionPlaceholder')}/></div>
        <div className="form-group"><label htmlFor={`invoice-unit-${l.id}`}>{t('unit')}</label><select id={`invoice-unit-${l.id}`} className="form-input" value={l.unit === 'Unit' ? 'pc' : l.unit} onChange={e => updateUnit(l.id, e.target.value as InvoiceLine['unit'])}><option value="pc">pc</option></select></div>
        <div className="form-group"><label htmlFor={`invoice-quantity-${l.id}`}>{t('quantity')} ({l.unit === 'Unit' ? 'pc' : l.unit})</label><input id={`invoice-quantity-${l.id}`} className="form-input" required inputMode="decimal" value={l.quantity} onChange={e => updateQuantity(l.id, e.target.value)}/></div>
        <div className="form-group"><label htmlFor={`invoice-unit-cost-${l.id}`}>{t('unitCost')} (৳)</label><input id={`invoice-unit-cost-${l.id}`} className="form-input" inputMode="decimal" value={l.unitCost} onChange={e => updateUnitCost(l.id, e.target.value)} placeholder="0"/></div>
        <div className="form-group"><label htmlFor={`invoice-total-${l.id}`}>{t('cost')}</label><input id={`invoice-total-${l.id}`} className="form-input" required inputMode="numeric" value={l.total} onChange={e => updateTotal(l.id, e.target.value)}/></div>
        <button type="button" className="text-button invoice-line-remove" aria-label={`${t('remove')} ${t('invoiceLine')} ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines(lines.filter(v => v.id !== l.id))}><svg aria-hidden="true" viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2"/></svg></button>
      </div>
    </fieldset>)}
    <button type="button" className="secondary-button" aria-label={t('addInvoiceLine')} title={t('addInvoiceLine')} onClick={() => setLines([...lines, {id:crypto.randomUUID(), description:'', unit:'pc', quantity:'', unitCost:'', total:''}])}><Icon name="plus" size={18}/></button>
    <section className="invoice-payment" aria-labelledby="purchase-payment-heading">
      <div className="invoice-payment-entry" role="group" aria-describedby="purchase-payment-hint">
        <h4 id="purchase-payment-heading">{t('paymentDetails')}</h4>
        <PurchasePaymentFields onPurchaseDate lang={lang} paid={paid} method={method} onPaid={setPaid} onMethod={setMethod}/>
        <p id="purchase-payment-hint" className="invoice-payment-hint">{t('datePaymentHint')}</p>
      </div>
      <dl className="invoice-payment-summary">
        <div><dt>{t('purchaseValue')}</dt><dd>৳ {money(total)}</dd></div>
        <div className={`invoice-payment-due${amountPaid !== null && total - amountPaid > 0 ? ' has-due' : ''}`}><dt>{t('settlement')}</dt><dd>{amountPaid === null ? '—' : `৳ ${money(total - amountPaid)}`}</dd></div>
      </dl>
    </section>
    <div className="form-group invoice-notes"><label htmlFor="purchase-note">{t('note')} <span>{t('optional')}</span></label><textarea id="purchase-note" className="form-input" rows={2} value={note} maxLength={500} placeholder={t('notePlaceholder')} onChange={e => setNote(e.target.value)}/></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="supplier-actions"><button type="button" className="primary-button" disabled={saving} onClick={() => void submitInvoice(true)}>{t('saveAndReceive')}</button><button type="button" className="secondary-button" disabled={saving} onClick={() => void submitInvoice(false)}>{t('saveInvoice')}</button><button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>{t('cancel')}</button></div>
  </form>
}
