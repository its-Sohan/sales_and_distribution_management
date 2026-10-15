import { money, quantityWithUnit, type Lang, type Receipt, type Return } from './model'
import { translator } from './i18n'
import { CottageLogo } from './ReceiptArt'
import './receipt.css'
import { formatUiDateTime } from './dateFormat'

export function ReturnSlip({ entry, receipt, lang }: { entry: Return; receipt: Receipt; lang: Lang }) {
  const t = translator(lang)
  const settlement = entry.settlement
  const date = formatUiDateTime(entry.createdAt)
  const dueReduced = settlement?.dueReduced ?? (entry.method === 'due' ? entry.refunded : 0)
  const exchangeCredit = settlement?.exchangeCredit ?? 0
  const payout = settlement?.payout ?? (entry.method === 'due' ? 0 : entry.refunded)
  const creditIssued = settlement?.creditIssued ?? 0
  const received = settlement?.received ?? 0
  const newDue = settlement?.newDue ?? 0
  const replacementTotal = entry.replacementLines?.reduce((sum, line) => sum + line.amount, 0) ?? 0
  const movementLabel = payout > 0 ? t('returnGiveBack') : received > 0 ? t('returnCollect') : t('returnNoCash')
  const movementAmount = payout > 0 ? payout : received
  const paymentMethod = settlement?.method ?? (entry.method === 'due' ? 'cash' : entry.method)

  return <div className="receipt-preview" id="print-receipt">
    <article className="return-slip" aria-label={`${t('returnSlip')} ${entry.receiptNumber}`}>
      <header className="return-slip-header">
        <div className="return-slip-brand"><CottageLogo className="return-slip-logo"/><div><span>MASUM IT COTTAGE</span><small>ALL IT ACCESSORIES SALES &amp; SOLUTIONS</small></div></div>
        <div className="return-slip-title"><span className="return-slip-kicker">{t('returnSaved')}</span><h2>{t('returnSlip')}</h2><span className={`return-slip-type ${entry.replacementLines?.length ? 'is-exchange' : ''}`}>{t(entry.replacementLines?.length ? 'returnTypeExchange' : 'returnTypeRefund')}</span></div>
      </header>

      <section className="return-slip-reference" aria-label={t('returnOriginalBill')}>
        <div className="return-slip-reference-main"><span>{t('returnOriginalBill')}</span><strong>#{String(receipt.number).padStart(4, '0')}</strong><small>{t('total')}: ৳ {money(receipt.total, true)}</small></div>
        <div><span>{t('date')}</span><strong>{date}</strong></div>
        <div><span>{t('customerDetails')}</span><strong>{receipt.customer?.[lang] ?? t('walkIn')}</strong>{receipt.customer?.phone && <small>{receipt.customer.phone}</small>}</div>
      </section>

      <section className="return-slip-section">
        <div className="return-slip-section-heading"><h3>{t('returnSelectItems')}</h3><span>{entry.lines.length}</span></div>
        <table className="return-slip-table"><thead><tr><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('itemCondition')}</th></tr></thead><tbody>
          {entry.lines.map(line => {
            const product = receipt.lines.find(item => item.productId === line.productId)?.product
            return <tr key={line.productId}><td>{product?.en ?? line.productId}</td><td>{product ? quantityWithUnit(line.quantity, product.unit) : line.quantity}</td><td><span className={`return-condition ${line.condition === 'damaged' ? 'is-damaged' : ''}`}>{t(line.condition === 'damaged' ? 'damaged' : 'sellable')}</span></td></tr>
          })}
        </tbody></table>
      </section>

      {!!entry.replacementLines?.length && <section className="return-slip-section">
        <div className="return-slip-section-heading"><h3>{t('replacementItems')}</h3><span>{entry.replacementLines.length}</span></div>
        <table className="return-slip-table return-slip-replacements"><thead><tr><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('amount')}</th></tr></thead><tbody>
          {entry.replacementLines.map(line => <tr key={line.productId}><td>{line.product.en}</td><td>{quantityWithUnit(line.quantity, line.product.unit)}</td><td>৳ {money(line.amount, true)}</td></tr>)}
        </tbody><tfoot><tr><th colSpan={2}>{t('returnReplacementTotal')}</th><th>৳ {money(replacementTotal, true)}</th></tr></tfoot></table>
      </section>}

      <section className="return-slip-settlement">
        <div className="return-slip-settlement-head"><div><span>{t('returnReview')}</span><strong>{t('returnValue')}</strong></div><b>৳ {money(entry.refunded, true)}</b></div>
        <div className="return-slip-settlement-body">
          <div className="return-slip-allocation">
            <p><span>{t('reduceDue')}</span><strong>৳ {money(dueReduced, true)}</strong></p>
            <p><span>{t('exchangeCredit')}</span><strong>৳ {money(exchangeCredit, true)}</strong></p>
            <p><span>{t('moneyBack')}</span><strong>৳ {money(payout, true)}</strong></p>
            <p><span>{t('storeCredit')}</span><strong>৳ {money(creditIssued, true)}</strong></p>
          </div>
          <div className="return-slip-cashflow"><span>{movementLabel}</span><strong>৳ {money(movementAmount, true)}</strong><small>{t('returnPaymentMethod')}: {t(paymentMethod)}</small></div>
        </div>
        <div className="return-slip-due-row"><span>{t('returnReceivedNow')}</span><strong>৳ {money(received, true)}</strong><span>{t('newDue')}</span><strong>৳ {money(newDue, true)}</strong></div>
      </section>

      <footer className="return-slip-footer">
        <div className="return-slip-reason"><span>{t('returnReason')}</span><p>{entry.reason ?? entry.note ?? '—'}</p></div>
        <div className="return-slip-signatures"><div><span>{entry.operator ?? '—'}</span><small>{t('processedBy')}</small></div><div><span></span><small>{t('returnCustomerSignature')}</small></div></div>
        <p className="return-slip-thanks">MASUM IT COTTAGE <span>·</span> {t('returnSlip')}</p>
      </footer>
    </article>
  </div>
}
