import { renderCustomerHistoryPdf, type CustomerHistoryPdfData } from '../../src/customerHistoryPdf'
import { renderSupplierReportPdf } from '../../src/supplierReportPdf'
import { buildSupplierReport } from '../../src/supplierReport'
import { initialState, makeInvoice, type Lang } from '../../src/model'

function customer(lang: Lang): CustomerHistoryPdfData {
  const bn = lang === 'bn'
  return {
    fileName: `customer-${lang}`, generatedAt: '15/10/2026 16:30',
    subject: bn ? 'রহমান কম্পিউটার অ্যান্ড সার্ভিসেস' : 'Rahman Computer & Services',
    scope: bn ? 'সব সময় · সাম্প্রতিক আগে · টাকা: BDT (৳)' : 'All time · Newest first · Currency: BDT (৳)',
    details: [
      { label: bn ? 'ইংরেজি নাম' : 'Name (English)', value: 'Rahman Computer & Services' },
      { label: bn ? 'বাংলা নাম' : 'Name (Bangla)', value: 'রহমান কম্পিউটার অ্যান্ড সার্ভিসেস' },
      { label: bn ? 'ফোন নম্বর' : 'Phone number', value: '01712-345678' },
      { label: bn ? 'ঠিকানা' : 'Address', value: bn ? 'দোকান ২৩, বিসিএস কম্পিউটার সিটি, আগারগাঁও, ঢাকা' : 'Shop 23, BCS Computer City, Agargaon, Dhaka' },
      { label: bn ? 'প্রারম্ভিক বকেয়া' : 'Opening balance', value: '৳ 2,500' },
      { label: bn ? 'নোট' : 'Notes', value: bn ? 'প্রতি মাসের শেষে হিসাব পরিশোধ করেন।' : 'Monthly settlement. Please call before delivery.' },
    ],
    balances: [
      { label: bn ? 'মোট বকেয়া' : 'Total outstanding', value: '৳ 18,450', tone: 'danger' },
      { label: bn ? 'স্টোর ক্রেডিট' : 'Store credit', value: '৳ 0', tone: 'neutral' },
      { label: bn ? 'লেনদেনের সংখ্যা' : 'Transactions', value: '12', tone: 'neutral' },
    ],
    transactions: Array.from({ length: 12 }, (_, i) => ({
      date: `${String(15 - i).padStart(2, '0')}/10/2026 14:30`,
      type: i % 3 === 1 ? (bn ? 'পেমেন্ট গ্রহণ' : 'Payment received') : (bn ? 'বকেয়াসহ বিক্রয়' : 'Sale with due'),
      amount: i % 3 === 1 ? '৳ 5,000' : '৳ 8,750',
      settlement: i % 3 === 1 ? undefined : (bn ? 'পরিশোধিত: ৳ 5,000 / বকেয়া: ৳ 3,750' : 'Paid: ৳ 5,000 / Due: ৳ 3,750'),
      details: i % 3 === 1 ? (bn ? 'ব্যাংক ট্রান্সফারে আগের বকেয়া পরিশোধ।' : 'Bank transfer against the previous outstanding balance.') : (bn ? `বিল #${1208 - i} · Logitech ওয়্যারলেস মাউস, কিবোর্ড এবং USB কেবল।` : `Bill #${1208 - i} · Logitech wireless mouse, keyboard and USB cables. Delivery to the main shop.`),
      tone: i % 3 === 1 ? 'positive' : 'warning',
    })),
    labels: {
      title: bn ? 'গ্রাহকের লেনদেন প্রতিবেদন' : 'Customer transaction report', generated: bn ? 'তৈরির সময়' : 'Generated',
      customerDetails: bn ? 'গ্রাহকের তথ্য' : 'Customer details', transactionHistory: bn ? 'লেনদেনের বিবরণ' : 'Transaction history',
      date: bn ? 'তারিখ / সময়' : 'Date / time', type: bn ? 'লেনদেনের ধরন' : 'Transaction', amount: bn ? 'টাকার পরিমাণ' : 'Amount',
      details: bn ? 'নোট / বিবরণ' : 'Notes / details', noTransactions: bn ? 'এখনো কোনো লেনদেন নেই।' : 'No transactions yet.', page: bn ? 'পৃষ্ঠা' : 'Page',
    },
  }
}

