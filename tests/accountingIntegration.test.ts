import test from 'node:test'
import assert from 'node:assert/strict'
import { BackendError, loadWorkspace, saveWorkspace, type Workspace } from '../src/backend.ts'
import {
  allProducts, customerAccountingReady, customerBalance, inventoryValuationReady, makePurchase, makeReceipt,
  makeReturnExchange, makeStockPurchase, proportionalAmount, receiptLineCost, receiptOutstandingDue,
  stockFor, type AccountTransaction, type Product, type Return,
} from '../src/model.ts'
import { backendFixture } from './d1Support.ts'
import { findProduct } from './fixtures/catalog.ts'

function connect(t: any) {
  const fixture = backendFixture()
  t.mock.method(globalThis, 'fetch', fixture.fetch)
  t.after(() => fixture.db.close())
  return fixture
}

const currentProduct = (workspace: Workspace, id: string) => allProducts(workspace.state.customProducts).find(product => product.id === id)!
const currentQuantity = (workspace: Workspace, product: Product) => stockFor(product, workspace.state.receipts, workspace.state.adjustments, workspace.state.returns)
const time = (base: number, offset: number) => new Date(base + offset * 1000).toISOString()
const rejected = (error: unknown) => error instanceof BackendError && error.status === 422

async function provision(workspace: Workspace, id: string, quantity: number, total: number, createdAt: string, price = 350) {
  const product: Product = { ...findProduct('mouse-opt'), id, code: `TEST-${id}`, stock: quantity, purchased: quantity,
    price, cost: proportionalAmount(total, 1000, quantity), inventoryValue: undefined, valuationStatus: undefined }
  const purchase = { ...makePurchase([{ productId: id, quantity, unitCost: product.cost!, total }]), createdAt }
  return saveWorkspace({ ...workspace.state, customProducts: [...(workspace.state.customProducts ?? []), product],
    purchases: [...(workspace.state.purchases ?? []), purchase] }, workspace)
}

async function restock(workspace: Workspace, id: string, quantity: number, total: number, createdAt: string) {
  const product = currentProduct(workspace, id)
  const result = makeStockPurchase(product, currentQuantity(workspace, product), { productId: id, quantity, total, price: product.price, supplier: 'Test supplier' })
  result.purchase.createdAt = createdAt
  const saved = await saveWorkspace({ ...workspace.state,
    customProducts: [...(workspace.state.customProducts ?? []).filter(part => part.id !== id), result.product],
    purchases: [...(workspace.state.purchases ?? []), result.purchase] }, workspace)
  return { workspace: saved, purchaseId: result.purchase.id }
}

async function sell(workspace: Workspace, id: string, quantity: number, createdAt: string, options: { discount?: number; customerId?: string; tendered?: number } = {}) {
  const state = { ...workspace.state, lines: [{ productId: id, quantity }], discount: options.discount ?? 0, customerId: options.customerId ?? null }
  const total = proportionalAmount(currentProduct(workspace, id).price, quantity, 1000) - state.discount
  const receipt = { ...makeReceipt(state, options.tendered ?? total, 'cash', workspace.state.terminalId), createdAt }
  const saved = await saveWorkspace({ ...state, lines: [], discount: 0, customerId: null, receipts: [...state.receipts, receipt] }, workspace)
  return { workspace: saved, receiptId: receipt.id }
}

function returnEntry(workspace: Workspace, receiptId: string, productId: string, quantity: number, createdAt: string, replacements: { productId: string; quantity: number }[] = []): Return {
  const receipt = workspace.state.receipts.find(part => part.id === receiptId)!
  return makeReturnExchange(receipt, [{ productId, quantity, condition: 'sellable' }], replacements, {
    catalog: allProducts(workspace.state.customProducts), receipts: workspace.state.receipts, adjustments: workspace.state.adjustments,
    priorReturns: workspace.state.returns ?? [], customerDue: receipt.customer ? customerBalance(receipt.customer, workspace.state.receipts, workspace.state.transactions, workspace.state.returns).totalDue : 0,
    receiptDue: receiptOutstandingDue(receipt, workspace.state.receipts, workspace.state.transactions, workspace.state.returns),
    method: 'cash', issueCredit: false, reason: 'Accounting integration test', operator: 'Test operator', now: new Date(createdAt),
  })
}

