import test from 'node:test'
import assert from 'node:assert/strict'
import { allProducts, makeReceipt, makeReturn, makeReturnExchange, type Receipt } from '../src/model.ts'
import { findProduct, initialState } from './fixtures/catalog.ts'
import { parseMutationPayload as parseInput, ValidationError } from '../worker/validate.ts'
import {
  buildCatalog,
  computePurchaseTotal,
  computeReceipt,
  computeReturn,
  receiptForReturn,
  type PriorReturnLine,
  type ReceiptForReturn,
} from '../worker/recalc.ts'

const catalog = buildCatalog([], initialState.customProducts!)

// The device-side receipt, converted into the primitive inputs the sync API accepts.
const receiptInput = (receipt: Receipt) => ({
  id: receipt.id,
  number: receipt.number,
  createdAt: receipt.createdAt,
  customerId: receipt.customer?.id ?? null,
  lines: receipt.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}) })),
  discount: receipt.discount,
  tendered: receipt.tendered,
  method: receipt.method,
  claimedTotal: receipt.total,
  creditApplied: receipt.creditApplied,
})

const parseMutationPayload = (body: any) => parseInput(body === null ? body : { expectedRevision: 0, terminalId: 1, ...body })

test('payload validation isolates malformed writes instead of failing the batch', () => {
  const parsed = parseMutationPayload({
    receipts: [
      {
        id: 'r1', number: 1, createdAt: '2026-10-10T10:00:00.000Z', customer: { id: 'c1' },
        lines: [{ productId: 'mouse-opt', quantity: 1000 }], discount: 0, total: 350,
        tendered: 350, paid: 350, method: 'cash',
      },
      { id: 'r2', number: 'two', lines: [], method: 'cash' },
    ],
    expenses: [{ id: 'e1', createdAt: '2026-10-10T10:00:00.000Z', category: 'rent', amount: 50, method: 'cash' }],
    returns: [{ id: 'ret1', createdAt: '2026-10-10T10:00:00.000Z', receiptId: 'r1', method: 'cash', restock: true, refunded: 100, lines: [{ productId: 'mouse-opt', quantity: 100 }] }],
  })

  assert.equal(parsed.receipts.length, 1)
  assert.equal(parsed.receipts[0].claimedTotal, 350)
  assert.equal(parsed.receipts[0].customerId, 'c1')
  assert.equal(parsed.expenses[0].amount, 50)
  assert.equal(parsed.returns[0].refunded, 100)
  assert.equal(parsed.rejected.length, 1)
  assert.equal(parsed.rejected[0].type, 'receipts')
  assert.equal(parsed.rejected[0].id, 'r2')
  assert.match(parsed.rejected[0].reason, /receipts\[1\]/)
})

test('payload validation fails closed when the request structure is wrong', () => {
  assert.throws(() => parseMutationPayload(null), ValidationError)
  assert.throws(() => parseMutationPayload({ receipts: 'not-a-list' }), ValidationError)
  const isolated = parseMutationPayload({ receipts: [{ id: 'r1' }] })
  assert.equal(isolated.receipts.length, 0)
  assert.equal(isolated.rejected.length, 1)
  assert.equal(isolated.rejected[0].id, 'r1')
  const empty = parseMutationPayload({})
  assert.deepEqual(
    [empty.receipts, empty.transactions, empty.purchases, empty.expenses, empty.adjustments, empty.returns, empty.purchaseVoids, empty.customProducts, empty.customCustomers],
    [[], [], [], [], [], [], [], [], []]
  )
})

test('the server catalog starts empty and uses database records and validated incoming products', () => {
  const base = buildCatalog([], [])
  assert.equal(base.size, 0)
  assert.equal(base.has('mouse-opt'), false)

  const payloadOverride = buildCatalog([], [{ ...findProduct('mouse-opt'), price: 400 }])
  assert.equal(payloadOverride.get('mouse-opt')?.price, 400)

  const d1Override = buildCatalog([{ id: 'mouse-opt', price: 999, cost: null }], [])
  assert.equal(d1Override.get('mouse-opt')?.price, 999)
  assert.equal(d1Override.get('mouse-opt')?.cost, Math.round(999 * 0.85))
  assert.equal(buildCatalog([{ id: 'service-custom', price: 1, cost: 10 }], []).get('service-custom')?.cost, 10)
  assert.equal(buildCatalog([{ id: 'custom-service', price: 500, cost: null, kind: 'service' }], []).get('custom-service')?.cost, 0)
})

