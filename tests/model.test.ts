import test from 'node:test'
import assert from 'node:assert/strict'
import type { Return, Supplier, Purchase } from '../src/model.ts'
import { parseReferencePrice, validateSalePricing, addSaleLine, saleUnitPrice, allProducts, allCustomers, allocateCustomerAccount, allocateDiscount, applyInventoryMovement, computeTotalFromUnitCost, computeUnitCostFromTotal, costStatusOf, customerBalance, customerHistory, customerLedger, displayCatalogProducts, filterByWindow, filterPurchases, filterReceiptsByWindow, getProductVariants, inventoryCostAmount, inventoryValuationReady, isService, lineTotal, makeExpense, makeInvoice, makePurchase, makeStockPurchase, makeReceipt, makeReturn, makeReturnExchange, calculateReturnSettlement, makeStockAdjustment, matchCatalogProduct, money, moveDate, moveMonth, nextReceiptNumber, parseMoney, parseQuantity, productCost, proportionalAmount, quantityWithUnit, receiptLineCost, receiptOutstandingDue, receiptProfit, searchCatalog, searchCustomers, scoreCustomerMatch, stockFor, subtotal, supplierOutstandingDue, type AccountTransaction, type Product, type Customer } from '../src/model.ts'
import { findProduct, initialState } from './fixtures/catalog.ts'

test('quantities use scaled integers and reject fractional pieces', () => {
  assert.equal(parseQuantity('0.750', 'kg'), 750)
  assert.equal(parseQuantity('2.5', 'kg'), 2500)
  assert.equal(parseQuantity('2.5', 'pc'), null)
  for (const value of ['0', '-2', '1e3', '0.0001', 'NaN']) assert.equal(parseQuantity(value, 'kg'), null)
})
test('money display formats integer taka directly', () => {
  assert.equal(money(350), '350')
  assert.equal(money(350, true), '350')
})
test('money and weighted totals round once at the line boundary', () => {
  assert.equal(parseMoney('135'), 135)
  assert.equal(parseMoney('135.0'), 135)
  assert.equal(parseMoney(' 135.00 '), 135)
  assert.equal(parseMoney('135.25'), null)
  assert.equal(parseMoney('135.01'), null)
  assert.equal(parseMoney('135.000'), null)
  assert.equal(lineTotal(135, 750), 101)
  assert.equal(lineTotal(123, 333), 41)
  assert.equal(subtotal(initialState.lines, initialState.customProducts), 900)
})
test('custom repair services use jobs and manual prices without stock', () => {
  const service = findProduct('service-custom')
  assert.equal(service.unit, 'pc')
  assert.equal(service.art, 'cleaner')
  assert.equal(parseQuantity('2', service.unit), 2000)
  assert.equal(parseQuantity('1.5', service.unit), null)
  const oldOverride = allProducts([{ ...service, unit: 'BDT', art: 'cleaner' }]).find(item => item.id === service.id)!
  assert.equal(oldOverride.kind, 'service')
  assert.equal(oldOverride.stock, 0)
  assert.equal(oldOverride.unit, 'pc')
  assert.equal(oldOverride.art, 'cleaner')
  const sale = makeReceipt({ ...initialState, lines: [{ productId: service.id, quantity: 2000, unitPrice: 500 }] }, 1000, 'cash')
  assert.equal(sale.total, 1000)
  assert.equal(sale.lines[0].product.price, 500)
  assert.equal(stockFor(service, [sale]), 0)
})
test('repeated products combine quantities at the latest selling price', () => {
  const lines = addSaleLine([{ productId: 'mouse-opt', quantity: 2000, unitPrice: 500 }], { productId: 'mouse-opt', quantity: 1000, unitPrice: 450 })
  assert.deepEqual(lines, [{ productId: 'mouse-opt', quantity: 3000, unitPrice: 450 }])
  const receipt = makeReceipt({ ...initialState, lines }, 1350, 'cash')
  assert.equal(receipt.total, 1350)
  assert.equal(receipt.lines[0].product.price, 450)
  assert.equal(findProduct('mouse-opt').price, 350)
  assert.equal(receiptProfit(receipt), 1350 - receipt.lines[0].costAmount!)
  assert.throws(() => addSaleLine([{ productId: 'service-custom', quantity: 500000, legacyAmount: true }], { productId: 'service-custom', quantity: 1000, unitPrice: 500 }), /legacyAmount/)
})
test('sale prices reject invalid amounts and keep legacy catalog fallback', () => {
  const product = findProduct('mouse-opt')
  for (const unitPrice of [0, -1, 1.5, NaN, Infinity, 100000001]) {
    assert.throws(() => saleUnitPrice({ productId: product.id, quantity: 1000, unitPrice }, product), /amount/)
  }
  assert.equal(saleUnitPrice({ productId: product.id, quantity: 1000 }, product), 350)
  assert.throws(() => makeReceipt({ ...initialState, lines: [{ productId: 'service-custom', quantity: 500000, legacyAmount: true }] }, 500, 'cash'), /legacyAmount/)
})
test('custom services remain billable without stock or fabricated buy cost', () => {
  const service: Product = { ...findProduct('service-pc-clean'), id: 'custom-service', code: 'S1', stock: 0, purchased: 0, cost: undefined }
  const state = { ...initialState, lines: [{ productId: service.id, quantity: 3000 }], customProducts: [service] }
  const sale = makeReceipt(state, service.price * 3, 'cash')
  assert.equal(sale.total, service.price * 3)
  assert.equal(stockFor(service, [sale]), 0)
  assert.equal(allProducts([service]).find(item => item.id === service.id)?.kind, 'service')
})
test('cash sale records change, snapshots prices, and reduces stock', () => {
  const receipt = makeReceipt(initialState, 1000, 'cash')
  assert.equal(receipt.total, 900)
  assert.equal(receipt.paid, 900)
  assert.equal(receipt.change, 100)
  assert.equal(receipt.due, 0)
  assert.equal(stockFor(findProduct('mouse-opt'), [receipt]), 44000)
  assert.notEqual(receipt.lines[0].product, findProduct('mouse-opt'))
})
test('customer dues require a named customer; electronic payments cannot give change', () => {
  assert.throws(() => makeReceipt(initialState, 500, 'cash'), /customer/)
  const receipt = makeReceipt({ ...initialState, customerId: 'c1', discount: 100 }, 700, 'mobile')
  assert.equal(receipt.total, 800)
  assert.equal(receipt.due, 100)
  assert.equal(receipt.change, 0)
  assert.throws(() => makeReceipt(initialState, 1000, 'mobile'), /overpayment/)
})
test('empty bills and invalid payment amounts cannot become receipts', () => {
  assert.throws(() => makeReceipt({ ...initialState, lines: [] }, 0, 'cash'), /empty/)
  assert.throws(() => makeReceipt(initialState, -1, 'cash'), /amount/)
})
test('inventory unit cost, margin, and custom provisioned items calculate accurately', () => {
  const mouse = findProduct('mouse-opt')
  assert.equal(mouse.cost, 240)
  assert.equal(mouse.price, 350)
  assert.equal(mouse.price - (mouse.cost ?? 0), 110)
  assert.equal(mouse.purchased, 45000)

  // Custom provisioned item
  const customItem = {
    id: 'p-custom-1',
    code: '999',
    en: 'Thermal Pad',
    detail: '1.0mm thickness',
    detailBn: '১.০ মিমি পুরু',
    category: 'staples' as const,
    unit: 'pc' as const,
    price: 50,
    cost: 35,
    stock: 20000,
    purchased: 20000,
    art: 'daily' as const,
    color: '#ccc',
  }
  const stateWithCustom = {
    ...initialState,
    lines: [{ productId: 'p-custom-1', quantity: 2000 }],
    customProducts: [customItem],
  }
  const receipt = makeReceipt(stateWithCustom, 100, 'cash')
  assert.equal(receipt.total, 100)
  assert.equal(stockFor(customItem, [receipt]), 18000)
})

