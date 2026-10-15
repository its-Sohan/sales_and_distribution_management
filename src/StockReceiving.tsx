import { useState } from 'react'
import { invoiceReceivingStatus, isService, makeStockReceiving, matchCatalogProduct, money, parseMoney, parseReferencePrice, parseQuantity, quantityWithUnit, type Lang, type Product, type Purchase, type StockReceiving } from './model'
import { suppliersTranslator } from './suppliersCopy'
import { Icon } from './Icons'

export { matchCatalogProduct }

export function ProductPicker({
  id,
  catalog,
  unit,
  value,
  onChange,
  lang,
  disabled,
}: {
  id: string
  catalog: Product[]
  unit?: Product['unit']
  value: string
  onChange: (productId: string) => void
  lang: Lang
  disabled?: boolean
}) {
  const t = suppliersTranslator(lang)
  const [query, setQuery] = useState('')
  const available = catalog.filter(p => !isService(p) && (!unit || p.unit === unit))
  const q = query.toLowerCase().trim()
  const matchingProducts = available.filter(p => {
    if (!q) return true
    return (
      p.code.toLowerCase().includes(q) ||
      p.en.toLowerCase().includes(q) ||
      (p.variantName && p.variantName.toLowerCase().includes(q)) ||
      (p.detail && p.detail.toLowerCase().includes(q)) ||
      (p.detailBn && p.detailBn.toLowerCase().includes(q))
    )
  })
  const selectedProduct = available.find(p => p.id === value)
  const selectOptions = (selectedProduct && !matchingProducts.some(p => p.id === value))
    ? [selectedProduct, ...matchingProducts]
    : matchingProducts

  return (
    <div className="product-picker">
      <div className="product-picker-search">
        <Icon name="search" size={14} />
        <input
          id={`${id}-search`}
          type="search"
          className="form-input"
          placeholder={t('searchProduct')}
          aria-label={t('searchProduct')}
          value={query}
          disabled={disabled}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matchingProducts.length > 0) {
                onChange(matchingProducts[0].id)
                setQuery('')
              }
            } else if (e.key === 'Escape') {
              setQuery('')
            }
          }}
        />
      </div>
      <select
        id={id}
        className="form-input"
        value={value}
        required
        disabled={disabled}
        onChange={e => {
          onChange(e.target.value)
          setQuery('')
        }}
      >
        <option value="">{t('chooseExact')}{query.trim() ? ` (${matchingProducts.length})` : ''}</option>
        {selectOptions.map(p => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.en}{p.variantName ? ` · ${p.variantName}` : ''}
          </option>
        ))}
      </select>
      {query.trim() && matchingProducts.length > 0 && matchingProducts.length <= 4 && (
        <div className="product-picker-quick-matches">
          {matchingProducts.map(p => (
            <button
              key={p.id}
              type="button"
              className={`quick-match-pill ${p.id === value ? 'active' : ''}`}
              onClick={() => {
                onChange(p.id)
                setQuery('')
              }}
            >
              <code>{p.code}</code> {p.en}{p.variantName ? ` · ${p.variantName}` : ''}
            </button>
          ))}
        </div>
      )}
      {selectedProduct && (
        <div className="product-picker-selected-hint">
          <code>{selectedProduct.code}</code> {selectedProduct.en}{selectedProduct.variantName ? ` · ${selectedProduct.variantName}` : ''}
        </div>
      )}
    </div>
  )
}