test('backend accepts a service item only when it carries no inventory', () => {
  const service = { ...findProduct('service-pc-clean'), id: 'new-service' }
  const accepted = parseMutationPayload({ customProducts: [service] })
  assert.equal(accepted.customProducts[0].kind, 'service')
  assert.equal(accepted.rejected.length, 0)
  const rejected = parseMutationPayload({ customProducts: [{ ...service, stock: 1000 }] })
  assert.equal(rejected.customProducts.length, 0)
  assert.equal(rejected.rejected.length, 1)
})

test('server receipt recalculation reproduces the device math exactly', () => {
  const cases: Receipt[] = [
    makeReceipt(initialState, 1000, 'cash'), // cash overpayment with change
    makeReceipt({ ...initialState, discount: 90, customerId: 'c1' }, 810, 'cash'), // discounted, exact
    makeReceipt({ ...initialState, customerId: 'c1' }, 500, 'mobile'), // electronic underpayment with due
  ]
  for (const receipt of cases) {
    const computed = computeReceipt(receiptInput(receipt), catalog)
    assert.equal(computed.subtotal, receipt.subtotal)
    assert.equal(computed.total, receipt.total)
    assert.equal(computed.paid, receipt.paid)
    assert.equal(computed.change, receipt.change)
    assert.equal(computed.due, receipt.due)
    assert.equal(computed.customerId, receipt.customer?.id ?? null)
  }
})

test('receipt recalculation refuses writes the device would never produce', () => {
  const good = receiptInput(makeReceipt(initialState, 1000, 'cash'))

  // Forged totals are compared, never trusted.
  assert.throws(() => computeReceipt({ ...good, claimedTotal: good.claimedTotal! + 50 }, catalog), ValidationError)
  // Unknown products have no server price to recalculate from.
  assert.throws(() => computeReceipt({ ...good, lines: [{ productId: 'does-not-exist', quantity: 1000 }] }, catalog), ValidationError)
  // Business rules from makeReceipt are enforced server-side too.
  assert.throws(() => computeReceipt({ ...good, method: 'mobile' as const, tendered: 9999 }, catalog), ValidationError)
  assert.throws(() => computeReceipt({ ...good, customerId: null, tendered: 500 }, catalog), ValidationError)
  assert.throws(() => computeReceipt({ ...good, discount: 99999, tendered: 500 }, catalog), ValidationError)
})

test('server return recalculation follows the bill discount and caps refunds', () => {
  const receipt = makeReceipt({ ...initialState, discount: 90, customerId: 'c1' }, 810, 'cash')
  const bill: ReceiptForReturn = receiptForReturn(computeReceipt(receiptInput(receipt), catalog))
  const input = {
    id: 'ret-1',
    createdAt: '2026-10-10T10:00:00.000Z',
    receiptId: receipt.id,
    method: 'cash' as const,
    restock: true,
    refunded: 495,
    lines: [{ productId: 'keyboard-usb', quantity: 1000 }],
  }

  const computed = computeReturn(input, bill, [], catalog)
  assert.equal(computed.lines[0].amount, 495) // same discount allocation as the device
  assert.equal(computed.lines[0].cost, 380) // same product cost as the device
  assert.equal(computed.refunded, 495)
  assert.equal(computed.receiptNumber, receipt.number)
  assert.equal(computed.customerId, 'c1')

  // Refunds above the server-calculated maximum are refused; lower overrides are kept.
  assert.throws(() => computeReturn({ ...input, refunded: 600 }, bill, [], catalog), ValidationError)
  assert.equal(computeReturn({ ...input, refunded: 400 }, bill, [], catalog).refunded, 400)
  // Returning more than the bill holds is refused, accounting for prior returns.
  assert.throws(() => computeReturn({ ...input, lines: [{ productId: 'keyboard-usb', quantity: 2000 }] }, bill, [], catalog), ValidationError)
  const prior: PriorReturnLine[] = [{ id: 'other', productId: 'keyboard-usb', quantity: 1000 }]
  assert.throws(() => computeReturn(input, bill, prior, catalog), ValidationError)
  // A resend of the same return id is not counted against itself...
  const ownPrior: PriorReturnLine[] = [{ id: 'ret-1', productId: 'keyboard-usb', quantity: 1000 }]
  assert.doesNotThrow(() => computeReturn(input, bill, ownPrior, catalog))
  // ...but a different accepted return for the same bill is.
  const otherPrior: PriorReturnLine[] = [{ id: 'ret-2', productId: 'keyboard-usb', quantity: 1000 }]
  assert.throws(() => computeReturn(input, bill, otherPrior, catalog), ValidationError)
  // Products that are not on the bill are refused.
  assert.throws(() => computeReturn({ ...input, lines: [{ productId: 'pendrive-32gb', quantity: 1000 }] }, bill, [], catalog), ValidationError)
  // Due refunds require the bill to have a customer.
  const walkIn = receiptForReturn(computeReceipt(receiptInput(makeReceipt(initialState, 1000, 'cash')), catalog))
  assert.throws(() => computeReturn({ ...input, method: 'due' as const }, walkIn, [], catalog), ValidationError)

  // Parity with the device's own makeReturn for the same bill and quantities.
  const device = makeReturn(receipt, [{ productId: 'keyboard-usb', quantity: 1000 }], { method: 'cash', restock: true })
  const server = computeReturn(
    { ...input, lines: [{ productId: 'keyboard-usb', quantity: 1000 }], refunded: device.refunded },
    bill,
    [],
    catalog
  )
  assert.equal(server.lines[0].amount, device.lines[0].amount)
  assert.equal(server.lines[0].cost, device.lines[0].cost)
  assert.equal(server.refunded, device.refunded)
})