test('backend blends exact purchase totals and does not accept forged inventory values', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'exact-purchase', 1000, 100, time(base, 0))
  workspace = (await restock(workspace, 'exact-purchase', 3000, 1001, time(base, 1))).workspace
  let product = currentProduct(workspace, 'exact-purchase')
  assert.equal(currentQuantity(workspace, product), 4000)
  assert.equal(product.inventoryValue, 1101)
  assert.equal(product.cost, 275)
  assert.equal(workspace.state.purchases!.at(-1)!.total, 1001)
  assert.equal(workspace.state.purchases!.at(-1)!.lines[0].unitCost, 334)
  const forged = { ...product, inventoryValue: 999999, cost: 9999 }
  try {
    workspace = await saveWorkspace({ ...workspace.state, customProducts: [...workspace.state.customProducts!.filter(part => part.id !== product.id), forged] }, workspace)
  } catch (error) { assert.ok(rejected(error)) }
  workspace = await loadWorkspace(2)
  product = currentProduct(workspace, 'exact-purchase')
  assert.equal(product.inventoryValue, 1101)
  assert.equal(product.cost, 275)
  const sale = await sell(workspace, product.id, 2000, time(base, 2))
  const line = sale.workspace.state.receipts.find(receipt => receipt.id === sale.receiptId)!.lines[0]
  assert.equal(receiptLineCost(line), 551)
  assert.equal(line.costStatus, 'recorded')
  assert.equal(currentProduct(sale.workspace, product.id).inventoryValue, 550)
})

test('an unconsumed purchase void restores both stock and its original book value', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'void-cost', 10000, 1000, time(base, 0))
  const added = await restock(workspace, 'void-cost', 10000, 3000, time(base, 1))
  workspace = added.workspace
  assert.equal(currentProduct(workspace, 'void-cost').cost, 200)
  workspace = await saveWorkspace({ ...workspace.state, purchases: workspace.state.purchases!.map(purchase => purchase.id === added.purchaseId
    ? { ...purchase, voidedAt: time(base, 2), voidReason: 'Wrong supplier batch' } : purchase) }, workspace)
  const reloaded = await loadWorkspace(2)
  const product = currentProduct(reloaded, 'void-cost')
  assert.equal(currentQuantity(reloaded, product), 10000)
  assert.equal(product.inventoryValue, 1000)
  assert.equal(product.cost, 100)
  assert.equal(reloaded.state.purchases!.find(purchase => purchase.id === added.purchaseId)!.voidReason, 'Wrong supplier batch')
})

test('a consumed purchase void is rejected atomically', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'consumed-void', 10000, 1000, time(base, 0))
  const added = await restock(workspace, 'consumed-void', 10000, 3000, time(base, 1))
  workspace = (await sell(added.workspace, 'consumed-void', 1000, time(base, 2))).workspace
  const before = workspace
  await assert.rejects(saveWorkspace({ ...workspace.state, purchases: workspace.state.purchases!.map(purchase => purchase.id === added.purchaseId
    ? { ...purchase, voidedAt: time(base, 3), voidReason: 'Cannot reverse consumed inventory' } : purchase) }, workspace), rejected)
  const reloaded = await loadWorkspace(1)
  assert.equal(reloaded.revision, before.revision)
  assert.equal(reloaded.state.purchases!.find(purchase => purchase.id === added.purchaseId)!.voidedAt, undefined)
  assert.equal(currentProduct(reloaded, 'consumed-void').inventoryValue, 3800)
  assert.equal(currentQuantity(reloaded, currentProduct(reloaded, 'consumed-void')), 19000)
})