test('filterReceiptsByWindow filters accurately across today, 3 days, 7 days, and month', () => {
  const baseTime = new Date('2026-10-08T14:30:00.000Z')
  const rToday = { ...makeReceipt(initialState, 1000, 'cash'), id: 'r-today', createdAt: '2026-10-08T10:00:00.000Z' }
  const r2DaysAgo = { ...makeReceipt(initialState, 1000, 'cash'), id: 'r-2days', createdAt: '2026-10-06T12:00:00.000Z' }
  const r5DaysAgo = { ...makeReceipt(initialState, 1000, 'cash'), id: 'r-5days', createdAt: '2026-10-03T12:00:00.000Z' }
  const rLastMonth = { ...makeReceipt(initialState, 1000, 'cash'), id: 'r-lastmonth', createdAt: '2026-09-25T12:00:00.000Z' }

  const receipts = [rToday, r2DaysAgo, r5DaysAgo, rLastMonth]

  const todayList = filterReceiptsByWindow(receipts, 'today', baseTime)
  assert.equal(todayList.length, 1)
  assert.equal(todayList[0].id, 'r-today')

  const threeDaysList = filterReceiptsByWindow(receipts, '3days', baseTime)
  assert.equal(threeDaysList.length, 2)
  assert.deepEqual(threeDaysList.map(r => r.id), ['r-today', 'r-2days'])

  const sevenDaysList = filterReceiptsByWindow(receipts, '7days', baseTime)
  assert.equal(sevenDaysList.length, 3)
  assert.deepEqual(sevenDaysList.map(r => r.id), ['r-today', 'r-2days', 'r-5days'])

  const monthList = filterReceiptsByWindow(receipts, 'month', baseTime)
  assert.equal(monthList.length, 3)
  assert.deepEqual(monthList.map(r => r.id), ['r-today', 'r-2days', 'r-5days'])
})

test('supplier outstanding balance is calculated at the selected report boundary', () => {
  const line = [{ productId: 'mouse-opt', quantity: 1000, unitCost: 500, total: 500 }]
  const September = makePurchase(line, { supplierId: 'supplier-1', paid: 0, method: 'cash', createdAt: '2026-09-20T04:00:00.000Z' })
  const October = makePurchase(line, { supplierId: 'supplier-1', paid: 0, method: 'cash', createdAt: '2026-10-10T04:00:00.000Z' })
  const voidedLater = { ...makePurchase(line, { supplierId: 'supplier-1', paid: 0, method: 'cash', createdAt: '2026-09-21T04:00:00.000Z' }), voidedAt: '2026-10-05T04:00:00.000Z' }
  const payment = { id: 'supplier-payment-period', purchaseId: September.id, supplierId: 'supplier-1', amount: 100, method: 'cash' as const, type: 'payment' as const, createdAt: '2026-10-03T04:00:00.000Z' }

  assert.equal(supplierOutstandingDue([September, October, voidedLater], [payment], [], Date.parse('2026-10-01T00:00:00.000Z')), 1000)
  assert.equal(supplierOutstandingDue([September, October, voidedLater], [payment], [], Date.parse('2026-11-01T00:00:00.000Z')), 900)
})

test('customer provisioning, balance calculations, dues, and credit adjustments', () => {
  const newCust = {
    id: 'c-test-1',
    en: 'Rafiqul Islam',
    bn: 'রফিকুল ইসলাম',
    phone: '01811 111222',
    openingBalance: 200,
  }

  const all = allCustomers([newCust])
  assert.equal(all.some(c => c.id === 'c-test-1'), true)

  const receiptWithDue = {
    ...makeReceipt({ ...initialState, customerId: newCust.id, customCustomers: [newCust] }, 700, 'cash'),
    id: 'r-due-1',
    due: 200,
    customer: newCust,
  }

  const txAdjustment: AccountTransaction = {
    id: 'tx-adjustment-1',
    customerId: newCust.id,
    type: 'credit_adjust',
    amount: 500,
    createdAt: new Date().toISOString(),
  }

  const txPayment: AccountTransaction = {
    id: 'tx-pay-1',
    customerId: newCust.id,
    type: 'payment',
    amount: 400,
    createdAt: new Date().toISOString(),
  }

  const ledger = customerLedger(newCust.id, [receiptWithDue], [txAdjustment, txPayment])
  assert.equal(ledger.length, 3)

  const bal = customerBalance(newCust, [receiptWithDue], [txAdjustment, txPayment])
  assert.equal(bal.totalDue, 500)
  assert.equal(bal.totalPaid, 400)
  assert.equal('availableCredit' in bal, false)
})

test('customer history includes paid and due bills once, alongside account transactions', () => {
  const saleState = { ...initialState, customerId: 'c1' }
  const paid = { ...makeReceipt(saleState, 1000, 'cash'), id: 'paid', number: 1, createdAt: '2026-10-01T10:00:00Z' }
  const due = { ...makeReceipt(saleState, 400, 'cash'), id: 'due', number: 2, createdAt: '2026-10-02T10:00:00Z' }
  const other = makeReceipt({ ...initialState, customerId: 'c2' }, 900, 'cash')
  const walkIn = makeReceipt(initialState, 900, 'cash')
  const payment: AccountTransaction = { id: 'payment', customerId: 'c1', type: 'payment', amount: 500, createdAt: '2026-10-03T10:00:00Z' }
  const unrelated: AccountTransaction = { ...payment, id: 'other-payment', customerId: 'c2' }
  const receipts = [due, other, walkIn, paid]
  const history = customerHistory('c1', receipts, [payment, unrelated])
  assert.deepEqual(history.map(tx => tx.id), ['tx-sale-paid', 'tx-sale-due', 'payment'])
  assert.deepEqual(history.map(tx => tx.type), ['sale', 'sale', 'payment'])
  assert.equal(history[0].amount, paid.total)
  assert.equal(history[1].amount, due.total)
  assert.ok(history[0].type === 'sale' && history[1].type === 'sale')
  assert.equal(history[0].paid, paid.total)
  assert.equal(history[0].due, 0)
  assert.equal(history[1].paid, 400)
  assert.equal(history[1].due, 500)
  assert.equal(customerBalance(paid.customer!, receipts, [payment, unrelated]).totalDue, 0)
  assert.equal(customerHistory('unknown', receipts, [payment]).length, 0)
})

test('newly provisioned products are retrievable via catalog search under recent category and across tabs', () => {
  const newProduct: Product = {
    id: 'p-custom-webcam',
    code: '250',
    en: 'HD 1080p Webcam',
    detail: 'USB with mic · pc',
    detailBn: 'মাইক্রোফোন সহ ইউএসবি',
    category: 'fresh',
    unit: 'pc',
    price: 1800,
    cost: 1400,
    stock: 15000,
    purchased: 15000,
    art: 'daily',
    color: '#ffe599',
  }

  const catalog = allProducts([newProduct])
  assert.equal(catalog.some(p => p.id === 'p-custom-webcam'), true)

  const recentProducts = catalog.slice(0, 10).filter(p => p.id !== 'p-custom-webcam')
  assert.equal(recentProducts.some(p => p.id === 'p-custom-webcam'), false)

  const emptyRecentSearch = searchCatalog(catalog, '', 'recent', recentProducts)
  assert.equal(emptyRecentSearch.some(p => p.id === 'p-custom-webcam'), false)

  const codeSearch = searchCatalog(catalog, '250', 'recent', recentProducts)
  assert.equal(codeSearch.length, 1)
  assert.equal(codeSearch[0].id, 'p-custom-webcam')

  const enSearch = searchCatalog(catalog, 'webcam', 'recent', recentProducts)
  assert.equal(enSearch.length, 1)
  assert.equal(enSearch[0].id, 'p-custom-webcam')

  // Legacy translated names must not become product search names.
  const legacyCatalog = allProducts([{ ...newProduct, bn: 'পুরোনোঅনুবাদ', variantNameBn: 'পুরোনোভ্যারিয়েন্ট' } as Product])
  assert.equal(searchCatalog(legacyCatalog, 'পুরোনোঅনুবাদ', 'recent', recentProducts).length, 0)
  assert.equal(searchCatalog(legacyCatalog, 'পুরোনোভ্যারিয়েন্ট', 'recent', recentProducts).length, 0)

  const crossCategorySearch = searchCatalog(catalog, '250', 'staples', recentProducts)
  assert.equal(crossCategorySearch.length, 1)
  assert.equal(crossCategorySearch[0].id, 'p-custom-webcam')

  const staplesTab = searchCatalog(catalog, '', 'staples', recentProducts)
  assert.equal(staplesTab.every(p => p.category === 'staples'), true)
  assert.equal(staplesTab.some(p => p.id === 'p-custom-webcam'), false)
})

