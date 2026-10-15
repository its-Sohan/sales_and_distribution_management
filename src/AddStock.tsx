import { useState } from 'react'
import { StockReceivingEditor } from './StockReceiving'
import { invoiceReceivingStatus, money, type Lang, type Product, type Purchase, type StockReceiving } from './model'
import { suppliersTranslator } from './suppliersCopy'

export type StockPurchaseDraft = {productId?:string;purchaseId?:string}
export function AddStock({catalog,lang,purchases,receivings,draft,onSave,onCreateProduct,onNewInvoice,onClose}: {
  catalog:Product[];lang:Lang;purchases:Purchase[];receivings:StockReceiving[];draft:StockPurchaseDraft|null
  onSave:(r:StockReceiving)=>Promise<boolean>;onCreateProduct:(p:Product)=>Promise<boolean>;onNewInvoice:()=>void;onClose:()=>void
}) {
  const t=suppliersTranslator(lang), [purchaseId,setPurchaseId]=useState(draft?.purchaseId??''), [query,setQuery]=useState('')
  const pending=purchases.filter(p=>p.mode==='invoice'&&!p.voidedAt&&!p.accountingIssue&&invoiceReceivingStatus(p,receivings).status!=='received')
  const purchase=pending.find(p=>p.id===purchaseId)
  return purchase ? <StockReceivingEditor purchase={purchase} receivings={receivings} catalog={catalog} lang={lang} defaultProductId={draft?.productId} onCreateProduct={onCreateProduct} onSave={onSave} onCancel={()=>setPurchaseId('')}/> : <>
    <h3>{t('receiveStock')}</h3><p className="dialog-note">{t('chooseInvoiceHint')}</p>
    <label htmlFor="receive-invoice-search" className="sr-only">{t('searchInvoices')}</label><input id="receive-invoice-search" className="form-input" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchInvoices')}/>
    <div className="stock-picker-list">{pending.filter(p=>`${p.invoiceNumber??''} ${p.supplier??''} ${p.invoiceLines?.map(l=>l.description).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(p=><button type="button" className="stock-picker-row" key={p.id} onClick={()=>setPurchaseId(p.id)}><span><strong>{p.invoiceNumber||p.invoiceLines?.map(l=>l.description).join(', ')}</strong><small>{p.supplier||t('none')} · {t(invoiceReceivingStatus(p,receivings).status)} · ৳ {money(invoiceReceivingStatus(p,receivings).remainingValue)}</small></span></button>)}</div>
    {!pending.length&&<p className="dialog-note">{t('noPendingInvoices')}</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('cancel')}</button><button type="button" className="primary-button" onClick={onNewInvoice}>{t('purchase')}</button></div>
  </>
}