test('separate backend returns conserve all discounted revenue and original COGS', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'partial-returns', 3000, 1001, time(base, 0))
  const sale = await sell(workspace, 'partial-returns', 3000, time(base, 1), { discount: 1 })
  workspace = sale.workspace
  const values: number[] = []
  const costs: number[] = []
  for (let index = 0; index < 3; index++) {
    const entry = returnEntry(workspace, sale.receiptId, 'partial-returns', 1000, time(base, index + 2))
    workspace = await saveWorkspace({ ...workspace.state, returns: [...(workspace.state.returns ?? []), entry] }, workspace)
    const saved = workspace.state.returns!.find(part => part.id === entry.id)!
    values.push(saved.refunded)
    costs.push(saved.lines[0].cost)
  }
  assert.deepEqual(values, [350, 350, 349])
  assert.deepEqual(costs, [334, 334, 333])
  assert.equal(values.reduce((sum, value) => sum + value, 0), 1049)
  assert.equal(costs.reduce((sum, value) => sum + value, 0), 1001)
  const product = currentProduct(await loadWorkspace(2), 'partial-returns')
  assert.equal(product.inventoryValue, 1001)
  assert.equal(currentQuantity(workspace, product), 3000)
})

test('same-product exchange restores old returned cost before pricing replacement COGS', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'exchange-pool', 10000, 1000, time(base, 0))
  const sale = await sell(workspace, 'exchange-pool', 10000, time(base, 1))
  workspace = (await restock(sale.workspace, 'exchange-pool', 10000, 3000, time(base, 2))).workspace
  const entry = returnEntry(workspace, sale.receiptId, 'exchange-pool', 10000, time(base, 3), [{ productId: 'exchange-pool', quantity: 1000 }])
  workspace = await saveWorkspace({ ...workspace.state, returns: [entry] }, workspace)
  const reloaded = await loadWorkspace(2)
  const saved = reloaded.state.returns![0]
  assert.equal(saved.lines[0].cost, 1000)
  assert.equal(saved.replacementLines![0].cost, 200)
  assert.equal(saved.replacementLines![0].costStatus, 'recorded')
  assert.equal(currentProduct(reloaded, 'exchange-pool').inventoryValue, 3800)
  assert.equal(currentQuantity(reloaded, currentProduct(reloaded, 'exchange-pool')), 19000)
  assert.equal(receiptLineCost(reloaded.state.receipts[0].lines[0]), 1000)
})

test('unproven opening stock requires a quantity-checked explicit valuation before sale', async t => {
  const fixture = connect(t)
  const base = Date.now() - 60000
  let workspace = await loadWorkspace(1)
  const unknown: Product = { ...findProduct('mouse-opt'), id: 'unproven-stock', code: 'UNPROVEN', stock: 3000, purchased: 3000, cost: 100 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [unknown] }, workspace)
  // Legacy stock has intervening history and a mutable unit cost, but no opening book value.
  fixture.db.prepare("UPDATE custom_products SET inventory_value=NULL, valuation_status='unverified' WHERE id=?").run(unknown.id)
  fixture.db.prepare('INSERT INTO stock_adjustments (id,created_at,product_id,quantity,reason,counted,note) VALUES (?,?,?,?,?,?,?)')
    .run('legacy-count', time(base, -1), unknown.id, -1000, 'count', 2000, 'Legacy stock count with no valuation')
  workspace = await loadWorkspace(1)
  assert.equal(inventoryValuationReady(currentProduct(workspace, unknown.id)), false)
  await assert.rejects(sell(workspace, unknown.id, 1000, time(base, 0)), rejected)
  await assert.rejects(saveWorkspace(workspace.state, workspace, { valuationCheckpoints: [{ productId: unknown.id, expectedQuantity: 1000, inventoryValue: 200, reason: 'Opening invoice' }] }), rejected)
  const before = await loadWorkspace(1)
  assert.equal(before.revision, workspace.revision)
  workspace = await saveWorkspace(workspace.state, workspace, { valuationCheckpoints: [{ productId: unknown.id, expectedQuantity: 2000, inventoryValue: 200, reason: 'Opening invoice verified' }] })
  const valued = currentProduct(workspace, unknown.id)
  assert.equal(valued.inventoryValue, 200)
  assert.equal(valued.valuationStatus, 'provided')
  assert.equal(inventoryValuationReady(valued), true)
  workspace = (await sell(workspace, unknown.id, 1000, time(base, 1))).workspace
  assert.equal(currentProduct(workspace, unknown.id).inventoryValue, 100)
})