test('multi-variant custom products deduplicate in display catalog and match by base code, variant code, and variant names', () => {
  const groupId = 'grp-12345678-501'
  const variant1: Product = {
    id: 'p-keyboard-blue',
    code: '501-B',
    en: 'Mechanical Keyboard',
    detail: 'Blue switch · RGB',
    detailBn: 'ব্লু সুইচ · আরজিবি',
    category: 'household',
    unit: 'pc',
    price: 350000,
    cost: 280000,
    stock: 10000,
    purchased: 10000,
    groupId,
    variantName: 'Blue Switch',
    art: 'daily',
    color: '#ffc0cb',
  }

  const variant2: Product = {
    id: 'p-keyboard-red',
    code: '501-R',
    en: 'Mechanical Keyboard',
    detail: 'Red switch · Silent',
    detailBn: 'রেড সুইচ · সাইলেন্ট',
    category: 'household',
    unit: 'pc',
    price: 350000,
    cost: 280000,
    stock: 10000,
    purchased: 10000,
    groupId,
    variantName: 'Red Switch',
    art: 'daily',
    color: '#ffffff',
  }

  const catalog = allProducts([variant1, variant2])

  const displayList = displayCatalogProducts(catalog)
  const groupItems = displayList.filter(p => p.groupId === groupId)
  assert.equal(groupItems.length, 1)

  const variants = getProductVariants(groupItems[0], catalog)
  assert.equal(variants.length, 2)

  const baseCodeMatch = searchCatalog(catalog, '501', 'recent', [])
  assert.equal(baseCodeMatch.length, 1)
  assert.equal(baseCodeMatch[0].groupId, groupId)

  const var1Match = searchCatalog(catalog, '501-B', 'recent', [])
  assert.equal(var1Match.length, 1)

  const var2NameMatch = searchCatalog(catalog, 'Red Switch', 'recent', [])
  assert.equal(var2NameMatch.length, 1)

  const bnVarMatch = searchCatalog(catalog, 'ব্লু সুইচ', 'recent', [])
  assert.equal(bnVarMatch.length, 1)

  const archivedCatalog: Product[] = catalog.map(p => p.groupId === groupId ? { ...p, archived: true } : p)
  const archivedSearch = searchCatalog(archivedCatalog, '501', 'all', [])
  assert.equal(archivedSearch.some(p => p.groupId === groupId), false)
})

test('sales counter search algorithm matches products accurately even with typos, compound words, and Bengali numerals', () => {
  const catalog = allProducts(initialState.customProducts)

  // 1. English letter transposition & missing/extra letters
  const optSearch = searchCatalog(catalog, 'optcl')
  assert.ok(optSearch.length > 0)
  assert.equal(optSearch[0].id, 'mouse-opt')

  const keybordSearch = searchCatalog(catalog, 'keybord')
  assert.ok(keybordSearch.length > 0)
  assert.ok(['keyboard-usb', 'keyboard-rgb'].includes(keybordSearch[0].id))

  const pendrivSearch = searchCatalog(catalog, 'pendriv')
  assert.ok(pendrivSearch.length > 0)
  assert.ok(['pendrive-32gb', 'pendrive-64gb'].includes(pendrivSearch[0].id))

  const speekerSearch = searchCatalog(catalog, 'speeker')
  assert.ok(speekerSearch.length > 0)
  assert.equal(speekerSearch[0].id, 'speaker-mini')

  const thermalSearch = searchCatalog(catalog, 'thrmal')
  assert.ok(thermalSearch.length > 0)
  assert.equal(thermalSearch[0].id, 'thermal-paste')

  // 2. Bengali numerals (১০১ -> 101, ১০৩ -> 103)
  const bnNumSearch = searchCatalog(catalog, '১০১')
  assert.equal(bnNumSearch.length, 1)
  assert.equal(bnNumSearch[0].id, 'mouse-opt')

  const bnNum103Search = searchCatalog(catalog, '১০৩')
  assert.equal(bnNum103Search.length, 1)
  assert.equal(bnNum103Search[0].id, 'keyboard-usb')

  // 3. Spacing, hyphens & compound words (mousepad, lancable, 32gb)
  const mousepadSearch = searchCatalog(catalog, 'mousepad')
  assert.ok(mousepadSearch.length >= 1)
  assert.equal(mousepadSearch[0].id, 'mousepad')

  const lancableSearch = searchCatalog(catalog, 'lancable')
  assert.ok(lancableSearch.length >= 1)
  assert.equal(lancableSearch[0].id, 'cable-lan')

  const gb32Search = searchCatalog(catalog, '32gb')
  assert.equal(gb32Search.length, 1)
  assert.equal(gb32Search[0].id, 'pendrive-32gb')

  // 4. Word-order independent multi-token search
  const orderSearch1 = searchCatalog(catalog, 'opt mouse')
  assert.equal(orderSearch1[0].id, 'mouse-opt')

  const orderSearch2 = searchCatalog(catalog, 'mouse opt')
  assert.equal(orderSearch2[0].id, 'mouse-opt')

  const orderSearch3 = searchCatalog(catalog, 'gaming keyboard')
  assert.equal(orderSearch3[0].groupId, 'keyboard')

  // 5. Product names no longer have Bengali translations; details remain searchable
  const bnMouseSearch = searchCatalog(catalog, 'মাউস')
  assert.equal(bnMouseSearch.length, 0)

  const bnKeyboardSearch = searchCatalog(catalog, 'কিবোর্ড')
  assert.equal(bnKeyboardSearch.length, 0)

  const serviceSearch = searchCatalog(catalog, 'service')
  assert.ok(serviceSearch.length >= 3)

  // 6. Completely unrelated string returns empty array
  assert.equal(searchCatalog(catalog, 'xyz987completelynonexistent').length, 0)
})

test('purchase records keep exact line totals and reject empty records', () => {
  const purchase = makePurchase([{ productId: 'mouse-opt', quantity: 2000, unitCost: 250, total: 500 }], { supplier: 'Rangs Electronics', note: 'Weekly restock' })
  assert.equal(purchase.total, 500)
  assert.equal(purchase.lines[0].total, 500)
  assert.equal(purchase.lines[0].unitCost, 250)
  assert.equal(purchase.supplier, 'Rangs Electronics')
  assert.equal(purchase.note, 'Weekly restock')
  assert.ok(purchase.id)
  assert.ok(purchase.createdAt)
  assert.throws(() => makePurchase([]), /empty/)

  const multi = makePurchase([
    { productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 },
    { productId: 'ssd-128gb', quantity: 2000, unitCost: 1180, total: 2360 },
  ])
  assert.equal(multi.total, 2600)
  assert.equal(multi.supplier, undefined)
})

test('expenses validate amounts and keep their category and method', () => {
  const expense = makeExpense({ category: 'utility', amount: 1200, method: 'mobile', note: 'Electricity bill' })
  assert.equal(expense.amount, 1200)
  assert.equal(expense.category, 'utility')
  assert.equal(expense.method, 'mobile')
  assert.equal(expense.note, 'Electricity bill')
  assert.ok(expense.id)
  assert.throws(() => makeExpense({ category: 'rent', amount: 0, method: 'cash' }), /amount/)
  assert.throws(() => makeExpense({ category: 'rent', amount: -500, method: 'cash' }), /amount/)
  assert.throws(() => makeExpense({ category: 'rent', amount: 10.5, method: 'cash' }), /amount/)
})

test('window filtering applies to purchases and expenses with Dhaka boundaries', () => {
  const now = new Date('2026-10-09T18:30:00.000Z') // October 10 in Dhaka
  const expenseToday = { ...makeExpense({ category: 'other', amount: 50, method: 'cash' }), createdAt: '2026-10-10T10:00:00.000Z' }
  const expenseYesterday = { ...makeExpense({ category: 'other', amount: 50, method: 'cash' }), createdAt: '2026-10-09T10:00:00.000Z' }
  const purchaseToday = { ...makePurchase([{ productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 }]), createdAt: '2026-10-10T12:00:00.000Z' }
  const purchaseLastMonth = { ...makePurchase([{ productId: 'mouse-opt', quantity: 1000, unitCost: 240, total: 240 }]), createdAt: '2026-09-20T12:00:00.000Z' }

  assert.deepEqual(filterByWindow([expenseToday, expenseYesterday], 'today', now), [expenseToday])
  assert.deepEqual(filterByWindow([expenseToday, expenseYesterday], { mode: 'day', date: '2026-10-10' }, now), [expenseToday])
  assert.deepEqual(filterByWindow([expenseToday, expenseYesterday], { mode: 'day', date: '2026-10-09' }, now), [expenseYesterday])
  assert.deepEqual(filterByWindow([expenseToday, expenseYesterday], { mode: 'month', month: '2026-10' }, now), [expenseToday, expenseYesterday])
  assert.deepEqual(filterByWindow([expenseToday, expenseYesterday], { mode: 'range', from: '2026-10-10', to: '2026-10-10' }, now), [expenseToday])
  assert.deepEqual(filterByWindow([purchaseToday, purchaseLastMonth], 'today', now), [purchaseToday])
  assert.deepEqual(filterByWindow([purchaseToday, purchaseLastMonth], 'month', now), [purchaseToday])

  assert.equal(moveDate('2026-10-10', 1), '2026-10-11')
  assert.equal(moveDate('2026-10-10', -1), '2026-10-09')
  assert.equal(moveMonth('2026-10', 1), '2026-11')
  assert.equal(moveMonth('2026-10', -1), '2026-09')
})

