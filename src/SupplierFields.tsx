import { useId } from 'react'
import type { Lang, PaymentMethod, Supplier } from './model'
import { suppliersTranslator } from './suppliersCopy'

export function SupplierPicker({ suppliers, lang, value, onChange }: {
  suppliers: Supplier[]; lang: Lang; value: string; onChange: (id: string) => void
}) {
  const t = suppliersTranslator(lang), id = useId()
  const active = suppliers.filter(s => !s.archived || s.id === value)
  return <fieldset className="supplier-picker"><legend>{t('choose')}</legend>
    <label className="sr-only" htmlFor={`${id}-select`}>{t('choose')}</label><select id={`${id}-select`} className="form-input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{t('none')}</option>{active.map(s => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ''}{s.archived ? ` (${t('archived')})` : ''}</option>)}
    </select>
  </fieldset>
}

export function PurchasePaymentFields({ lang, paid, method, onPaid, onMethod, onPurchaseDate = false }: { onPurchaseDate?: boolean; lang: Lang; paid: string; method: PaymentMethod; onPaid: (value: string) => void; onMethod: (value: PaymentMethod) => void }) {
  const t = suppliersTranslator(lang), id = useId()
  return <div className="form-grid supplier-payment-fields"><div className="form-group"><label htmlFor={`${id}-paid`}>{t(onPurchaseDate ? 'initialDate' : 'initial')}</label><input id={`${id}-paid`} className="form-input" inputMode="numeric" value={paid} onChange={e => onPaid(e.target.value)} placeholder={t('fullHint')}/></div>
    <div className="form-group"><label htmlFor={`${id}-method`}>{t('method')}</label><select id={`${id}-method`} className="form-input" value={method} onChange={e => onMethod(e.target.value as PaymentMethod)}>{(['cash', 'mobile', 'bank'] as const).map(m => <option key={m} value={m}>{t(m)}</option>)}</select></div></div>
}
