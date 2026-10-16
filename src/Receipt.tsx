import { useLayoutEffect, useRef, useState } from 'react'
import { lineTotal, money, quantityWithUnit, type Lang, type Receipt as SaleReceipt } from './model'
import { amountInWords, receiptPages, type ReceiptRow } from './receiptFormat'
import { CottageLogo } from './ReceiptArt'
import { translator } from './i18n'
import { reportBrand } from './reportBrand'
import { formatMemoDateTime } from './dateFormat'

function description(line: SaleReceipt['lines'][number]) {
  const variant = line.product.variantName
  return `${line.product.en}${variant && !line.product.en.includes(variant) ? ` · ${variant}` : ''}`
}

const methodLabel = (method: SaleReceipt['method'], cash: string, mobile: string, bank: string) =>
  method === 'cash' ? cash : method === 'mobile' ? mobile : bank

function LedgerMark({ paid }: { paid: boolean }) {
  const label = paid ? '✓' : '!'
  return <span className={`memo-stamp ${paid ? 'is-paid' : 'is-due'}`} aria-hidden="true">{label}</span>
}

function ItemsTable({ rows, lang, tableRef }: { rows: ReceiptRow[]; lang: Lang; tableRef?: React.Ref<HTMLTableElement> }) {
  const t = translator(lang)
  return <table className="memo-items" ref={tableRef}>
    <colgroup><col style={{ width: '7%' }}/><col/><col style={{ width: '15%' }}/><col style={{ width: '11%' }}/><col style={{ width: '14%' }}/><col className="memo-col-amount"/></colgroup>
    <thead><tr><th scope="col">{t('memoSl')}</th><th scope="col">{t('memoDescription')}</th><th scope="col">{t('memoWarranty')}</th><th scope="col">{t('memoQty')}</th><th scope="col">{t('memoUnitPrice')}<span className="memo-currency">({t('memoBdt')} ৳)</span></th><th scope="col">{t('memoAmount')}<span className="memo-currency">({t('memoBdt')} ৳)</span></th></tr></thead>
    <tbody>{rows.map(({ line, number }) => <tr key={number}>
      <td>{String(number).padStart(2, '0')}</td><td className="memo-description">{description(line)}</td><td className={`memo-item-warranty${line.product.warranty ? '' : ' memo-muted'}`}>{line.product.warranty || '—'}</td><td className="memo-quantity">{quantityWithUnit(line.quantity, line.product.unit)}</td><td className="memo-money">{money(line.product.price, true)}</td><td className="memo-money">{money(lineTotal(line.product.price, line.quantity), true)}</td>
    </tr>)}</tbody>
  </table>
}