test('stock reflects adjustments and restocked returns on top of sales', () => {
  const receipt = makeReceipt(initialState, 1000, 'cash')
  const adjustment = makeStockAdjustment({ productId: 'mouse-opt', quantity: -2000, reason: 'damage' })
  const restocked = makeReturn(receipt, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true })
  const notRestocked = makeReturn(receipt, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: false })
  const mouse = findProduct('mouse-opt')
  assert.equal(stockFor(mouse, [receipt]), 44000)
  assert.equal(stockFor(mouse, [receipt], [adjustment]), 42000)
  assert.equal(stockFor(mouse, [receipt], [adjustment], [restocked]), 43000)
  assert.equal(stockFor(mouse, [receipt], [adjustment], [notRestocked]), 42000)
})

test('returns follow the original bill discount and cap at what is left', () => {
  const receipt = makeReceipt({ ...initialState, discount: 90, customerId: 'c1' }, 810, 'cash')
  const partial = makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true })
  assert.equal(partial.lines[0].amount, 495)
  assert.equal(partial.lines[0].cost, 380)
  assert.equal(partial.refunded, 495)
  assert.equal(partial.customerId, 'c1')
  assert.throws(() => makeReturn(receipt, [], { method: 'cash', restock: true }), /empty/)
  assert.throws(() => makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 2000 }], { method: 'cash', restock: true }), /quantity/)
  assert.throws(() => makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true, priorReturns: [partial] }), /quantity/)
  const overridden = makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'due', restock: true, refunded: 400 })
  assert.equal(overridden.refunded, 400)
  assert.equal(overridden.method, 'due')
  assert.equal(makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true, refunded: 0 }).refunded, 0)
  assert.throws(() => makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true, refunded: 500 }), /amount/)
})

test('exchange settles original due first and records replacement cash and due together', () => {
  const bill = makeReceipt({ ...initialState, customerId: 'c1' }, 400, 'cash')
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [{ productId: 'mouse-opt', quantity: 1000 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 500, received: 100, method: 'cash', issueCredit: false,
    reason: 'Wrong model', operator: 'Sam', now: new Date(bill.createdAt),
  })
  assert.deepEqual(entry.settlement, { dueReduced: 500, exchangeCredit: 50, payout: 0, creditIssued: 0, received: 100, newDue: 200, method: 'cash' })
  assert.equal(customerBalance(bill.customer!, [bill], [], [entry]).totalDue, 200)
  assert.equal(stockFor(findProduct('keyboard-usb'), [bill], [], [entry]), findProduct('keyboard-usb').stock)
  assert.equal(stockFor(findProduct('mouse-opt'), [bill], [], [entry]), findProduct('mouse-opt').stock - 2000)
  assert.throws(() => makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: false,
    reason: 'Late request', operator: 'Sam', now: new Date(Date.parse(bill.createdAt) + 31 * 86400000),
  }), /expired/)
})

test('customer credit from a refund can pay a later sale', () => {
  const bill = makeReceipt({ ...initialState, customerId: 'c1' }, 900, 'cash')
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'damaged' }], [], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: true,
    reason: 'Failed', operator: 'Sam', now: new Date(bill.createdAt),
  })
  assert.equal(entry.settlement?.creditIssued, 550)
  const state = { ...initialState, lines: [{ productId: 'mouse-opt', quantity: 1000 }], customerId: 'c1', receipts: [bill], returns: [entry] }
  const next = makeReceipt(state, 0, 'cash', 1, 350)
  assert.equal(next.creditApplied, 350)
  assert.equal(next.due, 0)
  const history = customerHistory('c1', [bill, next], [], [entry])
  const creditSale = history.find(tx => tx.receiptId === next.id && tx.type === 'sale')
  assert.ok(creditSale?.type === 'sale')
  assert.equal(creditSale.paid, next.total)
  assert.equal(creditSale.due, 0)
  assert.ok(history.some(tx => tx.id === `tx-return-credit-${entry.id}`))
  assert.ok(history.some(tx => tx.id === `tx-credit-use-${next.id}`))
  assert.equal(customerBalance(bill.customer!, [bill, next], [], [entry]).storeCredit, 200)
  assert.throws(() => makeReceipt(state, 0, 'cash', 1, 550), /amount/)
})

test('stock adjustments validate a signed nonzero quantity and keep the counted figure', () => {
  const counted = makeStockAdjustment({ productId: 'mouse-opt', quantity: -3000, reason: 'count', counted: 42000 })
  assert.equal(counted.quantity, -3000)
  assert.equal(counted.counted, 42000)
  assert.equal(counted.reason, 'count')
  assert.throws(() => makeStockAdjustment({ productId: 'mouse-opt', quantity: 0, reason: 'other' }), /quantity/)
  assert.throws(() => makeStockAdjustment({ productId: 'mouse-opt', quantity: 1.5, reason: 'other' }), /quantity/)
  assert.throws(() => makeStockAdjustment({ productId: '', quantity: 1000, reason: 'other' }), /product/)
})

test('nextReceiptNumber partitions numbering by terminal and falls back for single-terminal', () => {
  assert.equal(nextReceiptNumber([], undefined), 1)
  assert.equal(nextReceiptNumber([], null), 1)
  assert.equal(nextReceiptNumber([{ number: 5 } as any], undefined), 6)

  // Terminal 1 range (100001..)
  assert.equal(nextReceiptNumber([], 1), 100001)
  assert.equal(nextReceiptNumber([{ number: 100001 } as any], 1), 100002)
  assert.equal(nextReceiptNumber([{ number: 100009 } as any], 1), 100010)

  // Terminal 2 range (200001..)
  assert.equal(nextReceiptNumber([], 2), 200001)
  assert.equal(nextReceiptNumber([{ number: 200003 } as any], 2), 200004)

  // Mixed terminals do not collide
  const mixed = [{ number: 100005 } as any, { number: 200002 } as any, { number: 3 } as any]
  assert.equal(nextReceiptNumber(mixed, 1), 100006)
  assert.equal(nextReceiptNumber(mixed, 2), 200003)
  assert.equal(nextReceiptNumber(mixed, 3), 300001)
  assert.equal(nextReceiptNumber([], 999), 99900001)

  // makeReceipt with terminalId on state
  const receiptT1 = makeReceipt({ ...initialState, terminalId: 1 }, 1000, 'cash')
  assert.equal(receiptT1.number, 100001)
  const receiptT2 = makeReceipt({ ...initialState, terminalId: 2, receipts: [receiptT1] }, 1000, 'cash')
  assert.equal(receiptT2.number, 200001)
})