test('backend reload keeps unknown service cost distinct from an explicitly recorded zero', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await loadWorkspace(1)
  workspace = (await sell(workspace, 'service-pc-clean', 1000, time(base, 0))).workspace
  let line = (await loadWorkspace(2)).state.receipts[0].lines[0]
  assert.equal(line.costAmount, 0)
  assert.equal(line.costStatus, 'unassigned')
  assert.equal(line.product.cost, undefined)
  const zero: Product = { ...findProduct('service-pc-clean'), id: 'zero-cost-service', code: 'ZERO-SERVICE', cost: 0 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [...(workspace.state.customProducts ?? []), zero] }, workspace)
  const sale = await sell(workspace, zero.id, 1000, time(base, 1))
  line = (await loadWorkspace(1)).state.receipts.find(receipt => receipt.id === sale.receiptId)!.lines[0]
  assert.equal(line.costAmount, 0)
  assert.equal(line.costStatus, 'recorded')
  assert.equal(line.product.cost, 0)
})

test('backend payments use FIFO and a refund on a settled bill cannot cancel another bill', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'due-item', 3000, 300, time(base, 0), 900)
  const customer = { id: 'account-customer', en: 'Account customer', bn: 'Account customer', phone: '01711111111' }
  workspace = await saveWorkspace({ ...workspace.state, customCustomers: [customer] }, workspace)
  const first = await sell(workspace, 'due-item', 1000, time(base, 1), { customerId: customer.id, tendered: 0 })
  const second = await sell(first.workspace, 'due-item', 1000, time(base, 2), { customerId: customer.id, tendered: 0 })
  const payment: AccountTransaction = { id: 'fifo-payment', customerId: customer.id, type: 'payment', amount: 900, createdAt: time(base, 3) }
  workspace = await saveWorkspace({ ...second.workspace.state, transactions: [payment] }, second.workspace)
  let bills = workspace.state.receipts
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === first.receiptId)!, bills, workspace.state.transactions), 0)
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === second.receiptId)!, bills, workspace.state.transactions), 900)
  const paidReturn = returnEntry(workspace, first.receiptId, 'due-item', 1000, time(base, 4))
  assert.equal(paidReturn.settlement!.payout, 900)
  const forged: Return = { ...paidReturn, settlement: { ...paidReturn.settlement!, dueReduced: 900, payout: 0 } }
  await assert.rejects(saveWorkspace({ ...workspace.state, returns: [forged] }, workspace), rejected)
  workspace = await saveWorkspace({ ...workspace.state, returns: [paidReturn] }, workspace)
  assert.equal(customerBalance(customer, workspace.state.receipts, workspace.state.transactions, workspace.state.returns).totalDue, 900)
  const unpaidReturn = returnEntry(workspace, second.receiptId, 'due-item', 1000, time(base, 5))
  assert.equal(unpaidReturn.settlement!.dueReduced, 900)
  assert.equal(unpaidReturn.settlement!.payout, 0)
  workspace = await saveWorkspace({ ...workspace.state, returns: [...workspace.state.returns!, unpaidReturn] }, workspace)
  const loaded = await loadWorkspace(2)
  bills = loaded.state.receipts
  assert.equal(customerBalance(customer, bills, loaded.state.transactions, loaded.state.returns).totalDue, 0)
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === second.receiptId)!, bills, loaded.state.transactions, loaded.state.returns), 0)
})