export function Receipt({ receipt, lang, walkIn }: { receipt: SaleReceipt; lang: Lang; walkIn: string }) {
  const measure = useRef<HTMLTableElement>(null)
  const firstPage = useRef<HTMLElement>(null)
  const [layout, setLayout] = useState<{ lines: SaleReceipt['lines']; heights: number[]; available: number }>()
  useLayoutEffect(() => {
    let cancelled = false
    const measureRows = () => {
      const table = measure.current
      const summary = firstPage.current?.querySelector('.memo-summary')
      if (cancelled || !table || !summary || !table.getBoundingClientRect().height) return
      // Use the actual six-column table, including wrapped text, after fonts load.
      // Every page has the same typography and the same fixed summary boundary.
      const headerBottom = table.tHead!.getBoundingClientRect().bottom
      const available = summary.getBoundingClientRect().top - headerBottom - parseFloat(getComputedStyle(table).borderBottomWidth) / 2
      if (available <= 0) return
      const heights = [...table.tBodies[0].rows].map(row => row.getBoundingClientRect().height)
      setLayout(previous => previous?.lines === receipt.lines && previous.available === available && previous.heights.length === heights.length && previous.heights.every((value, i) => value === heights[i]) ? previous : { lines: receipt.lines, heights, available })
    }
    measureRows()
    void document.fonts.ready.then(measureRows)
    document.fonts.addEventListener('loadingdone', measureRows)
    const observer = new ResizeObserver(measureRows)
    if (measure.current) observer.observe(measure.current)
    if (firstPage.current) observer.observe(firstPage.current)
    return () => {
      cancelled = true
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measureRows)
    }
  }, [receipt.lines, lang])
  const measured = layout?.lines === receipt.lines ? layout : undefined
  const pages = receiptPages(receipt.lines, measured?.heights, measured?.available)
  const dateTime = formatMemoDateTime(receipt.createdAt)

  const t = translator(lang)
  const customerName = receipt.customer?.[lang] ?? walkIn
  const customerPhone = receipt.customer?.phone ?? ''
  const paid = receipt.due <= 0
  const method = methodLabel(receipt.method, t('cash'), t('mobile'), t('bank'))
  const memoNo = String(receipt.number).padStart(4, '0')

  return <div className="receipt-preview" id="print-receipt">
    {pages.map((rows, pageIndex) => {
      const isLast = pageIndex === pages.length - 1
      return <article className="cash-memo" ref={pageIndex === 0 ? firstPage : undefined} key={pageIndex} aria-label={`${t('memoCashMemo')} ${memoNo}, ${t('memoPage')} ${pageIndex + 1} ${t('memoOf')} ${pages.length}`}>
        <div className="memo-rule" aria-hidden="true" />
        <header className="memo-branding">
          <CottageLogo className="memo-logo" />
          <div className="memo-brand-copy">
            <p className="memo-eyebrow">{t('memoCashMemo')}</p>
            <h2>{reportBrand.name}</h2>
            <p className="memo-tagline">{reportBrand.tagline}</p>
            <p className="memo-address">{reportBrand.address.join(' ')} · {reportBrand.phone}</p>
            <p className="memo-address">{reportBrand.email} · {reportBrand.facebook}</p>
          </div>
          <div className="memo-identification">
            <p className="memo-no-box"><span>{t('receiptNo')}</span><strong>{memoNo}</strong></p>
            <p className="memo-date-box"><span>{t('date')}</span><span className="memo-date-digits">{dateTime}</span></p>
            <p className="memo-prepared-by"><span>{t('preparedBy')}</span><span>{receipt.preparedBy || ' '}</span></p>
            <p className={`memo-status ${paid ? 'is-paid' : 'is-due'}`}><LedgerMark paid={paid} /><span>{paid ? t('memoPaidStamp') : t('memoDueStamp')}</span></p>
          </div>
        </header>
        <div className="memo-customer">
          <div><span>{t('customer')}</span><strong>{customerName}</strong></div>
          <div><span>{t('phone')}</span><strong className="memo-customer-phone">{customerPhone || '—'}</strong></div>
          <div className="memo-address-row"><span>{t('customerAddress')}</span><span>{receipt.address || '—'}</span></div>
        </div>
        <div className="memo-grid">
          <ItemsTable rows={rows} lang={lang} />
          {pageIndex === 0 && <div className="memo-measure" aria-hidden="true"><ItemsTable tableRef={measure} rows={receipt.lines.map((line, index) => ({ line, number: index + 1 }))} lang={lang} /></div>}
        </div>
        <div className="memo-summary">
          {isLast ? <>
            <div className="memo-summary-copy">
              <div className="memo-words"><span>{t('memoInWords')}</span><p>{amountInWords(receipt.total)}</p></div>
              <div className="memo-remarks"><span>{t('memoRemarks')}</span><p>{receipt.remarks || '—'}</p></div>
            </div>
            <table className="memo-totals">
              <colgroup><col className="memo-col-totals-label" /><col className="memo-col-totals-amount" /></colgroup>
              <tbody>
                <tr><th scope="row">{t('memoSubtotal')}</th><td>{money(receipt.subtotal, true)}</td></tr>
                <tr><th scope="row">{t('memoDiscount')}</th><td>{money(receipt.discount, true)}</td></tr>
                <tr className="memo-grand-total"><th scope="row">{t('memoGrandTotal')}</th><td>{money(receipt.total, true)}</td></tr>
                <tr><th scope="row">{t('memoPaid')} · {method}</th><td>{money(receipt.paid, true)}</td></tr>
                {receipt.method === 'cash' && <tr><th scope="row">{t('memoTendered')}</th><td>{money(receipt.tendered, true)}</td></tr>}
                {receipt.method === 'cash' && receipt.change > 0 && <tr><th scope="row">{t('memoChange')}</th><td>{money(receipt.change, true)}</td></tr>}
                <tr className={paid ? undefined : 'memo-due'}><th scope="row">{t('memoDue')}</th><td>{money(receipt.due, true)}</td></tr>
              </tbody>
            </table>
          </> : <p className="memo-continuation">{t('memoContinued')}</p>}
        </div>
        <div className="memo-bottom">
          <section className="memo-warranty" aria-label={t('memoWarrantyTitle')}>
            <h3 className="memo-warranty-title">{t('memoWarrantyTitle')}</h3>
            <ol>
              <li>{t('memoWarranty1')}</li>
              <li>{t('memoWarranty2')}</li>
              <li>{t('memoWarranty3')}</li>
              <li>{t('memoWarranty4')}</li>
            </ol>
          </section>
          {isLast && <><div className="memo-signature"><span>{receipt.customer?.[lang] ?? walkIn}</span><small>{t('memoCustomerSignature')}</small></div><div className="memo-signature"><span>{receipt.preparedBy || ' '}</span><small>{t('memoAuthorizedSignature')}</small></div></>}
        </div>
        {isLast && <section className="memo-payment-methods" aria-label={t('memoPaymentMethods')}>
          <h3>{t('memoPaymentMethods')}</h3>
          <div className="memo-payment-options">
            <div className="memo-payment-option memo-payment-cash"><span>{t('cash')}</span></div>
            <div className="memo-payment-option memo-payment-bkash"><img src="/payment-logos/bkash.svg" alt="bKash" /></div>
            <div className="memo-payment-option memo-payment-nagad" aria-label="Nagad"><img src="/payment-logos/nagad-symbol.svg" alt="" /><span lang="bn">নগদ</span></div>
            <div className="memo-payment-option memo-payment-rocket"><img src="/payment-logos/rocket.svg" alt="Rocket" /></div>
            <div className="memo-payment-option memo-payment-bank"><span>{t('bank')}</span></div>
          </div>
        </section>}
        {isLast && <p className="memo-thanks">{t('memoThanks')}</p>}
        {pages.length > 1 && <div className="memo-page-number">{t('memoPage')} {pageIndex + 1} {t('memoOf')} {pages.length}</div>}
      </article>
    })}
  </div>
}