test('searchCustomers algorithm references both Name and Number with intelligent ranking', () => {
  const testCustomers: Customer[] = [
    { id: 'c1', en: 'Nadia Rahman', bn: 'নাদিয়া রহমান', phone: '01700000101' },
    { id: 'c2', en: 'Karim Ahmed', bn: 'করিম আহমেদ', phone: '01700000102' },
    { id: 'c3', en: 'Shila Begum', bn: 'শীলা বেগম', phone: '01700000103' },
    { id: 'c4', en: 'Nadia Islam', bn: 'নাদিয়া ইসলাম', phone: '01800000999' },
  ]

  // 1. Empty or whitespace query returns full list intact
  assert.deepEqual(searchCustomers(testCustomers, ''), testCustomers)
  assert.deepEqual(searchCustomers(testCustomers, '   '), testCustomers)

  // 2. Name searching (English and Bengali, case-insensitive, prefix)
  const nadiaSearch = searchCustomers(testCustomers, 'nadia')
  assert.equal(nadiaSearch.length, 2)
  assert.ok(nadiaSearch.some(c => c.id === 'c1'))
  assert.ok(nadiaSearch.some(c => c.id === 'c4'))

  const karimSearch = searchCustomers(testCustomers, 'Karim')
  assert.equal(karimSearch.length, 1)
  assert.equal(karimSearch[0].id, 'c2')

  const bnNameSearch = searchCustomers(testCustomers, 'নাদিয়া')
  assert.equal(bnNameSearch.length, 2)

  const bnSurnameSearch = searchCustomers(testCustomers, 'আহমেদ')
  assert.equal(bnSurnameSearch.length, 1)
  assert.equal(bnSurnameSearch[0].id, 'c2')

  // 3. Number searching (Full phone, prefix, suffix, substring)
  const fullPhoneSearch = searchCustomers(testCustomers, '01700000101')
  assert.equal(fullPhoneSearch.length, 1)
  assert.equal(fullPhoneSearch[0].id, 'c1')

  const prefixSearch = searchCustomers(testCustomers, '017')
  assert.equal(prefixSearch.length, 3) // c1, c2, c3

  const suffixSearch = searchCustomers(testCustomers, '102')
  assert.equal(suffixSearch.length, 1)
  assert.equal(suffixSearch[0].id, 'c2')

  // Suffix priority test: customer ending with digits ranks above customer with digits in middle
  const extraCustomers: Customer[] = [
    { id: 'mid', en: 'Middle Match', bn: 'মাঝের মিল', phone: '01710299999' },
    { id: 'end', en: 'Suffix Match', bn: 'শেষের মিল', phone: '01899999102' },
  ]
  const suffixPriority = searchCustomers(extraCustomers, '102')
  assert.equal(suffixPriority[0].id, 'end')

  const formattedPhone = searchCustomers(testCustomers, '+8801700000101')
  assert.equal(formattedPhone.length, 1)
  assert.equal(formattedPhone[0].id, 'c1')

  const dashedPhone = searchCustomers(testCustomers, '01700-000101')
  assert.equal(dashedPhone.length, 1)
  assert.equal(dashedPhone[0].id, 'c1')

  // 4. Bengali digits search (১০১ -> 101, ০১৭ -> 017)
  const bnPhoneSuffix = searchCustomers(testCustomers, '১০১')
  assert.equal(bnPhoneSuffix.length, 1)
  assert.equal(bnPhoneSuffix[0].id, 'c1')

  const bnPhoneFull = searchCustomers(testCustomers, '০১৭০০০০০১০১')
  assert.equal(bnPhoneFull.length, 1)
  assert.equal(bnPhoneFull[0].id, 'c1')

  // 5. Query referencing BOTH Name and Number together
  // "Nadia 101": matches Nadia Rahman (ends in 101), NOT Nadia Islam (ends in 999)
  const bothNameNumber = searchCustomers(testCustomers, 'Nadia 101')
  assert.ok(bothNameNumber.length >= 1)
  assert.equal(bothNameNumber[0].id, 'c1')
  // Customer matching both Name and Number must score substantially higher than one matching only Name
  assert.ok(scoreCustomerMatch(testCustomers[0], 'Nadia 101') > scoreCustomerMatch(testCustomers[3], 'Nadia 101'))

  // Order independent: "101 Nadia"
  const orderIndependent = searchCustomers(testCustomers, '101 Nadia')
  assert.equal(orderIndependent[0].id, 'c1')

  // Prefix number + Name: "017 Nadia"
  const prefixAndName = searchCustomers(testCustomers, '017 Nadia')
  assert.equal(prefixAndName[0].id, 'c1')

  // Bengali name + Bengali numerals: "নাদিয়া ১০১"
  const bnBoth = searchCustomers(testCustomers, 'নাদিয়া ১০১')
  assert.equal(bnBoth[0].id, 'c1')

  // Combined alphanumeric without spaces: "Nadia101"
  const combinedAlphaNum = searchCustomers(testCustomers, 'Nadia101')
  assert.equal(combinedAlphaNum[0].id, 'c1')

  // Karim Ahmed with his number: "Karim 102"
  const karimWithNumber = searchCustomers(testCustomers, 'Karim 102')
  assert.equal(karimWithNumber[0].id, 'c2')

  // 6. Customer ID matching ("c1", "c2")
  const idSearch = searchCustomers(testCustomers, 'c1')
  assert.equal(idSearch[0].id, 'c1')

  // 7. Non-matching queries return empty array
  assert.equal(searchCustomers(testCustomers, 'xyz999nonexistent').length, 0)
})

test('return settlement separates value from payout and defaults to collecting the exchange difference', () => {
  const bill = makeReceipt({ ...initialState, customerId: null }, 900, 'cash')
  const meta = { priorReturns: [], customerDue: 0, method: 'cash' as const, issueCredit: false }
  assert.deepEqual(calculateReturnSettlement(bill, 550, 0, meta), {
    dueReduced: 0, exchangeCredit: 0, payout: 550, creditIssued: 0, received: 0, newDue: 0, method: 'cash',
  })
  const expected = { dueReduced: 0, exchangeCredit: 550, payout: 0, creditIssued: 0, received: 150, newDue: 0, method: 'cash' }
  assert.deepEqual(calculateReturnSettlement(bill, 550, 700, meta), expected)
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [{ productId: 'mouse-opt', quantity: 2000 }], {
    ...meta, catalog: allProducts(initialState.customProducts), reason: 'Wrong model', operator: 'Sam', now: new Date(bill.createdAt),
  })
  assert.deepEqual(entry.settlement, expected)
  assert.throws(() => calculateReturnSettlement(bill, 550, 700, { ...meta, received: 0 }), /customer/)
  assert.throws(() => calculateReturnSettlement(bill, 550, 700, { ...meta, received: 151 }), /amount/)
})

test('settlement respects prior due reductions, account payments, and explicit partial collection', () => {
  const bill = makeReceipt({ ...initialState, customerId: 'c1' }, 400, 'cash')
  const meta = { priorReturns: [], customerDue: 500, method: 'bank' as const, issueCredit: false }
  const first = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [], {
    ...meta, catalog: allProducts(initialState.customProducts), reason: 'Wrong model', operator: 'Sam', now: new Date(bill.createdAt),
  })
  assert.equal(first.settlement?.dueReduced, 500)
  assert.equal(first.settlement?.payout, 50)
  const settled = calculateReturnSettlement(bill, 350, 500, { ...meta, customerDue: 0, priorReturns: [first], received: 50 })
  assert.equal(settled.dueReduced, 0)
  assert.equal(settled.newDue, 100)
  const credited = calculateReturnSettlement(bill, 550, 0, { ...meta, customerDue: 100, issueCredit: true })
  assert.equal(credited.dueReduced, 100)
  assert.equal(credited.creditIssued, 450)
  assert.equal(credited.payout, 0)
  for (const received of [-1, 0.5, NaN, 151]) {
    assert.throws(() => calculateReturnSettlement(bill, 550, 200, { ...meta, customerDue: 0, received }), /amount/)
  }
})


test('restocking uses remaining stock for cost while preserving the sales baseline and item details', () => {
  const product: Product = { ...findProduct('mouse-opt'), cost: 200, stock: 10000, purchased: 10000,
    inventoryValue: 2000, valuationStatus: 'verified', groupId: 'mouse-group', variantName: 'Black', warranty: '1 year', archived: true }
  const receipt = makeReceipt({ ...initialState, customProducts: [product], lines: [{ productId: product.id, quantity: 7000 }] }, product.price * 7, 'cash')
  const before = stockFor(product, [receipt])
  assert.equal(before, 3000)
  const { product: restocked, purchase } = makeStockPurchase({ ...product, inventoryValue: 600 }, before, {
    productId: product.id, quantity: 2000, total: 600, price: 350, supplier: '  Supplier A  ',
  })
  assert.equal(restocked.stock, 12000)
  assert.equal(stockFor(restocked, [receipt]), 5000)
  assert.equal(restocked.purchased, 12000)
  assert.equal(restocked.cost, 240)
  assert.equal(restocked.price, 350)
  assert.equal(restocked.groupId, product.groupId)
  assert.equal(restocked.variantName, 'Black')
  assert.equal(restocked.warranty, '1 year')
  assert.equal(restocked.archived, true)
  assert.equal(product.stock, 10000)
  assert.equal(receipt.lines[0].product.cost, 200)
  assert.equal(purchase.total, 600)
  assert.equal(purchase.supplier, 'Supplier A')
  assert.deepEqual(purchase.lines, [{ productId: product.id, quantity: 2000, unitCost: 300, total: 600 }])
})

test('restocking blends exact paid totals without first rounding their unit cost', () => {
  const product: Product = { ...findProduct('mouse-opt'), stock: 1000, cost: 100, inventoryValue: 100, valuationStatus: 'verified', purchased: undefined }
  const result = makeStockPurchase(product, 1000, { productId: product.id, quantity: 3000, total: 1001, price: product.price, supplier: '' })
  assert.equal(result.purchase.total, 1001)
  assert.equal(result.purchase.lines[0].unitCost, 334)
  assert.equal(result.product.cost, 275)
  assert.equal(result.product.inventoryValue, 1101)
  assert.equal(result.product.purchased, 4000)
  assert.equal(result.purchase.supplier, undefined)
})

test('restocking rejects services, mismatched items, fractional pieces and invalid amounts', () => {
  const product = findProduct('mouse-opt')
  const input = { productId: product.id, quantity: 1000, total: 250, price: product.price, supplier: '' }
  assert.throws(() => makeStockPurchase(findProduct('service-pc-clean'), 0, input), /product/)
  assert.throws(() => makeStockPurchase(product, 0, { ...input, productId: 'other' }), /product/)
  for (const quantity of [0, -1000, 1500, 10000001, NaN]) {
    assert.throws(() => makeStockPurchase(product, 0, { ...input, quantity }), /quantity/)
  }
  for (const total of [0, -1, 250.5, 100000001, NaN]) {
    assert.throws(() => makeStockPurchase(product, 0, { ...input, total }), /amount/)
  }
  assert.throws(() => makeStockPurchase(product, 0, { ...input, price: 0 }), /amount/)
})