test('opening debt, balance adjustments, and signed corrections stay separate from receipt debt after reload', async t => {
  connect(t)
  const base = Date.now() - 60000
  let workspace = await provision(await loadWorkspace(1), 'mixed-debt-item', 2000, 200, time(base, 0), 900)
  const customer = { id: 'mixed-account', en: 'Mixed account', bn: 'Mixed account', phone: '01722222222', openingBalance: 200 }
  workspace = await saveWorkspace({ ...workspace.state, customCustomers: [customer] }, workspace)
  const first = await sell(workspace, 'mixed-debt-item', 1000, time(base, 1), { customerId: customer.id, tendered: 0 })
  const second = await sell(first.workspace, 'mixed-debt-item', 1000, time(base, 3), { customerId: customer.id, tendered: 0 })
  const transactions: AccountTransaction[] = [
    { id: 'account-adjustment', customerId: customer.id, type: 'credit_adjust', amount: 500, createdAt: time(base, 2) },
    { id: 'account-payment', customerId: customer.id, type: 'payment', amount: 500, createdAt: time(base, 4) },
  ]
  workspace = await saveWorkspace({ ...second.workspace.state, transactions }, second.workspace)
  let loaded = await loadWorkspace(2)
  let bills = loaded.state.receipts
  assert.equal(customerBalance(customer, bills, loaded.state.transactions).totalDue, 2000)
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === first.receiptId)!, bills, loaded.state.transactions), 600)
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === second.receiptId)!, bills, loaded.state.transactions), 900)
  const correction: AccountTransaction = { id: 'negative-correction', customerId: customer.id, type: 'credit_adjust', amount: -600, createdAt: time(base, 5) }
  loaded = await saveWorkspace({ ...loaded.state, transactions: [...loaded.state.transactions!, correction] }, loaded)
  const linked = returnEntry(loaded, second.receiptId, 'mixed-debt-item', 1000, time(base, 6))
  loaded = await saveWorkspace({ ...loaded.state, returns: [linked] }, loaded)
  workspace = await loadWorkspace(1)
  bills = workspace.state.receipts
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === first.receiptId)!, bills, workspace.state.transactions, workspace.state.returns), 0)
  assert.equal(receiptOutstandingDue(bills.find(receipt => receipt.id === second.receiptId)!, bills, workspace.state.transactions, workspace.state.returns), 0)
  assert.equal(customerBalance(customer, bills, workspace.state.transactions, workspace.state.returns).totalDue, 500)
})

test('legacy negative payments preserve their recorded sign and mark customer balances for review', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const customer = { id: 'negative-payment-customer', en: 'Legacy account', bn: 'Legacy account', phone: '01733333333' }
  workspace = await saveWorkspace({ ...workspace.state, customCustomers: [customer] }, workspace)
  fixture.db.prepare('INSERT INTO account_transactions (id,customer_id,type,amount,created_at,note) VALUES (?,?,?,?,?,?)')
    .run('legacy-negative-payment', customer.id, 'payment', -50, new Date().toISOString(), 'Historical reversal needing review')
  const reloaded = await loadWorkspace(2)
  const balance = customerBalance(customer, reloaded.state.receipts, reloaded.state.transactions, reloaded.state.returns)
  assert.equal(balance.totalDue, 50)
  assert.equal(balance.storeCredit, 0)
  assert.equal(balance.totalPaid, -50)
  assert.ok(balance.accountingIssue)
  assert.equal(customerAccountingReady(customer, reloaded.state.receipts, reloaded.state.transactions, reloaded.state.returns), false)
  assert.equal(customerAccountingReady('unrelated-customer', reloaded.state.receipts, reloaded.state.transactions, reloaded.state.returns), true)
})
