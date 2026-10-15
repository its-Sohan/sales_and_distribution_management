import test from 'node:test'
import assert from 'node:assert/strict'
import { allProducts, makeInvoice, makePurchase, makeStockReceiving, type Purchase, type Supplier, type SupplierPayment } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { buildPurchaseOrderSummaryReport, buildPurchaseOrderReceipt } from '../src/purchaseReport.ts'

const supplier: Supplier = { id: 'sup-tech', name: 'Dhaka Tech Solutions', phone: '01711223344', address: 'Elephant Road, Dhaka' }
const now = new Date('2026-10-16T12:00:00Z')
const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`

const testInvoice = (paid = 500): Purchase =>
  makeInvoice(
    [
      { id: 'line-1', description: 'Logitech Wireless Mouse M185', unit: 'Unit', quantity: 5000, total: 3500 },
      { id: 'line-2', description: 'A4Tech USB Keyboard KR-85', unit: 'Unit', quantity: 3000, total: 1500 },
    ],
    {
      supplierId: supplier.id,
      paid,
      method: 'cash',
      invoiceNumber: 'INV-2026-901',
      createdAt: at(10),
      note: 'Priority delivery',
    }
  )

test('buildPurchaseOrderSummaryReport generates complete summary with balances and details', () => {
  const p1 = testInvoice(2000)
  const p2 = makeInvoice(
    [{ id: 'line-3', description: 'Cat6 Network Cable 305m', unit: 'Unit', quantity: 2000, total: 4000 }],
    {
      supplierId: supplier.id,
      paid: 4000,
      method: 'bank',
      invoiceNumber: 'INV-2026-902',
      createdAt: at(11),
    }
  )
  const receiving = makeStockReceiving(
    p1,
    [],
    [{ invoiceLineId: 'line-1', productId: allProducts(initialState.customProducts)[0].id, quantity: 5000 }],
    { createdAt: at(12) }
  )

  const report = buildPurchaseOrderSummaryReport(
    [p1, p2],
    { ...initialState, suppliers: [supplier], purchases: [p1, p2], stockReceivings: [receiving] },
    allProducts(initialState.customProducts),
    'en',
    now,
    { filterStatus: 'partReceived', query: 'Logitech' }
  )

  assert.equal(report.title, 'Purchase order summary report')
  assert.equal(report.rows.length, 2)
  assert.equal(report.balances[0].label, 'Total purchased')
  assert.equal(report.balances[0].value, '৳ 9,000') // 5000 + 4000
  assert.equal(report.balances[1].label, 'Net paid (after refunds)')
  assert.equal(report.balances[1].value, '৳ 6,000') // 2000 + 4000
  assert.equal(report.balances[2].label, 'Outstanding balance')
  assert.equal(report.balances[2].value, '৳ 3,000') // 3000 due

  // Check columns and row cells
  assert.equal(report.columns.length, 4)
  assert.match(report.rows[0].cells[0], /Invoice: INV-2026-901/)
  assert.match(report.rows[0].cells[1], /Dhaka Tech Solutions\nPart received\nPart paid/)
  assert.match(report.rows[0].cells[2], /৳ 5,000\nPaid: ৳ 2,000\nDue: ৳ 3,000/)
  assert.match(report.rows[0].cells[3], /Logitech Wireless Mouse M185/)
  assert.match(report.rows[0].cells[3], /Received quantity: 5 pc/)
  assert.match(report.rows[0].cells[3], /Priority delivery/)

  // Filter details
  assert.ok(report.filterDetails.some(f => f.label === 'Active filter' && f.value === 'Part received'))
  assert.ok(report.filterDetails.some(f => f.label === 'Search supplier name or phone…' && f.value === '"Logitech"'))
})

test('buildPurchaseOrderSummaryReport handles voided purchases and unknown accounting correctly', () => {
  const pVoided = { ...testInvoice(5000), voidedAt: at(13), voidReason: 'Damaged shipment returned' }
  const pUnknown = { ...testInvoice(), paid: undefined }
  const report = buildPurchaseOrderSummaryReport(
    [pVoided, pUnknown],
    { ...initialState, suppliers: [supplier], purchases: [pVoided, pUnknown] },
    [],
    'en',
    now
  )

  assert.equal(report.rows.length, 2)
  assert.equal(report.rows[0].tone, 'danger')
  assert.match(report.rows[0].cells[1], /Invoice voided/)
  assert.match(report.rows[0].cells[3], /Damaged shipment returned/)
  assert.match(report.rows[1].cells[1], /Payment status unconfirmed/)
  assert.match(report.notice, /unconfirmed/)
})

test('buildPurchaseOrderSummaryReport supports Bangla language', () => {
  const p = testInvoice(3500)
  const report = buildPurchaseOrderSummaryReport(
    [p],
    { ...initialState, suppliers: [supplier], purchases: [p] },
    [],
    'bn',
    now
  )

  assert.match(report.title, /ক্রয় আদেশ সারসংক্ষেপ প্রতিবেদন/)
  assert.match(report.columns[0], /তারিখ \/ সময়/)
  assert.match(report.columns[1], /সরবরাহকারী \/ অবস্থা/)
  assert.match(report.columns[2], /টাকা/)
  assert.match(report.columns[3], /বিল \/ পণ্যের বিবরণ/)
  assert.match(report.rows[0].cells[2], /পরিশোধিত: ৳ 3,500/)
})

test('buildPurchaseOrderReceipt produces full PO receipt with items, supplier, and payment history', () => {
  const p = testInvoice(2000)
  const payment: SupplierPayment = {
    id: 'pay-2',
    purchaseId: p.id,
    supplierId: supplier.id,
    amount: 1500,
    method: 'bank',
    type: 'payment',
    createdAt: at(12),
    note: 'Bank transfer',
  }
  const receiving = makeStockReceiving(
    p,
    [],
    [{ invoiceLineId: 'line-1', productId: allProducts(initialState.customProducts)[0].id, quantity: 5000 }],
    { createdAt: at(11), note: 'Batch #1 received' }
  )

  const receipt = buildPurchaseOrderReceipt(
    p,
    { ...initialState, suppliers: [supplier], purchases: [p], supplierPayments: [payment], stockReceivings: [receiving] },
    allProducts(initialState.customProducts),
    'en',
    now
  )

  assert.equal(receipt.title, 'Purchase order summary report')
  assert.match(receipt.subject, /INV-2026-901 · Dhaka Tech Solutions/)
  assert.equal(receipt.balances[0].value, '৳ 5,000') // Total
  assert.equal(receipt.balances[1].value, '৳ 3,500') // 2000 initial + 1500 payment
  assert.equal(receipt.balances[2].value, '৳ 1,500') // Remaining due

  // Details
  assert.ok(receipt.details.some(d => d.label === 'PO / Invoice #' && d.value === 'INV-2026-901'))
  assert.ok(receipt.details.some(d => d.label === 'Suppliers' && d.value === 'Dhaka Tech Solutions'))
  assert.ok(receipt.details.some(d => d.label === 'Phone' && d.value === '01711223344'))
  assert.ok(receipt.details.some(d => d.label === 'Stock received' && d.value.includes('1 Receiving batches')))
  assert.ok(receipt.details.some(d => d.label === 'Purchase payments' && d.value.includes('৳ 1,500 (Bank)')))

  // Items table
  assert.equal(receipt.columns.length, 4)
  assert.equal(receipt.rows.length, 2)
  assert.equal(receipt.rows[0].cells[0], '#01')
  assert.equal(receipt.rows[0].cells[1], 'Logitech Wireless Mouse M185')
  assert.match(receipt.rows[0].cells[2], /৳ 3,500\n@ ৳ 700 \/ Unit/)
  assert.match(receipt.rows[0].cells[3], /Ordered qty: 5 pc\nReceived quantity: 5 pc · Remaining: 0 pc/)
  assert.equal(receipt.rows[0].tone, 'positive')

  assert.equal(receipt.rows[1].cells[0], '#02')
  assert.equal(receipt.rows[1].cells[1], 'A4Tech USB Keyboard KR-85')
  assert.match(receipt.rows[1].cells[3], /Remaining: 3 pc/)
  assert.equal(receipt.rows[1].tone, 'warning')
})

test('buildPurchaseOrderReceipt handles direct stock purchases and voided purchases in Bangla', () => {
  const directPurchase = {
    ...makePurchase(
      [{ productId: allProducts(initialState.customProducts)[0].id, quantity: 2000, unitCost: 800, total: 1600 }],
      { createdAt: at(5), paid: 1600, method: 'cash' }
    ),
    voidedAt: at(6),
    voidReason: 'Wrong order',
  }

  const receipt = buildPurchaseOrderReceipt(
    directPurchase,
    { ...initialState, purchases: [directPurchase] },
    allProducts(initialState.customProducts),
    'bn',
    now
  )

  assert.match(receipt.title, /ক্রয় আদেশ সারসংক্ষেপ প্রতিবেদন/)
  assert.match(receipt.notice!, /Wrong order/)
  assert.equal(receipt.rows.length, 1)
  assert.equal(receipt.rows[0].tone, 'danger')
  assert.match(receipt.rows[0].cells[3], /অর্ডারকৃত পরিমাণ: 2 pc/)
})