test('proportional money and discount allocation use exact integer intermediates', () => {
  assert.equal(proportionalAmount(1, 1, 2), 1)
  assert.equal(proportionalAmount(1101, 1000, 4000), 275)
  assert.equal(proportionalAmount(9007199254740991, 999999999, 1000000000), 9007199245733792)
  assert.deepEqual(allocateDiscount([4503599627370495, 4503599627370496], 3), [1, 2])
  assert.throws(() => proportionalAmount(10, 1, 0), /amount/)
  assert.throws(() => proportionalAmount(10, -1, 3), /amount/)
})

test('partial returns conserve the original revenue and extended cost through the final remainder', () => {
  const product: Product = { ...findProduct('mouse-opt'), stock: 3000, cost: 334, inventoryValue: 1001, valuationStatus: 'verified' }
  const receipt = makeReceipt({ ...initialState, customProducts: [product], lines: [{ productId: product.id, quantity: 3000 }], discount: 1 }, 1049, 'cash')
  assert.equal(receipt.lines[0].costAmount, 1001)
  assert.equal(receiptProfit(receipt), 48)
  const returns: Return[] = []
  for (let index = 0; index < 3; index++) returns.push(makeReturn(receipt, [{ productId: product.id, quantity: 1000 }], { method: 'cash', restock: true, priorReturns: returns }))
  assert.deepEqual(returns.map(entry => entry.refunded), [350, 350, 349])
  assert.deepEqual(returns.map(entry => entry.lines[0].cost), [334, 334, 333])
  assert.equal(returns.reduce((sum, entry) => sum + entry.refunded, 0), receipt.total)
  assert.equal(returns.reduce((sum, entry) => sum + entry.lines[0].cost, 0), receiptLineCost(receipt.lines[0]))
  assert.equal(stockFor(product, [receipt], [], returns), product.stock)
  const lowered = makeReturn(receipt, [{ productId: product.id, quantity: 1000 }], { method: 'cash', restock: true, refunded: 100 })
  const final = makeReturn(receipt, [{ productId: product.id, quantity: 2000 }], { method: 'cash', restock: true, priorReturns: [lowered] })
  assert.equal(final.refunded, 699)
  assert.equal(lowered.refunded + final.refunded, 799)
})

test('a zero-value final returned unit remains returnable and duplicate requests cannot exceed quantity', () => {
  const product: Product = { ...findProduct('mouse-opt'), price: 1, stock: 3000, cost: 0, inventoryValue: 0, valuationStatus: 'verified' }
  const receipt = makeReceipt({ ...initialState, customProducts: [product], lines: [{ productId: product.id, quantity: 3000 }], discount: 1 }, 2, 'cash')
  const first = makeReturn(receipt, [{ productId: product.id, quantity: 1000 }], { method: 'cash', restock: true })
  const second = makeReturn(receipt, [{ productId: product.id, quantity: 1000 }], { method: 'cash', restock: true, priorReturns: [first] })
  const third = makeReturn(receipt, [{ productId: product.id, quantity: 1000 }], { method: 'cash', restock: true, priorReturns: [first, second] })
  assert.deepEqual([first.refunded, second.refunded, third.refunded], [1, 1, 0])
  assert.equal(stockFor(product, [receipt], [], [first, second, third]), 3000)
  assert.throws(() => makeReturn(receipt, [{ productId: product.id, quantity: 2000 }, { productId: product.id, quantity: 2000 }], { method: 'cash', restock: true }), /quantity/)
})

test('inventory movements preserve book value for purchases, sales, returns, and voids', () => {
  const product: Product = { ...findProduct('mouse-opt'), stock: 10000, cost: 100, inventoryValue: 1000, valuationStatus: 'verified' }
  const bought = makeStockPurchase(product, 10000, { productId: product.id, quantity: 10000, total: 3000, price: 350, supplier: '' }).product
  assert.equal(bought.inventoryValue, 4000)
  const voided = applyInventoryMovement(bought, 20000, -10000, -3000)
  assert.equal(voided.inventoryValue, 1000)
  assert.equal(voided.cost, 100)
  const soldCost = inventoryCostAmount(bought, 20000, 10000)
  const afterSale = applyInventoryMovement(bought, 20000, -10000, -soldCost)
  assert.equal(afterSale.inventoryValue, 2000)
  const afterReturn = applyInventoryMovement(afterSale, 10000, 10000, soldCost)
  assert.equal(afterReturn.inventoryValue, 4000)
  assert.equal(afterReturn.cost, 200)
  const emptied = applyInventoryMovement(afterReturn, 20000, -20000, -inventoryCostAmount(afterReturn, 20000, 20000))
  assert.equal(emptied.inventoryValue, 0)
  assert.throws(() => applyInventoryMovement(product, 10000, -11000, -1000), /stock/)
  assert.throws(() => applyInventoryMovement(product, 10000, -10000, -900), /valuation/)
})

test('sale snapshots store actual aggregate COGS and preserve explicitly unknown service costs', () => {
  const product: Product = { ...findProduct('mouse-opt'), stock: 4000, cost: 275, inventoryValue: 1101, valuationStatus: 'provided' }
  const receipt = makeReceipt({ ...initialState, customProducts: [product], lines: [{ productId: product.id, quantity: 2000 }] }, 700, 'cash')
  assert.equal(receipt.lines[0].costAmount, 551)
  assert.equal(receipt.lines[0].costStatus, 'recorded')
  assert.equal(receipt.lines[0].product.inventoryValue, 1101)
  assert.equal(receiptProfit(receipt), 149)
  assert.equal(receipt.currencyVersion, 2)
  const unknown = makeReceipt({ ...initialState, lines: [{ productId: 'service-pc-clean', quantity: 1000 }] }, 400, 'cash')
  assert.equal(unknown.lines[0].costStatus, 'unassigned')
  assert.equal(costStatusOf({ ...findProduct('service-pc-clean'), cost: 0 }), 'recorded')
  assert.equal(costStatusOf({ ...product, cost: undefined, inventoryValue: undefined, valuationStatus: undefined }), 'estimated')
  assert.equal(inventoryValuationReady({ ...product, valuationStatus: 'unverified' }), false)
  assert.throws(() => makeStockPurchase({ ...product, inventoryValue: undefined, valuationStatus: undefined }, 4000,
    { productId: product.id, quantity: 1000, total: 300, price: 350, supplier: '' }), /valuation/)
})

test('exchanges price replacement costs after restoring the returned original book value', () => {
  const originalProduct: Product = { ...findProduct('mouse-opt'), stock: 10000, cost: 100, inventoryValue: 1000, valuationStatus: 'verified' }
  const original = makeReceipt({ ...initialState, customProducts: [originalProduct], lines: [{ productId: originalProduct.id, quantity: 10000 }] }, 3500, 'cash')
  const newStock = makeStockPurchase({ ...originalProduct, inventoryValue: 0 }, 0,
    { productId: originalProduct.id, quantity: 10000, total: 3000, price: 350, supplier: '' }).product
  const entry = makeReturnExchange(original, [{ productId: originalProduct.id, quantity: 10000, condition: 'sellable' }], [{ productId: originalProduct.id, quantity: 1000 }], {
    catalog: [newStock], receipts: [original], priorReturns: [], customerDue: 0, method: 'cash', issueCredit: false,
    reason: 'Replace one', operator: 'Sam', now: new Date(original.createdAt),
  })
  assert.equal(entry.lines[0].cost, 1000)
  assert.equal(entry.replacementLines![0].cost, 200)
  assert.equal(entry.replacementLines![0].costStatus, 'recorded')
})

test('customer payments settle oldest debts rather than assign remaining debt to oldest bills', () => {
  const oldest = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'old', createdAt: '2026-10-01T10:00:00Z' }
  const newest = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'new', createdAt: '2026-10-02T10:00:00Z' }
  const payment: AccountTransaction = { id: 'payment', customerId: 'c1', type: 'payment', amount: 900, createdAt: '2026-10-03T10:00:00Z' }
  assert.equal(customerBalance(oldest.customer!, [newest, oldest], [payment]).totalDue, 900)
  assert.equal(receiptOutstandingDue(oldest, [newest, oldest], [payment]), 0)
  assert.equal(receiptOutstandingDue(newest, [newest, oldest], [payment]), 900)
  const customer = { ...oldest.customer!, openingBalance: 200 }
  const adjustment: AccountTransaction = { id: 'adjustment', customerId: 'c1', type: 'credit_adjust', amount: 500, createdAt: '2026-10-02T09:00:00Z' }
  const allocation = allocateCustomerAccount(customer, [newest, oldest], [adjustment, { ...payment, amount: 500 }])
  assert.equal(allocation.totalDue, 2000)
  assert.equal(allocation.receiptDues.get(oldest.id), 600)
  assert.equal(allocation.receiptDues.get(newest.id), 900)
})