type Props = {
  purchase: Purchase; receivings: StockReceiving[]; catalog: Product[]; lang: Lang; defaultProductId?: string
  onSave: (receiving: StockReceiving) => Promise<boolean>; onCreateProduct: (product: Product) => Promise<boolean>; onCancel: () => void
}
export function StockReceivingEditor({ purchase, receivings, catalog, lang, defaultProductId, onSave, onCreateProduct, onCancel }: Props) {
  const t = suppliersTranslator(lang), status = invoiceReceivingStatus(purchase, receivings)
  const [receivingId] = useState(()=>crypto.randomUUID())
  const first = status.lines.find(l => l.remainingQuantity > 0)
  const initialProductId = (defaultProductId && catalog.find(p => p.id === defaultProductId && !isService(p))?.unit === first?.unit)
    ? defaultProductId
    : (first ? matchCatalogProduct(first.description, first.unit, catalog)?.id ?? '' : '')
  const [rows, setRows] = useState([{ id:crypto.randomUUID(), invoiceLineId:first?.id ?? '', productId:initialProductId, quantity:first ? String(first.remainingQuantity/1000) : '', allocatedCost:'' }])
  const [error, setError] = useState(''), [note, setNote] = useState(''), [saving, setSaving] = useState(false)
  const [createFor, setCreateFor] = useState<string | null>(null), [name, setName] = useState(''), [code, setCode] = useState(''), [price, setPrice] = useState('')
  const update = (id: string, fields: Partial<typeof rows[number]>) => setRows(previous => previous.map(r => r.id === id ? {...r,...fields} : r))
  let preview: StockReceiving | null = null
  try { preview = makeStockReceiving(purchase, receivings, rows.map(r => {
    const line = status.lines.find(l => l.id === r.invoiceLineId)
    const quantity = line ? parseQuantity(r.quantity,line.unit) : null
    if (quantity === null) throw new Error('quantity')
    const allocatedCost=r.allocatedCost.trim()?parseMoney(r.allocatedCost):undefined
    if(allocatedCost===null)throw new Error('cost')
    return {invoiceLineId:r.invoiceLineId, productId:r.productId, quantity,...(allocatedCost!==undefined?{allocatedCost}:{})}
  }), {id:receivingId}) } catch { /* Incomplete rows do not produce a stock or cost preview. */ }

  const mappedQuantityFor = (lineId: string, lineUnit: Product['unit']) =>
    rows.filter(r => r.invoiceLineId === lineId).reduce((s, r) => s + (parseQuantity(r.quantity, lineUnit) ?? 0), 0)

  const hasUnmappedRemaining = status.lines.some(l => l.remainingQuantity > mappedQuantityFor(l.id, l.unit))

  const autofillAllLines = () => {
    const remainingLines = status.lines.filter(l => l.remainingQuantity > 0)
    if (!remainingLines.length) return

    const nextRows = [...rows]

    for (const line of remainingLines) {
      const alreadyMapped = nextRows
        .filter(r => r.invoiceLineId === line.id)
        .reduce((s, r) => s + (parseQuantity(r.quantity, line.unit) ?? 0), 0)
      const remaining = line.remainingQuantity - alreadyMapped

      if (remaining > 0) {
        const matched = matchCatalogProduct(line.description, line.unit, catalog)
        const defaultProd = (line.id === first?.id && defaultProductId && catalog.find(p => p.id === defaultProductId && !isService(p))?.unit === line.unit)
          ? defaultProductId
          : undefined
        const targetProductId = defaultProd ?? matched?.id ?? ''

        const incompleteRow = nextRows.find(r => r.invoiceLineId === line.id && (!r.quantity || !r.productId))
        if (incompleteRow) {
          if (!incompleteRow.productId) incompleteRow.productId = targetProductId
          if (!incompleteRow.quantity) incompleteRow.quantity = String(remaining / 1000)
        } else {
          const unassignedRow = nextRows.find(r => !r.invoiceLineId)
          if (unassignedRow) {
            unassignedRow.invoiceLineId = line.id
            unassignedRow.productId = targetProductId
            unassignedRow.quantity = String(remaining / 1000)
          } else {
            nextRows.push({
              id: crypto.randomUUID(),
              invoiceLineId: line.id,
              productId: targetProductId,
              quantity: String(remaining / 1000),
              allocatedCost: ''
            })
          }
        }
      }
    }

    setRows(nextRows)
  }

  const newRow = () => {
    const line = status.lines.find(l => l.remainingQuantity > rows.filter(r => r.invoiceLineId === l.id).reduce((s,r) => s + (parseQuantity(r.quantity,l.unit) ?? 0),0))
    const remaining = line ? line.remainingQuantity - rows.filter(r => r.invoiceLineId === line.id).reduce((s,r) => s + (parseQuantity(r.quantity,line.unit) ?? 0),0) : 0
    const matched = line ? matchCatalogProduct(line.description, line.unit, catalog) : undefined
    setRows([...rows,{id:crypto.randomUUID(),invoiceLineId:line?.id ?? '',productId:matched?.id ?? '',quantity:remaining > 0 ? String(remaining/1000) : '',allocatedCost:''}])
  }
  if(receivings.some(r=>r.id===receivingId))return <div className="panel supplier-form"><p>{t('receivingSaved')}</p><button className="primary-button" onClick={onCancel}>{t('close')}</button></div>
  return <form className="panel supplier-form receiving-form" onSubmit={async e => {
    e.preventDefault(); if (saving) return; setError('')
    if (!preview || preview.lines.some(l => catalog.find(p => p.id === l.productId)?.unit !== status.lines.find(v => v.id === l.invoiceLineId)?.unit)) {setError(t('receivingInvalid'));return}
    setSaving(true)
    try { await onSave({...preview,id:receivingId,createdAt:new Date().toISOString(),...(note.trim()?{note:note.trim()}:{})}) }
    finally {setSaving(false)}
  }}>
    <h3>{t('receiveStock')}</h3><p>{purchase.invoiceNumber || t('invoiceLine')} · {purchase.supplier || t('none')} · ৳ {money(purchase.total)}</p><p className="dialog-note">{t('receivingHint')}</p>
    <div className="invoice-progress">{status.lines.map(l => <div key={l.id}><strong>{l.description}</strong><span>{t('remaining')}: {quantityWithUnit(l.remainingQuantity,l.unit)} · ৳ {money(l.remainingValue)}</span></div>)}</div>
    {rows.map((row,index) => {
      const line = status.lines.find(l => l.id === row.invoiceLineId)
      return <fieldset className="invoice-entry-line" key={row.id}><legend>{t('stockMapping')} {index+1}</legend>
        <div className="form-group"><label htmlFor={`receive-line-${row.id}`}>{t('invoiceLine')}</label><select id={`receive-line-${row.id}`} className="form-input" value={row.invoiceLineId} required onChange={e => {
          const newLineId = e.target.value
          const targetLine = status.lines.find(l => l.id === newLineId)
          const matched = targetLine ? matchCatalogProduct(targetLine.description, targetLine.unit, catalog) : undefined
          const alreadyAssigned = rows.filter(r => r.id !== row.id && r.invoiceLineId === newLineId).reduce((s, r) => s + (parseQuantity(r.quantity, targetLine?.unit ?? 'pc') ?? 0), 0)
          const remaining = targetLine ? Math.max(0, targetLine.remainingQuantity - alreadyAssigned) : 0
          update(row.id, {
            invoiceLineId: newLineId,
            productId: matched?.id ?? '',
            quantity: remaining > 0 ? String(remaining / 1000) : '',
            allocatedCost: ''
          })
        }}><option value="">{t('chooseLine')}</option>{status.lines.filter(l => l.remainingQuantity > 0).map(l => <option key={l.id} value={l.id}>{l.description} · {quantityWithUnit(l.remainingQuantity,l.unit)}</option>)}</select></div>
        <div className="receiving-entry-fields">
          <div className="form-group">
            <label htmlFor={`receive-product-${row.id}`}>{t('exactProduct')}</label>
            <ProductPicker
              id={`receive-product-${row.id}`}
              catalog={catalog}
              unit={line?.unit}
              value={row.productId}
              lang={lang}
              disabled={!line || saving}
              onChange={productId => update(row.id, { productId })}
            />
            <button type="button" className="text-button receiving-create-product" disabled={!line || saving} onClick={() => {setCreateFor(row.id);setName('');setCode('');setPrice('');setError('')}}><Icon name="plus" size={14}/>{t('newExactProduct')}</button>
          </div>
          <div className="form-group"><label htmlFor={`receive-quantity-${row.id}`}>{t('receivedQty')} ({line?.unit ?? 'pc'})</label><input id={`receive-quantity-${row.id}`} className="form-input" required inputMode="decimal" value={row.quantity} onChange={e => update(row.id,{quantity:e.target.value})}/></div>
          <div className="form-group"><label htmlFor={`receive-cost-${row.id}`}>{t('allocatedCost')} (৳)</label><input id={`receive-cost-${row.id}`} className="form-input" inputMode="numeric" value={row.allocatedCost} aria-describedby={`receive-cost-hint-${row.id}`} onChange={e=>update(row.id,{allocatedCost:e.target.value})}/><small id={`receive-cost-hint-${row.id}`}>{t('automaticCost')}</small></div>
        </div>
        <div className="receiving-entry-footer"><p><span>{t('allocatedCost')}</span><strong>{preview && preview.lines[index] ? `৳ ${money(preview.lines[index].total)}` : '—'}</strong></p><button type="button" className="text-button" disabled={rows.length===1 || saving} onClick={() => {setRows(rows.filter(r=>r.id!==row.id));if(createFor===row.id)setCreateFor(null)}}>{t('remove')}</button></div>
        {createFor===row.id && <fieldset className="supplier-inline-create"><legend>{t('newExactProduct')}</legend>
          <label htmlFor="receive-new-name">{t('productName')}</label><input id="receive-new-name" className="form-input" value={name} maxLength={200} onChange={e=>setName(e.target.value)}/>
          <label htmlFor="receive-new-code">{t('productCode')}</label><input id="receive-new-code" className="form-input" value={code} maxLength={80} onChange={e=>setCode(e.target.value)}/>
          <label htmlFor="receive-new-price">{t('sellPrice')}</label><input id="receive-new-price" className="form-input" inputMode="numeric" value={price} onChange={e=>setPrice(e.target.value)}/>
          <div className="supplier-actions"><button type="button" className="primary-button" disabled={saving || !name.trim() || !code.trim()} onClick={async ()=>{
            const amount=parseReferencePrice(price)
            if(!line || amount===null || catalog.some(p=>p.code.toLowerCase()===code.trim().toLowerCase())){setError(t('productInvalid'));return}
            const product:Product={id:crypto.randomUUID(),code:code.trim(),en:name.trim(),detail:'',detailBn:'',category:'staples',unit:line.unit,price:amount,stock:0,purchased:0,art:'daily',color:'#e4e7d8'}
            setSaving(true)
            try {if(await onCreateProduct(product)){update(row.id,{productId:product.id});setCreateFor(null)}}finally{setSaving(false)}
          }}>{t('saveProduct')}</button><button type="button" className="secondary-button" disabled={saving} onClick={()=>setCreateFor(null)}>{t('cancel')}</button></div>
        </fieldset>}
      </fieldset>
    })}
    <div className="supplier-actions receiving-toolbar">
      <button type="button" className="secondary-button" disabled={saving || !hasUnmappedRemaining} onClick={autofillAllLines}>
        <Icon name="check" size={15}/>{t('autofillLines')}
      </button>
      <button type="button" className="secondary-button" disabled={saving} onClick={newRow}>
        <Icon name="plus" size={15}/>{t('addMapping')}
      </button>
    </div>
    <p>{t('allocatedCost')}: {preview?`৳ ${money(preview.lines.reduce((s,l)=>s+l.total,0))}`:'—'}</p>
    <div className="form-group"><label htmlFor="receiving-note">{t('note')}</label><input id="receiving-note" className="form-input" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="supplier-actions"><button className="primary-button" disabled={saving || !preview || createFor!==null}>{t('confirmReceiving')}</button><button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>{t('cancel')}</button></div>
  </form>
}
