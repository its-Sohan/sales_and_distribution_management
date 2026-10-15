import test from 'node:test'
import assert from 'node:assert/strict'
import { allProducts, makeInvoice, makePurchase, makeStockReceiving, supplierHistory, type SupplierPayment, type PurchaseSettlement } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { buildSupplierReport } from '../src/supplierReport.ts'
import { loadWorkspace, saveWorkspace } from '../src/backend.ts'
import { backendFixture } from './d1Support.ts'

const supplier = { id: 'supplier-report', name: 'ঢাকা Tech', phone: '01700000000', address: 'Dhaka' }
const now = new Date('2026-10-14T10:00:00Z')
const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`
const invoice = (paid = 200) => makeInvoice([{ id: 'line', description: 'Wireless mice — mixed brands', unit: 'Unit', quantity: 10000, total: 1000 }], { supplierId: supplier.id, paid, method: 'cash', invoiceNumber: 'INV-101', createdAt: at(1), note: 'Deliver carefully' })

test('supplier history includes every event on its own date and follows invoice ownership', () => {
  const p = invoice()
  const unrelated = { ...invoice(), id: 'other', supplierId: 'another-supplier' }
  const payments: SupplierPayment[] = [{ id: 'late', purchaseId: p.id, amount: 300, method: 'bank', type: 'payment', createdAt: at(3) }, { id: 'unrelated', purchaseId: unrelated.id, supplierId: unrelated.supplierId, amount: 1, method: 'cash', type: 'payment', createdAt: at(2) }]
  const receiving = makeStockReceiving(p, [], [{ invoiceLineId: 'line', productId: allProducts(initialState.customProducts)[0].id, quantity: 5000 }], { createdAt: at(2) })
  const history = supplierHistory(supplier.id, [unrelated, p], payments, [], [receiving])
  assert.deepEqual(history.map(e => e.type), ['invoice', 'initialPayment', 'receiving', 'payment'])
  assert.deepEqual(history.map(e => e.amount), [1000, 200, 500, 300])
  assert.deepEqual(history.map(e => e.createdAt), [at(1), at(1), at(2), at(3)])
  assert.equal(new Set(history.map(e => e.id)).size, 4)
})

test('report preserves complete invoice descriptions and current payment and receiving statuses', () => {
  const p = invoice()
  const receiving = makeStockReceiving(p, [], [{ invoiceLineId: 'line', productId: allProducts(initialState.customProducts)[0].id, quantity: 5000 }])
  const report = buildSupplierReport(supplier, { ...initialState, purchases: [p], stockReceivings: [receiving] }, allProducts(initialState.customProducts), 'en', now)
  assert.match(report.rows[0].cells[1], /Part paid\nPart received/)
  assert.match(report.rows[0].cells[2], /Paid: ৳ 200\nDue: ৳ 800/)
  assert.match(report.rows[0].cells[3], /INV-101\nWireless mice — mixed brands/)
  assert.match(report.rows[0].cells[3], /Received quantity: 5 pc/)
  assert.match(report.rows[0].cells[3], /Deliver carefully/)
  assert.match(report.summary, /Total purchased: ৳ 1,000.*Net paid \(after refunds\): ৳ 200.*Outstanding balance: ৳ 800/)
  assert.match(report.rows.find(r => r.id.startsWith('receiving-'))!.cells[3], /no new supplier charge/)
})

test('voided invoice report retains original payment, later refund, and void reason', () => {
  const p = { ...invoice(1000), voidedAt: at(4), voidReason: 'Order cancelled' }
  const refund: SupplierPayment = { id: 'refund', purchaseId: p.id, amount: 1000, type: 'refund', method: 'bank', createdAt: at(4) }
  const state = { ...initialState, purchases: [p], supplierPayments: [refund] }
  const history = supplierHistory(supplier.id, [p], [refund])
  assert.deepEqual(history.map(e => e.type), ['invoice', 'initialPayment', 'refund', 'void'])
  const report = buildSupplierReport(supplier, state, [], 'en', now)
  assert.match(report.rows[0].cells[1], /Invoice voided/)
  assert.match(report.rows.at(-1)!.cells[3], /Order cancelled/)
  assert.match(report.summary, /Total purchased: ৳ 0.*Net paid \(after refunds\): ৳ 0.*Outstanding balance: ৳ 0/)
})

test('legacy review links the supplier and confirms original payment without duplicating cash', () => {
  const p = makePurchase([{ productId: 'missing-product', quantity: 1000, unitCost: 1000, total: 1000 }], { createdAt: at(1) })
  const review: PurchaseSettlement = { id: 'review', purchaseId: p.id, supplierId: supplier.id, paid: 400, method: 'cash', createdAt: at(3), note: 'Original receipt checked' }
  const payment: SupplierPayment = { id: 'later', purchaseId: p.id, amount: 200, type: 'payment', method: 'mobile', createdAt: at(4) }
  const report = buildSupplierReport(supplier, { ...initialState, purchases: [p], purchaseSettlements: [review], supplierPayments: [payment] }, [], 'en', now)
  assert.deepEqual(supplierHistory(supplier.id, [p], [payment], [review]).map(e => e.type), ['invoice', 'initialPayment', 'review', 'payment'])
  assert.match(report.rows[2].cells[3], /Confirms original payment; no new cash movement/)
  assert.match(report.rows[0].cells[3], /missing-product/)
  assert.match(report.summary, /Net paid \(after refunds\): ৳ 600.*Outstanding balance: ৳ 400/)
})

test('unknown settlements remain explicitly unconfirmed, with no invented payment', () => {
  const p = { ...invoice(), paid: undefined }
  const report = buildSupplierReport(supplier, { ...initialState, purchases: [p] }, [], 'en', now)
  assert.equal(report.rows.length, 1)
  assert.match(report.notice, /unconfirmed/)
  assert.match(report.rows[0].cells[2], /Payment status unconfirmed/)
  const broken = buildSupplierReport(supplier, { ...initialState, purchases: [{ ...p, paid: 200, accountingIssue: 'Review currency' }] }, [], 'en', now)
  assert.equal(broken.rows.length, 1)
  assert.match(broken.rows[0].cells[3], /Review currency/)
})

test('empty and archived supplier reports support Bangla and preserve long descriptions', () => {
  const empty = buildSupplierReport({ ...supplier, archived: true }, initialState, [], 'bn', now)
  assert.equal(empty.rows.length, 0)
  assert.match(empty.details, /আর্কাইভ করা/)
  assert.match(empty.title, /সরবরাহকারীর/)
  assert.match(empty.fileName, /ঢাকা-Tech/)
  const description = 'বড় বিবরণ '.repeat(100)
  const p = invoice(0); p.invoiceLines![0].description = description
  const report = buildSupplierReport(supplier, { ...initialState, purchases: [p] }, [], 'bn', now)
  assert.ok(report.rows[0].cells[3].includes(description))
})

test('supplier report reflects persisted invoice, receiving, and payment after another terminal reloads', async t => {
  const fixture = backendFixture()
  t.mock.method(globalThis, 'fetch', fixture.fetch)
  t.after(() => fixture.db.close())
  let workspace = await loadWorkspace(1)
  const p = invoice()
  workspace = await saveWorkspace({ ...workspace.state, suppliers: [supplier], purchases: [p] }, workspace)
  const payment: SupplierPayment = { id: 'payment', purchaseId: p.id, supplierId: supplier.id, amount: 800, method: 'bank', type: 'payment', createdAt: at(3), note: 'Balance cleared' }
  const receiving = makeStockReceiving(p, [], [{ invoiceLineId: 'line', productId: allProducts(initialState.customProducts)[0].id, quantity: 10000 }], { createdAt: at(2) })
  await saveWorkspace({ ...workspace.state, supplierPayments: [payment], stockReceivings: [receiving] }, workspace)
  const reloaded = await loadWorkspace(2)
  const report = buildSupplierReport(reloaded.state.suppliers![0], reloaded.state, allProducts(reloaded.state.customProducts), 'en', now)
  assert.equal(report.rows.length, 4)
  assert.match(report.rows[0].cells[1], /Paid in full\nFully received/)
  assert.match(report.rows.at(-1)!.cells[3], /Balance cleared/)
  assert.match(report.summary, /Outstanding balance: ৳ 0/)
})