test('linked returns reduce their own bill, and a paid bill refund leaves other debt intact', () => {
  const oldest = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'old', createdAt: '2026-10-01T10:00:00Z' }
  const newest = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'new', createdAt: '2026-10-02T10:00:00Z' }
  const payment: AccountTransaction = { id: 'payment', customerId: 'c1', type: 'payment', amount: 900, createdAt: '2026-10-03T10:00:00Z' }
  const meta = { catalog: allProducts(initialState.customProducts), receipts: [oldest, newest], priorReturns: [], customerDue: 900, method: 'cash' as const, issueCredit: false,
    reason: 'Wrong model', operator: 'Sam', now: new Date('2026-10-04T10:00:00Z') }
  const paidReturn = makeReturnExchange(oldest, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [], { ...meta, receiptDue: 0 })
  assert.equal(paidReturn.settlement!.dueReduced, 0)
  assert.equal(paidReturn.settlement!.payout, 550)
  assert.equal(customerBalance(oldest.customer!, [oldest, newest], [payment], [paidReturn]).totalDue, 900)
  const linked = makeReturnExchange(newest, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [], { ...meta, receiptDue: 900 })
  assert.equal(receiptOutstandingDue(oldest, [oldest, newest], [payment], [linked]), 0)
  assert.equal(receiptOutstandingDue(newest, [oldest, newest], [payment], [linked]), 350)
  const legacy = makeReturn(newest, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'due', restock: true })
  legacy.createdAt = '2026-10-04T10:00:00Z'
  assert.equal(receiptOutstandingDue(newest, [oldest, newest], [payment], [legacy]), 350)
  assert.equal(customerLedger('c1', [oldest, newest], [payment], [legacy]).at(-1)!.amount, -550)
})

test('signed balance corrections and linked payments preserve excess credit', () => {
  const first = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'a', createdAt: '2026-10-01T10:00:00Z' }
  const second = { ...makeReceipt({ ...initialState, customerId: 'c1' }, 0, 'cash'), id: 'b', createdAt: '2026-10-02T10:00:00Z' }
  const correction: AccountTransaction = { id: 'correction', customerId: 'c1', type: 'credit_adjust', amount: -100, createdAt: '2026-10-03T10:00:00Z' }
  const targeted: AccountTransaction = { id: 'targeted', customerId: 'c1', type: 'payment', receiptId: second.id, amount: 900, createdAt: '2026-10-04T10:00:00Z' }
  assert.equal(receiptOutstandingDue(first, [first, second], [correction, targeted]), 800)
  assert.equal(receiptOutstandingDue(second, [first, second], [correction, targeted]), 0)
  const overpaid = { ...targeted, id: 'extra', amount: 1000, createdAt: '2026-10-05T10:00:00Z' }
  assert.equal(customerBalance(first.customer!, [first, second], [correction, targeted, overpaid]).storeCredit, 200)
  const counted = makeStockAdjustment({ productId: 'mouse-opt', quantity: -1000, counted: 0, costAmount: -240, reason: 'count' })
  assert.equal(counted.counted, 0)
  assert.equal(counted.costAmount, -240)
  assert.throws(() => makeStockAdjustment({ productId: 'mouse-opt', quantity: -1000, costAmount: 240, reason: 'count' }), /amount/)
})

test('bidirectional unit cost and total calculation computes accurately with integer and decimal values', () => {
  // computeTotalFromUnitCost
  assert.equal(computeTotalFromUnitCost('10', 'pc', '250'), '2500')
  assert.equal(computeTotalFromUnitCost('4', 'pc', '12.5'), '50')
  assert.equal(computeTotalFromUnitCost('2.5', 'kg', '100'), '250')
  assert.equal(computeTotalFromUnitCost('3', 'pc', '33.33'), '100')
  // Edge cases for computeTotalFromUnitCost
  assert.equal(computeTotalFromUnitCost('', 'pc', '250'), null)
  assert.equal(computeTotalFromUnitCost('0', 'pc', '250'), null)
  assert.equal(computeTotalFromUnitCost('-5', 'pc', '250'), null)
  assert.equal(computeTotalFromUnitCost('10', 'pc', ''), null)
  assert.equal(computeTotalFromUnitCost('10', 'pc', '-10'), null)
  assert.equal(computeTotalFromUnitCost('10', 'pc', 'abc'), null)
  assert.equal(computeTotalFromUnitCost('2.5', 'pc', '100'), null)

  // computeUnitCostFromTotal
  assert.equal(computeUnitCostFromTotal('10', 'pc', '2500'), '250')
  assert.equal(computeUnitCostFromTotal('10', 'pc', '3000'), '300')
  assert.equal(computeUnitCostFromTotal('3', 'pc', '100'), '33.33')
  assert.equal(computeUnitCostFromTotal('2.5', 'kg', '250'), '100')
  assert.equal(computeUnitCostFromTotal('4', 'pc', '50'), '12.5')
  assert.equal(computeUnitCostFromTotal('0.007', 'kg', '7'), '1000')
  assert.equal(computeUnitCostFromTotal('0.003', 'kg', '1'), '333.33')
  // Edge cases for computeUnitCostFromTotal
  assert.equal(computeUnitCostFromTotal('', 'pc', '500'), null)
  assert.equal(computeUnitCostFromTotal('0', 'pc', '500'), null)
  assert.equal(computeUnitCostFromTotal('10', 'pc', ''), null)
  assert.equal(computeUnitCostFromTotal('10', 'pc', '-50'), null)
  assert.equal(computeUnitCostFromTotal('10', 'pc', 'abc'), null)
  assert.equal(computeUnitCostFromTotal('2.5', 'pc', '500'), null)
})

test('matchCatalogProduct matches catalog items by exact code, name, variant, or partial query', () => {
  const catalog: Product[] = [
    { ...findProduct('mouse-opt'), id: 'mouse-1', code: 'LOGI-M185', en: 'Logitech M185', unit: 'pc' },
    { ...findProduct('keyboard-usb'), id: 'kb-1', code: 'DELL-KB216', en: 'Dell Multimedia Keyboard', variantName: 'Black', unit: 'pc' },
    { ...findProduct('mouse-opt'), id: 'rice-1', code: 'RICE-MINIKET', en: 'Miniket Rice', detailBn: 'মিনিকেট চাল', unit: 'kg' },
    { ...findProduct('service-custom'), id: 'srv-1', code: 'SRV-1', en: 'Computer Cleaning Service', unit: 'BDT', kind: 'service' },
  ]

  // 1. Exact code
  assert.equal(matchCatalogProduct('LOGI-M185', 'pc', catalog)?.id, 'mouse-1')
  assert.equal(matchCatalogProduct('logi-m185', 'pc', catalog)?.id, 'mouse-1')

  // 2. Exact en name
  assert.equal(matchCatalogProduct('Logitech M185', 'pc', catalog)?.id, 'mouse-1')

  // 3. Exact name + variant
  assert.equal(matchCatalogProduct('Dell Multimedia Keyboard Black', 'pc', catalog)?.id, 'kb-1')

  // 4. Description containing product name
  assert.equal(matchCatalogProduct('Logitech M185 Wireless Mouse 2.4GHz', 'pc', catalog)?.id, 'mouse-1')

  // 5. Description containing product code
  assert.equal(matchCatalogProduct('Supplier box: DELL-KB216 bulk pack', 'pc', catalog)?.id, 'kb-1')

  // 6. Reverse substring (catalog name contains description)
  assert.equal(matchCatalogProduct('Multimedia Keyboard', 'pc', catalog)?.id, 'kb-1')

  // 7. Bengali detail match
  assert.equal(matchCatalogProduct('মিনিকেট চাল', 'kg', catalog)?.id, 'rice-1')

  // Incompatible unit should not match
  assert.equal(matchCatalogProduct('Logitech M185', 'kg', catalog), undefined)
  assert.equal(matchCatalogProduct('Miniket Rice', 'pc', catalog), undefined)

  // Service products should never match
  assert.equal(matchCatalogProduct('Computer Cleaning Service', 'BDT', catalog), undefined)

  // Empty or non-matching text
  assert.equal(matchCatalogProduct('', 'pc', catalog), undefined)
  assert.equal(matchCatalogProduct('Unmatched exotic item XYZ999', 'pc', catalog), undefined)
})