function supplier(lang: Lang, long = false) {
  const vendor = { id: 'report-supplier', name: lang === 'bn' ? 'ঢাকা টেক ডিস্ট্রিবিউশন' : 'Dhaka Tech Distribution', phone: '01912-345678', address: 'Level 6, Multiplan Centre, Elephant Road, Dhaka', note: lang === 'bn' ? 'চালান অনুযায়ী পণ্য গ্রহণ করতে হবে।' : 'Receive items against the original invoice.' }
  const invoice = makeInvoice(Array.from({ length: long ? 16 : 4 }, (_, i) => ({
    id: `line-${i}`, description: lang === 'bn' ? `${i + 1}. Logitech ওয়্যারলেস মাউস - মিশ্র মডেল, কালো রঙ। ${long ? 'প্রতিটি পণ্যের মডেল এবং ওয়ারেন্টি যাচাই করতে হবে। '.repeat(12) : ''}` : `${i + 1}. Logitech wireless mouse, mixed models, black. ${long ? 'Verify the model, warranty and serial number before receiving. '.repeat(12) : ''}`,
    unit: 'pc', quantity: 10000, total: 7500,
  })), { supplierId: vendor.id, invoiceNumber: 'INV-2026-1048', paid: 10000, method: 'bank', createdAt: '2026-10-12T09:00:00Z', note: long ? 'FINAL-INVOICE-NOTE' : 'Deliver to the main shop.' })
  return buildSupplierReport(vendor, { ...initialState, purchases: [invoice], supplierPayments: [{ id: 'payment', purchaseId: invoice.id, supplierId: vendor.id, amount: 5000, type: 'payment', method: 'cash', createdAt: '2026-10-14T08:30:00Z', note: 'FINAL-PAYMENT-NOTE' }] }, [], lang, new Date('2026-10-15T10:30:00Z'))
}

const cases = ['customer-en', 'customer-bn', 'supplier-en', 'supplier-bn', 'supplier-long', 'supplier-long-bn', 'customer-long', 'customer-empty', 'supplier-empty', 'customer-warning', 'supplier-warning', 'customer-large-balance']
Object.assign(window, { reportPdfCases: cases, async auditReportPdf(name: string) {
  const painted: Array<{ text: string; x: number; y: number; size: number; page: number }> = []
  const overflow: string[] = []
  let page = 0
  const fillText = CanvasRenderingContext2D.prototype.fillText
  const toDataURL = HTMLCanvasElement.prototype.toDataURL
  CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1])
    const width = this.measureText(text).width
    const left = this.textAlign === 'right' ? x - width : this.textAlign === 'center' ? x - width / 2 : x
    if (left < 63 || left + width > 1177 || y > 1710 || y - size < 30) overflow.push(`${text} @ ${left},${y}`)
    painted.push({ text, x, y, size, page })
    return fillText.call(this, text, x, y, maxWidth)
  }
  HTMLCanvasElement.prototype.toDataURL = function(...args) { page++; return toDataURL.apply(this, args) }
  try {
    let bytes: Uint8Array
    if (name.startsWith('customer')) {
      const data = customer(name.endsWith('bn') ? 'bn' : 'en')
      if (name === 'customer-empty') data.transactions = []
      if (name === 'customer-long') {
        data.details[3].value = 'Long address and delivery instructions. '.repeat(150) + 'FINAL-ADDRESS'
        data.transactions = [{ ...data.transactions[0], details: 'Complete transaction description. '.repeat(220) + 'FINAL-TRANSACTION' }]
      }
      if (name === 'customer-warning') {
        data.notice = 'Historical accounting needs review. Due and credit balances are unconfirmed.'
        data.balances[0].value = '—'; data.balances[1].value = '—'
      }
      if (name === 'customer-large-balance') data.balances[0].value = '৳ 99,999,999,999.99'
      bytes = await renderCustomerHistoryPdf(data)
    } else {
      const data = supplier(name.endsWith('bn') ? 'bn' : 'en', name.startsWith('supplier-long'))
      if (name === 'supplier-empty') data.rows = []
      if (name === 'supplier-warning') {
        data.notice = 'Historical accounting needs review. Outstanding balances are unconfirmed.'
        data.balances[2].value = 'Payment status unconfirmed'; data.balances[2].tone = 'warning'
      }
      bytes = await renderSupplierReportPdf(data)
    }
    const text = painted.map(line => line.text).join('\n')
    const base64 = btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''))
    return { base64, pages: page, overflow, minFont: Math.min(...painted.map(line => line.size)), text }
  } finally {
    CanvasRenderingContext2D.prototype.fillText = fillText
    HTMLCanvasElement.prototype.toDataURL = toDataURL
  }
} })
