import { useLayoutEffect, useRef, useState } from 'react'
import { lineTotal, money, quantityWithUnit, type Lang, type Receipt as SaleReceipt } from './model'
import { amountInWords, receiptPages, type ReceiptRow } from './receiptFormat'
import { ContactIcon, CottageLogo, MemoSectionIcon, MemoWaves, PaymentIcon, ReceiptDevices, ReceiptServiceIcon } from './ReceiptArt'
import { formatMemoDateTime } from './dateFormat'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/hind-siliguri/bengali-400.css'
import '@fontsource/hind-siliguri/bengali-700.css'

function description(line: SaleReceipt['lines'][number]) {
  const variant = line.product.variantName
  return `${line.product.en}${variant && !line.product.en.includes(variant) ? ` · ${variant}` : ''}`
}

function ItemsTable({ rows, tableRef }: { rows: ReceiptRow[]; tableRef?: React.Ref<HTMLTableElement> }) {
  return <table className="memo-items" ref={tableRef}>
    <colgroup><col style={{ width: '6.5%' }}/><col/><col style={{ width: '14%' }}/><col style={{ width: '11%' }}/><col style={{ width: '13.5%' }}/><col className="memo-col-amount"/></colgroup>
    <thead><tr><th scope="col">SL.</th><th scope="col">Description</th><th scope="col">Warranty</th><th scope="col">Qty.</th><th scope="col">Unit Price<span className="memo-currency">(BDT <span className="memo-bengali" lang="bn">ট</span>)</span></th><th scope="col">Amount<span className="memo-currency">(BDT <span className="memo-bengali" lang="bn">ট</span>)</span></th></tr></thead>
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

  return <div className="receipt-preview" id="print-receipt">
    {pages.map((rows, pageIndex) => {
      const isLast = pageIndex === pages.length - 1
      return <article className="cash-memo" ref={pageIndex === 0 ? firstPage : undefined} key={pageIndex} aria-label={`Cash memo ${receipt.number}, page ${pageIndex + 1} of ${pages.length}`}>
        <MemoWaves/>
        <header className="memo-branding">
          <CottageLogo className="memo-logo"/>
          <div className="memo-brand-copy">
            <h2>Masum <span>IT</span> Cottage</h2>
            <p className="memo-tagline">ALL <span>IT</span> ACCESSORIES SALES &amp; SOLUTIONS</p>
            <p className="memo-service">Service &amp; Sales to provide Corporate Office or Organization.</p>
          </div>
          <ReceiptDevices/>
          <div className="memo-services" aria-label="Our services">
            <span><ReceiptServiceIcon name="pc"/>PC Build</span>
            <span><ReceiptServiceIcon name="laptop"/>Laptop</span>
            <span><ReceiptServiceIcon name="cctv"/>CCTV</span>
            <span><ReceiptServiceIcon name="network"/>Networking</span>
            <span><ReceiptServiceIcon name="accessories"/>Accessories</span>
            <span><ReceiptServiceIcon name="support"/>IT Support</span>
          </div>
        </header>
        <div className="memo-contacts">
          <div className="memo-shop-address"><ContactIcon name="pin"/><p>Ovijhan - 3/1, Plabon Bhaban,<br/>Surtaranga Road, Cheragali, Tongi, Gazipur.</p></div>
          <div className="memo-contact-details memo-contact-phones">
            <p><ContactIcon name="phone"/><span>01717-270738, 01730-898910</span></p>
          </div>
          <div className="memo-contact-details memo-contact-online">
            <p><ContactIcon name="email"/><span>masum0008@gmail.com</span></p>
            <p className="memo-facebook-address"><ContactIcon name="facebook"/><span>facebook.com/mic.bangladesh</span></p>
          </div>
        </div>
        <div className="memo-title-row">
          <div className="memo-title">INVOICE/BILL</div>
          <div className="memo-identification">
            <p className="memo-no-box"><span>No :</span><strong>{String(receipt.number).padStart(4, '0')}</strong></p>
            <div className="memo-date-box"><span>Date :</span><span className="memo-date-digits">{dateTime}</span></div>
            <div className="memo-prepared-by"><span>Prepared By :</span><span>{receipt.preparedBy || '\u00a0'}</span></div>
          </div>
        </div>
        <div className="memo-customer">
          <div className="memo-customer-top"><div><span>Customer Name :</span><strong>{receipt.customer?.[lang] ?? walkIn}</strong></div><div><span>Mobile :</span><strong className="memo-customer-phone">{receipt.customer?.phone ?? ''}</strong></div></div>
          <div className="memo-address"><span>Address :</span><div>{receipt.address || '\u00a0'}</div></div>
        </div>
        <div className="memo-grid">
          <CottageLogo className="memo-watermark"/>
          <ItemsTable rows={rows}/>
          {pageIndex === 0 && <div className="memo-measure" aria-hidden="true"><ItemsTable tableRef={measure} rows={receipt.lines.map((line, index) => ({ line, number: index + 1 }))}/></div>}
        </div>
        <div className="memo-summary">
          {isLast ? <>
            <div className="memo-summary-copy">
              <div className="memo-words"><span>In Words :</span><p>{amountInWords(receipt.total)}</p></div>
              <div className="memo-remarks"><strong>Remarks :</strong><p>{receipt.remarks}</p></div>
            </div>
            <table className="memo-totals">
              <colgroup><col className="memo-col-totals-label"/><col className="memo-col-totals-amount"/></colgroup>
              <tbody><tr><th scope="row">Sub Total</th><td>{money(receipt.subtotal, true)}</td></tr><tr><th scope="row">Discount (-)</th><td>{money(receipt.discount, true)}</td></tr><tr className="memo-grand-total"><th scope="row">Grand Total</th><td>{money(receipt.total, true)}</td></tr>{receipt.due > 0 && <tr className="memo-due"><th scope="row">Due</th><td>{money(receipt.due, true)}</td></tr>}</tbody>
            </table>
          </> : <p className="memo-continuation">Continued on page {pageIndex + 2}. Totals and signatures on the final page.</p>}
        </div>
        <div className="memo-bottom">
          <div className="memo-notes">
            <section className="memo-warranty" aria-label="Warranty terms and conditions">
              <h3 className="memo-warranty-title"><MemoSectionIcon name="terms"/>Warranty Terms &amp; Conditions:</h3>
              <ol>
                <li>Warranty as stated on the invoice: manufacturing defects only; used products limited to the stated warranty period.</li>
                <li>Excludes physical/liquid damage, burns, misuse and unauthorized repair.</li>
                <li>Software issues, data loss and consumables excluded unless specified.</li>
                <li>Original invoice required for claims. Subject to applicable law and the relevant warranty policy.</li>
              </ol>
            </section>
          </div>
          {isLast && <><div className="memo-signature"><div/><span>Customer Signature</span></div><div className="memo-signature"><div/><span>Authorized Signature</span></div></>}
        </div>
        {isLast && <section className="memo-payment-methods" aria-label="Accepted payment methods">
          <h3><MemoSectionIcon name="payment"/>Payment Method:</h3>
          <div className="memo-payment-options">
            <div className="memo-payment-option memo-payment-cash"><PaymentIcon name="cash"/><span>Cash</span></div>
            <div className="memo-payment-option memo-payment-bkash"><img src="/payment-logos/bkash.svg" alt="bKash"/></div>
            <div className="memo-payment-option memo-payment-nagad" aria-label="Nagad"><img src="/payment-logos/nagad-symbol.svg" alt=""/><span className="memo-bengali" lang="bn">নগদ</span></div>
            <div className="memo-payment-option memo-payment-rocket"><img src="/payment-logos/rocket.svg" alt="Rocket"/></div>
            <div className="memo-payment-option memo-payment-bank"><PaymentIcon name="bank"/><span>Bank Transfer</span></div>
          </div>
        </section>}
        {isLast && <p className="memo-thanks">Thank you for your business!</p>}
        {pages.length > 1 && <div className="memo-page-number">Page {pageIndex + 1} of {pages.length}</div>}
        <MemoWaves bottom/>
      </article>
    })}
  </div>
}