test('filterPurchases filters by status (all, awaitingStock, partReceived, due) and search queries', () => {
  const sup1: Supplier = { id: 'sup-1', name: 'Global Tech Distribution' }
  const sup2: Supplier = { id: 'sup-2', name: 'Dhaka Hardware Trade' }

  const p1 = makeInvoice(
    [{ id: 'line-1', description: 'Wireless Optical Mouse', unit: 'pc', quantity: 10000, total: 2500 }],
    { supplierId: sup1.id, supplier: sup1.name, paid: 2500, method: 'cash', invoiceNumber: 'INV-101' }
  )

  const p2 = makeInvoice(
    [{ id: 'line-2', description: 'USB Mechanical Keyboard', unit: 'pc', quantity: 5000, total: 3000 }],
    { supplierId: sup2.id, supplier: sup2.name, paid: 1000, method: 'cash', invoiceNumber: 'INV-102', note: 'Balance due next week' }
  )

  const p3 = makeInvoice(
    [{ id: 'line-3', description: 'Cat6 Network Cable 305m', unit: 'pc', quantity: 2000, total: 4000 }],
    { supplierId: sup1.id, supplier: sup1.name, paid: 4000, method: 'cash', invoiceNumber: 'INV-103' }
  )

  const receivingP3 = {
    id: 'rec-1',
    purchaseId: p3.id,
    createdAt: new Date().toISOString(),
    currencyVersion: 2 as const,
    lines: [{ invoiceLineId: 'line-3', productId: 'cable-1', quantity: 1000, total: 2000, unitCost: 2000 }]
  }

  const pVoided: Purchase = {
    ...makeInvoice(
      [{ id: 'line-v', description: 'Voided shipment', unit: 'pc', quantity: 1000, total: 500 }],
      { supplierId: sup1.id, paid: 0, method: 'cash' }
    ),
    voidedAt: new Date().toISOString(),
    voidReason: 'Defective batch'
  }

  const pIssue: Purchase = {
    ...makeInvoice(
      [{ id: 'line-iss', description: 'Unbalanced shipment', unit: 'pc', quantity: 1000, total: 500 }],
      { supplierId: sup1.id, paid: 500, method: 'cash' }
    ),
    accountingIssue: 'Legacy checksum mismatch'
  }

  const allPurchases = [p1, p2, p3, pVoided, pIssue]
  const receivings = [receivingP3]

  // Status: all
  const allResult = filterPurchases(allPurchases, receivings, [], [], { status: 'all' })
  assert.equal(allResult.length, 5)

  // Status: awaitingStock (excludes voided and accounting issues)
  const awaitingResult = filterPurchases(allPurchases, receivings, [], [], { status: 'awaitingStock' })
  assert.deepEqual(awaitingResult.map(p => p.id), [p1.id, p2.id])

  // Status: partReceived
  const partResult = filterPurchases(allPurchases, receivings, [], [], { status: 'partReceived' })
  assert.deepEqual(partResult.map(p => p.id), [p3.id])

  // Status: due
  const dueResult = filterPurchases(allPurchases, receivings, [], [], { status: 'due' })
  assert.deepEqual(dueResult.map(p => p.id), [p2.id])

  // Query search by invoice number
  const invSearch = filterPurchases(allPurchases, receivings, [], [], { query: 'INV-102' })
  assert.deepEqual(invSearch.map(p => p.id), [p2.id])

  // Query search by multi-token keywords
  const multiSearch = filterPurchases(allPurchases, receivings, [], [], { query: 'INV-102 Keyboard' })
  assert.deepEqual(multiSearch.map(p => p.id), [p2.id])

  // Query search by supplier name
  const supSearch = filterPurchases(allPurchases, receivings, [], [], { query: 'Hardware Trade', suppliers: [sup1, sup2] })
  assert.deepEqual(supSearch.map(p => p.id), [p2.id])

  // Query search for reviewed settlement supplier
  const pReviewed = makeInvoice(
    [{ id: 'line-rev', description: 'Settled invoice line', unit: 'pc', quantity: 1000, total: 1000 }],
    { paid: 1000, method: 'cash' }
  )
  const settlementReview = { id: 'set-1', purchaseId: pReviewed.id, supplierId: sup2.id, paid: 1000, method: 'cash' as const, createdAt: new Date().toISOString(), note: 'Linked in review' }
  const reviewSearch = filterPurchases([pReviewed], [], [], [settlementReview], { query: 'Hardware Trade', suppliers: [sup1, sup2] })
  assert.deepEqual(reviewSearch.map(p => p.id), [pReviewed.id])

  // Query search by invoice line description
  const descSearch = filterPurchases(allPurchases, receivings, [], [], { query: 'Mechanical Keyboard' })
  assert.deepEqual(descSearch.map(p => p.id), [p2.id])

  // Query search by note
  const noteSearch = filterPurchases(allPurchases, receivings, [], [], { query: 'Balance due' })
  assert.deepEqual(noteSearch.map(p => p.id), [p2.id])

  // Combined status and query filter
  const combined = filterPurchases(allPurchases, receivings, [], [], { status: 'awaitingStock', query: 'Global Tech', suppliers: [sup1, sup2] })
  assert.deepEqual(combined.map(p => p.id), [p1.id])
})

test('catalog reference prices are optional but supplied prices must be valid', () => {
  assert.equal(parseReferencePrice(''), 0)
  assert.equal(parseReferencePrice('  '), 0)
  assert.equal(parseReferencePrice('', 450), 450)
  assert.equal(parseReferencePrice('500'), 500)
  assert.throws(() => saleUnitPrice({ productId: 'unpriced', quantity: 1000 }, { price: 0 }), /amount/)
  for (const value of ['0', '-1', '1.5', 'NaN', '1e3', '100000001']) assert.equal(parseReferencePrice(value), null)
})

test('selling below buy cost is blocked, including discounts and hidden item losses', () => {
  const state = { ...initialState, discount: 0, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 240 }] }
  assert.equal(makeReceipt(state, 240, 'cash').total, 240)
  assert.throws(() => makeReceipt({ ...state, lines: [{ ...state.lines[0], unitPrice: 239 }] }, 240, 'cash'), /belowCost/)
  assert.throws(() => makeReceipt({ ...state, discount: 1 }, 240, 'cash'), /belowCost/)
  assert.equal(makeReceipt({ ...state, discount: 10, lines: [{ ...state.lines[0], unitPrice: 250 }] }, 240, 'cash').total, 240)
  assert.throws(() => makeReceipt({ ...state, discount: 10, lines: [...state.lines, { productId: 'keyboard-usb', quantity: 1000, unitPrice: 1000 }] }, 1240, 'cash'), /belowCost/)
  const product = { ...findProduct('mouse-opt'), stock: 3000, cost: 334, inventoryValue: 1003, valuationStatus: 'verified' as const }
  assert.throws(() => makeReceipt({ ...state, customProducts: [product], lines: [{ ...state.lines[0], quantity: 3000, unitPrice: 334 }] }, 1002, 'cash'), /belowCost/)
})

test('exchange replacement prices cannot be below buy cost', () => {
  const receipt = makeReceipt(initialState, 1000, 'cash')
  assert.throws(() => makeReturnExchange(receipt, [{ productId: 'mouse-opt', quantity: 1000, condition: 'sellable' }], [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 239 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, method: 'cash', issueCredit: false, reason: 'Exchange', operator: 'Cashier', now: new Date(receipt.createdAt),
  }), /belowCost/)
})


test('draft pricing rejects 549 against a current buying price of 550 before checkout', () => {
  const product = { ...findProduct('mouse-opt'), cost: 550, inventoryValue: 24750, valuationStatus: 'verified' as const }
  const draft = { ...initialState, discount: 0, receipts: [], customProducts: [product], lines: [{ productId: product.id, quantity: 1000, unitPrice: 549 }] }
  assert.throws(() => validateSalePricing(draft), /belowCost/)
  const atCost = validateSalePricing({ ...draft, lines: [{ ...draft.lines[0], unitPrice: 550 }] })
  assert.equal(atCost[0].costAmount, 550)
  assert.equal(atCost[0].gross, 550)
})

test('draft pricing rechecks refreshed costs even after an earlier price was accepted', () => {
  const product = { ...findProduct('mouse-opt'), cost: 500, inventoryValue: 22500, valuationStatus: 'verified' as const }
  const draft = { ...initialState, discount: 0, receipts: [], customProducts: [product], lines: [{ productId: product.id, quantity: 1000, unitPrice: 549 }] }
  assert.equal(validateSalePricing(draft)[0].costAmount, 500)
  assert.throws(() => validateSalePricing({ ...draft, customProducts: [{ ...product, cost: 550, inventoryValue: 24750 }] }), /belowCost/)
})

test('draft discounts cannot hide an item loss, and exact stock value is checked before payment', () => {
  const draft = { ...initialState, discount: 10, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 240 }, { productId: 'keyboard-usb', quantity: 1000, unitPrice: 1000 }] }
  assert.throws(() => validateSalePricing(draft), /belowCost/)
  const product = { ...findProduct('mouse-opt'), stock: 3000, cost: 334, inventoryValue: 1003, valuationStatus: 'verified' as const }
  assert.throws(() => validateSalePricing({ ...draft, discount: 0, receipts: [], customProducts: [product], lines: [{ productId: product.id, quantity: 3000, unitPrice: 334 }] }), /belowCost/)
  assert.equal(validateSalePricing({ ...draft, discount: 10, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 250 }] })[0].gross, 250)
})
