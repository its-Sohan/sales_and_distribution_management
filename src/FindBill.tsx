import { useState } from 'react'
import { Icon } from './Icons'
import { translator } from './i18n'
import { money, type AccountTransaction, type Lang, type Receipt, type Return } from './model'
import { filterReportBills } from './reportsModel'
import { formatUiDateTime } from './dateFormat'

type Props = {
  receipts: Receipt[]; transactions: AccountTransaction[]; returns: Return[]; lang: Lang
  onReceipt: (receipt: Receipt) => void; onClose: () => void
}

export function FindBill({ receipts, transactions, returns, lang, onReceipt, onClose }: Props) {
  const t = translator(lang)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const bills = filterReportBills(receipts, { query, method: 'all', status: 'all', sort: 'newest' }, { allReceipts: receipts, transactions, returns })
  const currentPage = Math.min(page, Math.max(0, Math.ceil(bills.length / 20) - 1))
  return <>
    <div className="eyebrow modal-eyebrow">{t('allSavedBills')}</div>
    <h3>{t('findBill')}<span className="heading-dot">.</span></h3>
    <p className="modal-description">{t('findBillHint')}</p>
    <div className="search-box task-search">
      <Icon name="search" size={18}/>
      <input type="search" data-initial-focus aria-label={t('billSearch')} placeholder={t('billSearch')}
        value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} autoComplete="off"/>
    </div>
    <p className="task-result-count" role="status">{bills.length} {t('reportsTabsSales').toLowerCase()}</p>
    {bills.length ? <div className="bill-finder-list">
      {bills.slice(currentPage * 20, currentPage * 20 + 20).map(receipt => <button className="bill-finder-row" key={receipt.id} onClick={() => onReceipt(receipt)}>
        <span className="bill-finder-number">#{String(receipt.number).padStart(4, '0')}<small>{formatUiDateTime(receipt.createdAt)}</small></span>
        <span className="bill-finder-customer"><strong>{receipt.customer?.[lang] ?? t('walkIn')}</strong><small>{receipt.lines.map(line => line.product.en).join(', ')}</small></span>
        <strong className="bill-finder-amount">৳ {money(receipt.total)}</strong><Icon name="chevron" size={16}/>
      </button>)}
    </div> : <div className="empty-state task-empty">
      <Icon name={receipts.length ? 'search' : 'expenses'} size={28}/>
      <h4>{t(receipts.length ? 'noMatchingBills' : 'noSavedBills')}</h4>
      <p>{t(receipts.length ? 'noMatchingBillsHint' : 'noSavedBillsHint')}</p>
      {query ? <button className="text-button" onClick={() => { setQuery(''); setPage(0) }}>{t('allSavedBills')}<Icon name="arrow" size={14}/></button>
        : <button className="text-button" onClick={onClose}>{t('startSale')}<Icon name="arrow" size={14}/></button>}
    </div>}
    {bills.length > 20 && <div className="task-pagination">
      <button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('previousPage')}</button>
      <span>{currentPage + 1} / {Math.ceil(bills.length / 20)}</span>
      <button className="secondary-button" disabled={(currentPage + 1) * 20 >= bills.length} onClick={() => setPage(currentPage + 1)}>{t('nextPage')}</button>
    </div>}
  </>
}