test('server verifies exchange settlement and replacement prices', () => {
  const bill = makeReceipt({ ...initialState, customerId: 'c1' }, 900, 'cash')
  const entry = makeReturnExchange(bill, [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [{ productId: 'mouse-opt', quantity: 1000 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: false,
    reason: 'Wrong model', operator: 'Sam', now: new Date(bill.createdAt),
  })
  const input = { ...entry, conditions: { 'keyboard-usb': 'sellable' as const } }
  const original = receiptForReturn(computeReceipt(receiptInput(bill), catalog))
  const parsed = parseMutationPayload({ returns: [entry] })
  assert.equal(parsed.returns[0].conditions?.['keyboard-usb'], 'sellable')
  assert.equal(parsed.returns[0].replacementLines?.[0].amount, 350)
  assert.equal(computeReturn(input, original, [], catalog).settlement?.payout, 200)
  assert.equal(computeReturn(parsed.returns[0], original, [], catalog).replacementLines?.[0].amount, 350)
  assert.throws(() => computeReturn({ ...input, settlement: { ...entry.settlement!, payout: 210 } }, original, [], catalog), ValidationError)
  assert.throws(() => computeReturn({ ...input, replacementLines: [{ ...entry.replacementLines![0], amount: 1 }] }, original, [], catalog), ValidationError)
  assert.throws(() => computeReturn({ ...input, replacementLines: [{ ...entry.replacementLines![0], unitPrice: 239, amount: 239 }] }, original, [], catalog), /below buy cost/)
})

test('purchase totals are summed from line amounts on the server', () => {
  assert.equal(
    computePurchaseTotal([
      { productId: 'mouse-opt', quantity: 2000, unitCost: 240, total: 480 },
      { productId: 'keyboard-usb', quantity: 1000, unitCost: 5, total: 5 },
    ]),
    485
  )
})

test('buildWorkspaceFromRelational creates full ShopState and applies purchase voids', async () => {
  const { buildWorkspaceFromRelational } = await import('../worker/index.ts')
  const { stockFor } = await import('../src/model.ts')
  const delta = {
    receipts: [{ id: 'r1', number: 1, total: 35000, customerId: 'cc1', lines: [{ productId: 'mouse-opt', quantity: 1000 }] }],
    transactions: [],
    purchases: [{ id: 'p1', total: 5000, lines: [] }],
    expenses: [{ id: 'e1', amount: 2000 }],
    adjustments: [{ id: 'a1', quantity: 10 }],
    returns: [{ id: 'ret1', refunded: 1000 }],
    purchaseVoids: [{ purchaseId: 'p1', createdAt: '2026-10-10T11:00:00Z', reason: 'Defective shipment' }],
    customProducts: [{ id: 'cp1', code: 'C1', en: 'Custom' }],
    customCustomers: [{ id: 'cc1', en: 'Customer 1', bn: 'ক্রেতা ১', phone: '01700000000' }],
  }

  const workspace = buildWorkspaceFromRelational(delta as any)
  assert.equal(workspace.version, 2)
  assert.equal(workspace.receipts.length, 1)
  assert.equal(workspace.receipts[0].lines[0].product.id, 'mouse-opt')
  assert.equal(workspace.receipts[0].customer.id, 'cc1')
  assert.equal(workspace.receipts[0].customer.en, 'Customer 1')
  // stockFor must succeed on the restored receipts without throwing undefined property error
  assert.doesNotThrow(() => stockFor(findProduct('mouse-opt'), workspace.receipts))
  assert.equal(workspace.purchases.length, 1)
  assert.equal(workspace.purchases[0].voidedAt, '2026-10-10T11:00:00Z')
  assert.equal(workspace.purchases[0].voidReason, 'Defective shipment')
  assert.equal(workspace.expenses.length, 1)
  assert.equal(workspace.adjustments.length, 1)
  assert.equal(workspace.returns.length, 1)
  assert.equal(workspace.customProducts.length, 1)
  assert.equal(workspace.customCustomers.length, 1)
})


test('product warranty accepts optional trimmed text and rejects invalid values', () => {
  const product = { ...findProduct('mouse-opt'), warranty: '  1 year  ' }
  assert.equal(parseMutationPayload({ customProducts: [product] }).customProducts[0].warranty, '1 year')
  assert.equal(parseMutationPayload({ customProducts: [{ ...product, warranty: undefined }] }).customProducts[0].warranty, '')
  for (const warranty of [123, 'x'.repeat(101)]) {
    const parsed = parseMutationPayload({ customProducts: [{ ...product, warranty }] })
    assert.equal(parsed.customProducts.length, 0)
    assert.match(parsed.rejected[0].reason, /warranty/)
  }
})

 test('manual selling prices survive validation and authoritative server recalculation', () => {
  const receipt = makeReceipt({ ...initialState, lines: [{ productId: 'mouse-opt', quantity: 3000, unitPrice: 450 }] }, 1350, 'cash')
  const parsed = parseInput({ expectedRevision: 0, terminalId: 1, receipts: [receipt], draft: { lines: [{ productId: 'mouse-opt', quantity: 3000, unitPrice: 450 }], discount: 0, customerId: null } })
  assert.equal(parsed.receipts[0].lines[0].unitPrice, 450)
  assert.equal(parsed.draft!.lines[0].unitPrice, 450)
  const computed = computeReceipt(parsed.receipts[0], catalog)
  assert.equal(computed.total, 1350)
  assert.equal(computed.lines[0].price, 450)
  assert.equal(computed.lines[0].product!.price, 450)
  assert.equal(computed.lines[0].cost, catalog.get('mouse-opt')!.cost)
  assert.throws(() => computeReceipt({ ...receiptInput(receipt), claimedTotal: 10 }, catalog), /claimed total/)
  for (const unitPrice of [0, -1, 1.5, 100000001, '450']) {
    const rejected = parseInput({ expectedRevision: 0, terminalId: 1, receipts: [{ ...receipt, lines: [{ productId: 'mouse-opt', quantity: 3000, unitPrice }] }] })
    assert.equal(rejected.receipts.length, 0)
    assert.equal(rejected.rejected.length, 1)
  }
})

test('server rejects below-cost prices and discounts using authoritative buy cost', () => {
  const receipt = makeReceipt({ ...initialState, discount: 0, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 240 }] }, 240, 'cash')
  const input = receiptInput(receipt)
  assert.equal(computeReceipt(input, catalog).total, 240)
  assert.throws(() => computeReceipt({ ...input, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 239 }], claimedTotal: 239 }, catalog), /below buy cost/)
  assert.throws(() => computeReceipt({ ...input, discount: 1, claimedTotal: 239 }, catalog), /below buy cost/)
  const updatedCatalog = buildCatalog([{ id: 'mouse-opt', price: 350, cost: 300 }], [])
  assert.throws(() => computeReceipt(input, updatedCatalog), /below buy cost/)
})


test('server refuses a bill accepted against a stale cost, using current 550 buy cost', () => {
  const staleProduct = { ...findProduct('mouse-opt'), cost: 500, inventoryValue: 22500, valuationStatus: 'verified' as const }
  const receipt = makeReceipt({ ...initialState, discount: 0, receipts: [], customProducts: [staleProduct], lines: [{ productId: staleProduct.id, quantity: 1000, unitPrice: 549 }] }, 549, 'cash')
  const current = buildCatalog([], [{ ...staleProduct, cost: 550, inventoryValue: 24750 }])
  assert.throws(() => computeReceipt(receiptInput(receipt), current), /below buy cost/)
  const equalCost = computeReceipt({ ...receiptInput(receipt), lines: [{ productId: staleProduct.id, quantity: 1000, unitPrice: 550 }], tendered: 550, claimedTotal: 550 }, current)
  assert.equal(equalCost.total, 550)
})
