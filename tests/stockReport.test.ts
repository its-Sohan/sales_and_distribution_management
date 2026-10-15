import test from 'node:test'
import assert from 'node:assert/strict'
import { makeInvoice, makePurchase, type Product, type ShopState } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { buildStockReportSummary, stockReceivedThisMonthTotal } from '../src/stockReport.ts'

const now = new Date('2026-10-16T12:00:00Z')

const item1: Product = {
  id: 'prod-mouse',
  code: 'MSE-001',
  en: 'Wireless Optical Mouse',
  detail: '2.4GHz USB Receiver',
  detailBn: 'ওয়্যারলেস মাউস',
  category: 'electronics',
  unit: 'pc',
  stock: 25000,
  purchased: 25000,
  art: 'daily',
  color: '#e4eaff',
  cost: 450,
  price: 650,
  inventoryValue: 11250,
  valuationStatus: 'verified',
}

const item2Low: Product = {
  id: 'prod-kb',
  code: 'KEY-002',
  en: 'Mechanical Keyboard RGB',
  detail: 'Blue Switches',
  detailBn: 'মেকানিক্যাল কিবোর্ড',
  category: 'electronics',
  unit: 'pc',
  stock: 5000, // 5 units -> < 10000 -> low stock
  purchased: 5000,
  art: 'daily',
  color: '#e4eaff',
  cost: 2000,
  price: 2800,
  inventoryValue: 10000,
  valuationStatus: 'verified',
}

const item3Out: Product = {
  id: 'prod-cable',
  code: 'CBL-003',
  en: 'HDMI 2.1 Cable 2m',
  detail: 'Ultra High Speed',
  detailBn: 'এইচডিএমআই ক্যাবল',
  category: 'cables',
  unit: 'pc',
  stock: 0,
  purchased: 0,
  art: 'daily',
  color: '#e4eaff',
  cost: 300,
  price: 500,
  inventoryValue: 0,
  valuationStatus: 'verified',
}

const item4Service: Product = {
  id: 'svc-repair',
  code: 'SVC-001',
  en: 'Laptop Screen Replacement Service',
  detail: 'Labor charge',
  detailBn: 'ল্যাপটপ স্ক্রিন মেরামত',
  category: 'services',
  unit: 'service',
  kind: 'service',
  stock: 0,
  purchased: 0,
  art: 'service',
  color: '#e4eaff',
  price: 1500,
  cost: 200,
}

const item5Archived: Product = {
  id: 'prod-old',
  code: 'OLD-001',
  en: 'Legacy Serial Mouse',
  detail: 'Discontinued model',
  detailBn: '',
  category: 'legacy',
  unit: 'pc',
  stock: 12000,
  purchased: 12000,
  art: 'daily',
  color: '#e4eaff',
  cost: 100,
  price: 150,
  inventoryValue: 1200,
  valuationStatus: 'verified',
  archived: true,
}

test('buildStockReportSummary generates comprehensive stock report with balances and rows', () => {
  const catalog = [item1, item2Low, item3Out, item4Service, item5Archived]
  const state: ShopState = {
    ...initialState,
    customProducts: catalog,
    receipts: [],
    purchases: [
      makePurchase([{ productId: item1.id, quantity: 5000, unitCost: 400, total: 2000 }], { paid: 2000, method: 'cash', createdAt: '2026-10-05T10:00:00Z' }),
    ],
  }

  const report = buildStockReportSummary(catalog, state, 'en', now)

  assert.equal(report.title, 'Stock Summary Report')
  assert.equal(report.subject, 'Inventory & Stock Valuation Summary')
  assert.equal(report.rows.length, 5)
  assert.equal(report.columns.length, 4)
  assert.equal(report.widths.length, 4)
  assert.equal(report.widths.reduce((a, b) => a + b, 0), 1112)

  // Balances
  // Total stock value: 11250 + 10000 + 0 + 1200 = 22450
  assert.equal(report.balances[0].label, 'Total stock value')
  assert.equal(report.balances[0].value, '৳ 22,450')
  assert.equal(report.balances[0].tone, 'positive')

  // Total items: 5
  assert.equal(report.balances[1].label, 'Total items')
  assert.equal(report.balances[1].value, '5')

  // Low stock items: item2Low (5 pcs) and item3Out (0 pcs) = 2
  assert.equal(report.balances[2].label, 'Low stock items')
  assert.equal(report.balances[2].value, '2')
  assert.equal(report.balances[2].tone, 'warning')

  // Stock received this month: 2000
  assert.equal(report.balances[3].label, 'Stock received this month')
  assert.equal(report.balances[3].value, '৳ 2,000')

  // Verify rows
  // Row 1: in stock
  assert.equal(report.rows[0].tone, 'positive')
  assert.match(report.rows[0].cells[0], /Wireless Optical Mouse/)
  assert.match(report.rows[0].cells[1], /MSE-001/)
  assert.match(report.rows[0].cells[1], /In stock/)
  assert.match(report.rows[0].cells[2], /25 pc/)
  assert.match(report.rows[0].cells[3], /Sale: ৳ 650/)

  // Row 2: low stock
  assert.equal(report.rows[1].tone, 'warning')
  assert.match(report.rows[1].cells[1], /Low stock/)

  // Row 3: out of stock
  assert.equal(report.rows[2].tone, 'danger')
  assert.match(report.rows[2].cells[1], /Out of stock/)

  // Row 4: service item
  assert.equal(report.rows[3].tone, 'neutral')
  assert.match(report.rows[3].cells[1], /Service/)
  assert.match(report.rows[3].cells[2], /Service/)

  // Row 5: archived item
  assert.equal(report.rows[4].tone, 'danger')
  assert.match(report.rows[4].cells[1], /Discontinued/)
})

test('buildStockReportSummary supports search queries and Bangla language', () => {
  const catalog = [item1, item2Low]
  const state: ShopState = {
    ...initialState,
    customProducts: catalog,
  }

  const reportBn = buildStockReportSummary(
    [item1],
    state,
    'bn',
    now,
    { query: 'Mouse', totalCatalog: catalog }
  )

  assert.equal(reportBn.title, 'মজুত সারসংক্ষেপ প্রতিবেদন')
  assert.match(reportBn.scope, /খোঁজা হচ্ছে: "Mouse"/)
  assert.equal(reportBn.rows.length, 1)
  assert.equal(reportBn.balances[1].value, '2') // totalCatalog is 2
  assert.match(reportBn.rows[0].cells[1], /মজুত আছে/)
  assert.match(reportBn.rows[0].cells[3], /বিক্রয়: ৳ 650/)
})

test('buildStockReportSummary handles missing valuation with warning note', () => {
  const unvaluedItem: Product = {
    ...item1,
    id: 'unvalued-1',
    inventoryValue: undefined,
    valuationStatus: 'unverified',
  }
  const catalog = [unvaluedItem]
  const state: ShopState = { ...initialState, customProducts: catalog }

  const report = buildStockReportSummary(catalog, state, 'en', now)
  assert.equal(report.balances[0].value, '—')
  assert.equal(report.balances[0].tone, 'warning')
  assert.ok(report.notice)
  assert.match(report.notice, /opening stock valuation/)
})
