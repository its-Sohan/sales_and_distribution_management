import test from 'node:test'
import assert from 'node:assert/strict'
import { BackendError, loadWorkspace, loadWorkspaceRevision, saveWorkspace, WorkspaceRefresh, type Workspace } from '../src/backend.ts'
import { allProducts, allCustomers, customerBalance, parseReferencePrice, makeReturn, makePurchase, makeReceipt, makeReturnExchange, makeStockAdjustment, productCost, type Product, type StockReceiving } from '../src/model.ts'
import { initialState } from './fixtures/catalog.ts'
import { initialState as emptyState, findProductIn, findCustomerIn, isService, searchCatalog, searchCustomers } from '../src/model.ts'
import { returnSummary } from '../src/reportsModel.ts'
import { readFileSync } from 'node:fs'
import { backendFixture } from './d1Support.ts'

function connect(t: any) {
  const fixture = backendFixture()
  t.mock.method(globalThis, 'fetch', fixture.fetch)
  t.after(() => fixture.db.close())
  return fixture
}
const expense = (id: string) => ({ id, createdAt: '2026-10-12T10:00:00Z', category: 'rent' as const, amount: 50, method: 'cash' as const })

test('production model defaults contain no catalog, customers, or bill lines', () => {
  assert.deepEqual(emptyState.lines, [])
  assert.deepEqual(allProducts(), [])
  assert.deepEqual(allCustomers(), [])
  assert.deepEqual(searchCatalog(), [])
  assert.deepEqual(searchCustomers(), [])
  assert.equal(findCustomerIn('c1', []), undefined)
  assert.equal(findProductIn('mouse-opt', []).archived, true)
  assert.equal(findProductIn('mouse-opt', []).stock, 0)
  assert.equal(isService({ ...findProductIn('service-custom', []), kind: undefined }), false)
})

test('a fresh D1 database stays empty without environment flags across terminals and reloads', async t => {
  const f = backendFixture({ seedCatalog: false })
  t.after(() => f.db.close())
  t.mock.method(globalThis, 'fetch', f.fetch)
  for (const oldFlag of [undefined, 'false', 'true']) {
    ;(f.env as any).EMPTY_SHOP = oldFlag
    for (const terminalId of [1, 2, 1]) {
      const workspace = await loadWorkspace(terminalId)
      assert.equal(workspace.revision, 0)
      assert.deepEqual(workspace.state.customProducts, [])
      assert.deepEqual(workspace.state.customCustomers, [])
      assert.deepEqual(workspace.state.lines, [])
      assert.deepEqual(allProducts(workspace.state.customProducts), [])
      assert.deepEqual(allCustomers(workspace.state.customCustomers), [])
    }
  }
  assert.equal((f.db.prepare('SELECT COUNT(*) AS n FROM custom_products').get() as any).n, 0)
})

test('only persisted catalog records appear, and deleting the last record does not restore samples', async t => {
  const f = backendFixture({ seedCatalog: false })
  t.after(() => f.db.close())
  t.mock.method(globalThis, 'fetch', f.fetch)
  const current = await loadWorkspace(1)
  const product: Product = { ...initialState.customProducts![0], id: 'owner-product', code: 'OWNER-1', en: 'Actual database item', stock: 0, purchased: 0 }
  const saved = await saveWorkspace({ ...current.state, customProducts: [product] }, current)
  assert.deepEqual(saved.state.customProducts!.map(item => item.id), [product.id])
  const reloaded = await loadWorkspace(2)
  assert.deepEqual(allProducts(reloaded.state.customProducts).map(item => item.en), [product.en])
  f.db.prepare('DELETE FROM custom_products WHERE id = ?').run(product.id)
  assert.deepEqual((await loadWorkspace(1)).state.customProducts, [])
})

test('a former built-in product cannot authorize a sale when it is absent from D1', async t => {
  const f = backendFixture({ seedCatalog: false })
  t.after(() => f.db.close())
  const receipt = makeReceipt(initialState, 1000, 'cash')
  const response = await f.post({ expectedRevision: 0, terminalId: 1, receipts: [receipt] })
  assert.equal(response.status, 422)
  assert.match((await response.json() as any).error, /unknown stock item|unknown product/)
  assert.equal((f.db.prepare('SELECT COUNT(*) AS n FROM receipts').get() as any).n, 0)
})

test('revision reads are authenticated, uncached, and do not query financial history', async t => {
  const f = connect(t)
  const original = f.env.DB.prepare.bind(f.env.DB)
  const queries: string[] = []
  t.mock.method(f.env.DB, 'prepare', (sql: string) => { queries.push(sql); return original(sql) })
  const response = await f.fetch('/api/workspace/revision')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY')
  assert.deepEqual(await response.json(), { ok: true, revision: 0 })
  assert.equal(queries.length, 2) // Session lookup and the single revision row.
  assert.ok(queries.every(sql => /auth_sessions|app_revision/.test(sql)))
  let current = await loadWorkspace(1)
  current = await saveWorkspace({ ...current.state, expenses: [expense('revision-test')] }, current)
  assert.equal(await loadWorkspaceRevision(), current.revision)
  const signedOut = backendFixture({ authenticated: false })
  try { assert.equal((await signedOut.fetch('/api/workspace/revision')).status, 401) }
  finally { signedOut.db.close() }
})

test('background refresh skips full reads when unchanged and applies changed workspaces', async t => {
  const f = connect(t)
  const current = await loadWorkspace(1)
  const fetch = t.mock.method(globalThis, 'fetch', f.fetch)
  const refresher = new WorkspaceRefresh()
  const applied: Workspace[] = []
  await refresher.check(current, () => true, next => applied.push(next))
  assert.equal(fetch.mock.calls.length, 1)
  assert.equal(applied.length, 0)
  await f.post({ expectedRevision: 0, terminalId: 1, expenses: [expense('changed')] })
  fetch.mock.resetCalls()
  await refresher.check(current, () => true, next => applied.push(next))
  assert.equal(fetch.mock.calls.length, 2)
  assert.equal(applied[0].revision, 1)
  assert.equal(applied[0].state.expenses?.[0].id, 'changed')
})

test('a cancelled background read cannot overwrite a write or terminal change, even if fetch ignores abort', async t => {
  connect(t)
  const current = await loadWorkspace(1)
  let finishRead!: (response: Response) => void
  let readStarted!: () => void
  const started = new Promise<void>(resolve => { readStarted = resolve })
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    if (String(url).endsWith('/revision')) return new Response(JSON.stringify({ ok: true, revision: 1 }))
    readStarted()
    return new Promise<Response>(resolve => { finishRead = resolve })
  })
  const refresher = new WorkspaceRefresh()
  let applications = 0
  const pending = refresher.check(current, () => true, () => applications++)
  await started
  refresher.cancel()
  finishRead(new Response(JSON.stringify({ ok: true, ...current, revision: 1 })))
  await pending
  assert.equal(applications, 0)
})

test('background reads are discarded when their snapshot is no longer current', async t => {
  connect(t)
  const current = await loadWorkspace(1)
  let isCurrent = true
  t.mock.method(globalThis, 'fetch', async () => {
    isCurrent = false
    return new Response(JSON.stringify({ ok: true, revision: 2 }))
  })
  await new WorkspaceRefresh().check(current, () => isCurrent, () => assert.fail('Stale read applied'))
})

test('invalid revision responses fail closed', async t => {
  for (const revision of [-1, 1.5, '2', null]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ok: true, revision })))
    await assert.rejects(loadWorkspaceRevision(), /did not confirm the revision/)
  }
})

test('drafts and sales persist directly in D1 and reload on their terminal', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  assert.deepEqual(workspace.state.lines, [])
  assert.equal(workspace.revision, 0)
  workspace = await saveWorkspace({ ...workspace.state, lines: initialState.lines, discount: 5, customerId: 'c1' }, workspace)
  assert.equal((await loadWorkspace(1)).state.discount, 5)
  assert.deepEqual((await loadWorkspace(2)).state.lines, [])
  const receipt = makeReceipt(workspace.state, 1000, 'cash', 1)
  const saved = await saveWorkspace({ ...workspace.state, lines: [], discount: 0, customerId: null, receipts: [receipt] }, workspace)
  assert.equal(saved.state.receipts[0].total, receipt.total)
  assert.equal(saved.state.receipts[0].lines[0].product.price, 350)
  assert.deepEqual(saved.state.lines, [])
  const otherTerminal = await loadWorkspace(2)
  assert.equal(otherTerminal.state.receipts[0].id, receipt.id)
  assert.equal(otherTerminal.state.terminalId, 2)
})

test('a receipt preview is not recorded until confirmed, and its preparer is immutable after saving', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: initialState.lines, customerId: 'c1' }, workspace)
  const preview = { ...makeReceipt(workspace.state, 1000, 'cash', 1), preparedBy: '  Masum  ' }
  assert.equal((await loadWorkspace(2)).state.receipts.length, 0)
  assert.deepEqual((await loadWorkspace(1)).state.lines, initialState.lines)

  const saved = await saveWorkspace({ ...workspace.state, lines: [], customerId: null, receipts: [preview] }, workspace)
  assert.equal(saved.state.receipts[0].preparedBy, 'Masum')
  assert.equal((await loadWorkspace(2)).state.receipts[0].preparedBy, 'Masum')
  await assert.rejects(
    saveWorkspace({ ...saved.state, receipts: [{ ...saved.state.receipts[0], preparedBy: 'Someone else' }] }, saved),
    error => error instanceof BackendError && error.status === 422,
  )
})

test('expense removal and undo are backend writes visible to all terminals', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const entry = expense('expense-1')
  workspace = await saveWorkspace({ ...workspace.state, expenses: [entry] }, workspace)
  assert.equal((await loadWorkspace(2)).state.expenses?.length, 1)
  workspace = await saveWorkspace({ ...workspace.state, expenses: [] }, workspace)
  assert.deepEqual((await loadWorkspace(2)).state.expenses, [])
  workspace = await saveWorkspace({ ...workspace.state, expenses: [entry] }, workspace)
  assert.equal((await loadWorkspace(2)).state.expenses?.[0].id, entry.id)
})

test('products, purchases, purchase voids, customers, payments, and stock corrections use D1', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const product: Product = { ...allProducts(initialState.customProducts)[0], id: 'new-product', code: 'TEST-001', stock: 2000, purchased: 2000 }
  const purchase = makePurchase([{ productId: product.id, quantity: 2000, unitCost: 240, total: 480 }], { supplier: 'Test supplier' })
  const customer = { id: 'test-customer', en: 'Test customer', bn: 'পরীক্ষা', phone: '01700000000', openingBalance: 100 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [product], purchases: [purchase], customCustomers: [customer] }, workspace)
  const payment = { id: 'test-payment', customerId: customer.id, type: 'payment' as const, amount: 50, createdAt: new Date().toISOString() }
  const adjustment = makeStockAdjustment({ productId: product.id, quantity: 1000, reason: 'count' })
  workspace = await saveWorkspace({ ...workspace.state, transactions: [payment], adjustments: [adjustment] }, workspace)
  const voided = { ...workspace.state.purchases![0], voidedAt: new Date().toISOString(), voidReason: 'Test correction' }
  workspace = await saveWorkspace({ ...workspace.state, purchases: [voided], customProducts: workspace.state.customProducts!.map(item => item.id === product.id ? { ...item, stock: 0, purchased: 0 } : item) }, workspace)
  const other = (await loadWorkspace(2)).state
  assert.equal(other.customProducts?.find(item => item.id === product.id)?.stock, 0)
  assert.equal(other.purchases?.[0].total, 480)
  assert.equal(other.purchases?.[0].voidReason, 'Test correction')
  assert.equal(other.transactions?.[0].amount, 50)
  assert.equal(other.customCustomers?.find(item => item.id === customer.id)?.phone, customer.phone)
  assert.equal(other.adjustments?.[0].quantity, 1000)
})

test('only changed catalog records are sent, and a stale terminal cannot overwrite newer data', async t => {
  const fixture = connect(t)
  const first = await loadWorkspace(1)
  const stale = await loadWorkspace(2)
  const product = { ...allProducts(initialState.customProducts)[0], price: 410 }
  const saved = await saveWorkspace({ ...first.state, customProducts: [product] }, first)
  await assert.rejects(saveWorkspace({ ...stale.state, customProducts: [{ ...product, price: 120 }] }, stale), error => error instanceof BackendError && error.status === 409)
  assert.equal((await loadWorkspace(2)).state.customProducts?.find(item => item.id === product.id)?.price, 410)
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    const body = JSON.parse(init.body)
    assert.deepEqual(body.customProducts, [])
    assert.equal(body.workspaceState, undefined)
    return fixture.fetch(url, init)
  })
  await saveWorkspace({ ...saved.state, expenses: [expense('expense-2')] }, saved)
})

test('invalid items reject the entire operation and leave the draft and revision intact', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: initialState.lines }, workspace)
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, receipts: [{ id: 'broken' }], expenses: [expense('must-not-save')], draft: { lines: [], discount: 0, customerId: null } })
  assert.equal(response.status, 422)
  assert.match((await response.json() as any).error, /receipts/)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('a SQL failure rolls back every financial write and draft change in one batch', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: initialState.lines }, workspace)
  fixture.db.exec("CREATE TRIGGER fail_expense BEFORE INSERT ON expenses BEGIN SELECT RAISE(ABORT, 'test failure'); END")
  const receipt = makeReceipt(workspace.state, 1000, 'cash')
  await assert.rejects(saveWorkspace({ ...workspace.state, receipts: [receipt], expenses: [expense('failed')], lines: [] }, workspace), error => error instanceof BackendError && error.status === 500)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('the revision guard rejects a race after both requests have read the same revision', async t => {
  const fixture = connect(t)
  const workspace = await loadWorkspace(1)
  const requests = [expense('a'), expense('b')].map(entry => fixture.post({ expectedRevision: workspace.revision, terminalId: 1, expenses: [entry] }))
  const responses = await Promise.all(requests)
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  const latest = await loadWorkspace(1)
  assert.equal(latest.revision, 1)
  assert.equal(latest.state.expenses?.length, 1)
})

test('a lost acknowledgment cannot cause a second sale at the old revision', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: initialState.lines }, workspace)
  const receipt = makeReceipt(workspace.state, 1000, 'cash')
  t.mock.method(globalThis, 'fetch', async (url: any, init: any) => { await fixture.fetch(url, init); throw new Error('response lost') })
  await assert.rejects(saveWorkspace({ ...workspace.state, receipts: [receipt], lines: [] }, workspace), /response lost/)
  t.mock.method(globalThis, 'fetch', fixture.fetch)
  const repeat = makeReceipt(workspace.state, 1000, 'cash')
  await assert.rejects(saveWorkspace({ ...workspace.state, receipts: [repeat], lines: [] }, workspace), error => error instanceof BackendError && error.status === 409)
  const restored = await loadWorkspace(1)
  assert.equal(restored.state.receipts.length, 1)
  assert.equal(restored.state.receipts[0].id, receipt.id)
  assert.deepEqual(restored.state.lines, [])
})

test('returns, exchanges, and historical sale prices survive a backend reload', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const state = { ...workspace.state, lines: initialState.lines, customerId: 'c1' }
  const receipt = makeReceipt(state, 900, 'cash')
  workspace = await saveWorkspace({ ...state, receipts: [receipt], lines: [] }, workspace)
  const entry = makeReturnExchange(workspace.state.receipts[0], [{ productId: 'keyboard-usb', quantity: 1000, condition: 'sellable' }], [{ productId: 'mouse-opt', quantity: 1000 }], {
    catalog: allProducts(initialState.customProducts), priorReturns: [], customerDue: 0, received: 0, method: 'cash', issueCredit: false,
    reason: 'Wrong model', operator: 'Sam', now: new Date(receipt.createdAt),
  })
  workspace = await saveWorkspace({ ...workspace.state, returns: [entry] }, workspace)
  assert.equal(workspace.state.returns?.[0].settlement?.payout, 200)
  const product = { ...allProducts(initialState.customProducts)[0], price: 999, cost: 123 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [product] }, workspace)
  const line = (await loadWorkspace(2)).state.receipts[0].lines[0]
  assert.equal(line.product.price, 350)
  assert.equal(productCost(line.product), 240)
})

test('large operations stay atomic rather than partially committing in chunks', async t => {
  const fixture = connect(t)
  const workspace = await loadWorkspace(1)
  fixture.db.exec("CREATE TRIGGER fail_last BEFORE INSERT ON expenses WHEN NEW.id='expense-109' BEGIN SELECT RAISE(ABORT, 'last write failed'); END")
  const expenses = Array.from({ length: 110 }, (_, i) => expense(`expense-${i}`))
  await assert.rejects(saveWorkspace({ ...workspace.state, expenses }, workspace))
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('backend-only API rejects malformed metadata and removes the old sync endpoint', async t => {
  const fixture = connect(t)
  assert.equal((await fixture.post({ expenses: [expense('missing-metadata')] })).status, 400)
  assert.equal((await fixture.post({ expectedRevision: 0, terminalId: 1, draft: { lines: [{ productId: 'unknown', quantity: 1000 }], discount: 0, customerId: null } })).status, 422)
  assert.equal((await fixture.fetch('/api/workspace?terminalId=0')).status, 400)
  assert.equal((await fixture.fetch('/api/sync')).status, 404)
  const health = await fixture.fetch('/api/health')
  assert.equal(health.status, 200)
  assert.equal(health.headers.get('cache-control'), 'no-store')
  fixture.db.exec('DROP TABLE terminal_drafts')
  assert.equal((await fixture.fetch('/api/health')).status, 503)
})

test('network failures and invalid acknowledgments never fall back to browser data', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unreachable') })
  await assert.rejects(loadWorkspace(1), /unreachable/)
  const current: Workspace = { revision: 0, state: { ...initialState, lines: [], terminalId: 1 } }
  for (const response of [new Response('<html>SPA</html>'), Response.json({ ok: true }), Response.json({ ok: false, state: current.state, revision: 1 }), Response.json({ ok: true, state: { ...current.state, expenses: undefined }, revision: 1 })]) {
    t.mock.method(globalThis, 'fetch', async () => response)
    await assert.rejects(saveWorkspace({ ...current.state, expenses: [expense('unconfirmed')] }, current), BackendError)
    assert.deepEqual(current.state.expenses, [])
  }
})


test('warranty follows product codes and remains fixed on sold invoices after restocking', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const first = { ...allProducts(initialState.customProducts)[0], warranty: '1 year' }
  const second = { ...allProducts(initialState.customProducts)[1], warranty: '6 months' }
  const third = { ...allProducts(initialState.customProducts)[2], warranty: '' }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [first, second, third] }, workspace)
  workspace = await loadWorkspace(2)
  assert.equal(allProducts(workspace.state.customProducts).find(p => p.code === first.code)?.warranty, '1 year')
  const saleState = { ...workspace.state, lines: [first, second, third].map(p => ({ productId: p.id, quantity: 1000 })), discount: 0, customerId: null }
  const receipt = makeReceipt(saleState, first.price + second.price + third.price, 'cash', 2)
  workspace = await saveWorkspace({ ...saleState, lines: [], receipts: [receipt] }, workspace)
  assert.deepEqual(workspace.state.receipts[0].lines.map(l => l.product.warranty), ['1 year', '6 months', ''])
  const restocked = { ...first, warranty: '2 years', stock: first.stock + 1000, purchased: (first.purchased ?? first.stock) + 1000 }
  const purchase = makePurchase([{ productId: first.id, quantity: 1000, unitCost: 240, total: 240 }])
  workspace = await saveWorkspace({ ...workspace.state, purchases: [...workspace.state.purchases ?? [], purchase], customProducts: [restocked, second, { ...third, warranty: 'Lifetime' }] }, workspace)
  const reloaded = await loadWorkspace(1)
  assert.equal(reloaded.state.customProducts?.find(p => p.id === first.id)?.warranty, '2 years')
  assert.deepEqual(reloaded.state.receipts[0].lines.map(l => l.product.warranty), ['1 year', '6 months', ''])
  const nextSale = { ...reloaded.state, lines: [{ productId: first.id, quantity: 1000 }], discount: 0, customerId: null }
  const nextReceipt = makeReceipt(nextSale, first.price, 'cash', 1)
  const saved = await saveWorkspace({ ...nextSale, lines: [], receipts: [...nextSale.receipts, nextReceipt] }, reloaded)
  assert.equal(saved.state.receipts.find(r => r.id === nextReceipt.id)?.lines[0].product.warranty, '2 years')
})

test('conflicting receipt IDs cannot authorize refunds beyond the committed sale', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const saleState = { ...workspace.state, lines: [{ productId: 'mouse-opt', quantity: 1000 }] }
  const receipt = makeReceipt(saleState, 350, 'cash')
  workspace = await saveWorkspace({ ...saleState, receipts: [receipt], lines: [] }, workspace)
  const forged = { ...receipt, total: 700, tendered: 700, lines: [{ ...receipt.lines[0], quantity: 2000 }] }
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, receipts: [forged],
    returns: [{ id: 'over-refund', createdAt: receipt.createdAt, receiptId: receipt.id, method: 'cash', restock: true,
      refunded: 700, lines: [{ productId: 'mouse-opt', quantity: 2000 }] }] })
  assert.equal(response.status, 422)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('receipt and return retries are no-ops even after current catalog prices change', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const saleState = { ...workspace.state, lines: [{ productId: 'mouse-opt', quantity: 1000 }] }
  const receipt = makeReceipt(saleState, 350, 'cash')
  workspace = await saveWorkspace({ ...saleState, receipts: [receipt], lines: [] }, workspace)
  const entry = makeReturnExchange(workspace.state.receipts[0], [{ productId: 'mouse-opt', quantity: 1000, condition: 'sellable' }], [], {
    catalog: allProducts(workspace.state.customProducts), receipts: workspace.state.receipts, priorReturns: [],
    customerDue: 0, method: 'cash', issueCredit: false, reason: 'Wrong item', operator: 'Test',
  })
  workspace = await saveWorkspace({ ...workspace.state, returns: [entry] }, workspace)
  const mouse = workspace.state.customProducts!.find(p => p.id === 'mouse-opt')!
  workspace = await saveWorkspace({ ...workspace.state, customProducts: workspace.state.customProducts!.map(p => p.id === mouse.id ? { ...p, price: 999 } : p) }, workspace)
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, receipts: [receipt, receipt], returns: [entry, entry] })
  assert.equal(response.status, 200)
  const restored = await loadWorkspace(1)
  assert.equal(restored.state.receipts.length, 1)
  assert.equal(restored.state.returns?.length, 1)
  assert.equal(restored.state.customProducts!.find(p => p.id === mouse.id)!.inventoryValue, mouse.inventoryValue)
  const changed = await fixture.post({ expectedRevision: restored.revision, terminalId: 1, returns: [{ ...entry, refunded: 349 }] })
  assert.equal(changed.status, 422)
})

test('identical duplicate purchase voids reverse inventory exactly once', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const product = workspace.state.customProducts!.find(p => p.id === 'mouse-opt')!
  const purchase = makePurchase([{ productId: product.id, quantity: 1000, unitCost: 240, total: 240 }])
  workspace = await saveWorkspace({ ...workspace.state, purchases: [purchase], customProducts: workspace.state.customProducts!.map(p => p.id === product.id ? { ...p, stock: p.stock + 1000, purchased: p.purchased! + 1000 } : p) }, workspace)
  const voided = { purchaseId: purchase.id, createdAt: new Date().toISOString(), reason: 'Repeated click' }
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, purchaseVoids: [voided, voided] })
  assert.equal(response.status, 200)
  const restored = await loadWorkspace(1)
  const after = restored.state.customProducts!.find(p => p.id === product.id)!
  assert.equal(after.stock, product.stock)
  assert.equal(after.inventoryValue, product.inventoryValue)
})

test('invalid transaction signs, unassigned customers and fractional pieces reject atomically', async t => {
  const fixture = connect(t)
  const workspace = await loadWorkspace(1)
  const createdAt = new Date().toISOString()
  for (const type of ['payment', 'sale_due']) {
    const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1,
      transactions: [{ id: `bad-${type}`, customerId: 'c1', type, amount: -50, createdAt }] })
    assert.equal(response.status, 422)
  }
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1,
    receipts: [{ id: 'unknown-debtor', number: 1, customer: { id: 'missing' }, createdAt, discount: 0, tendered: 0, method: 'cash', lines: [{ productId: 'mouse-opt', quantity: 1000 }] }] })
  assert.equal(response.status, 422)
  const fractional = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1,
    purchases: [{ id: 'fractional-pc', createdAt, lines: [{ productId: 'mouse-opt', quantity: 500, unitCost: 240, total: 120 }] }] })
  assert.equal(fractional.status, 422)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('a physical count of zero removes every remaining unit and its book value', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const product = workspace.state.customProducts!.find(p => p.id === 'mouse-opt')!
  const adjustment = makeStockAdjustment({ productId: product.id, quantity: -product.stock, counted: 0, reason: 'count' })
  workspace = await saveWorkspace({ ...workspace.state, adjustments: [adjustment] }, workspace)
  assert.equal(workspace.state.adjustments![0].counted, 0)
  assert.equal(workspace.state.adjustments![0].costAmount, -product.inventoryValue!)
  assert.equal(workspace.state.customProducts!.find(p => p.id === product.id)!.inventoryValue, 0)
})

test('service refunds never recover the sunk service cost as sellable inventory', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const service = { ...allProducts(initialState.customProducts).find(p => p.id === 'service-windows')!, cost: 100 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [...workspace.state.customProducts!.filter(p => p.id !== service.id), service] }, workspace)
  const saleState = { ...workspace.state, lines: [{ productId: service.id, quantity: 1000 }] }
  const receipt = makeReceipt(saleState, 500, 'cash')
  workspace = await saveWorkspace({ ...saleState, lines: [], receipts: [receipt] }, workspace)
  const entry = makeReturnExchange(workspace.state.receipts[0], [{ productId: service.id, quantity: 1000, condition: 'damaged' }], [], {
    catalog: allProducts(workspace.state.customProducts), receipts: workspace.state.receipts, priorReturns: [], customerDue: 0,
    method: 'cash', issueCredit: false, reason: 'Cancelled service', operator: 'Test',
  })
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, returns: [{ ...entry, restock: true, lines: [{ ...entry.lines[0], condition: 'sellable' }] }] })
  assert.equal(response.status, 200)
  const saved = await loadWorkspace(1)
  assert.equal(saved.state.returns![0].lines[0].condition, 'damaged')
  assert.equal(returnSummary(saved.state.returns!).cost, 0)
})

test('customer opening debt overrides are used consistently by profiles and bill allocation', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const customer = { ...allCustomers(workspace.state.customCustomers)[0], openingBalance: 1000 }
  workspace = await saveWorkspace({ ...workspace.state, customCustomers: [customer] }, workspace)
  const state = { ...workspace.state, customerId: customer.id, lines: [{ productId: 'mouse-opt', quantity: 1000 }] }
  const receipt = makeReceipt(state, 0, 'cash')
  workspace = await saveWorkspace({ ...state, lines: [], receipts: [receipt] }, workspace)
  const loaded = allCustomers(workspace.state.customCustomers).find(c => c.id === customer.id)!
  assert.equal(customerBalance(loaded, workspace.state.receipts).totalDue, 1350)
  assert.equal(workspace.state.receipts[0].customer!.openingBalance, 1000)
  assert.equal('creditLimit' in loaded, false)
})

test('unversioned saved discounts require explicit whole-Taka review before checkout', async t => {
  const fixture = connect(t)
  fixture.db.prepare('INSERT INTO terminal_drafts (terminal_id, draft_json) VALUES (?, ?)').run(1,
    JSON.stringify({ lines: [{ productId: 'mouse-opt', quantity: 1000 }], discount: 5, customerId: null }))
  let workspace = await loadWorkspace(1)
  assert.match(workspace.state.draftAccountingIssue!, /whole Taka/)
  const receipt = makeReceipt(workspace.state, 345, 'cash')
  await assert.rejects(saveWorkspace({ ...workspace.state, receipts: [receipt], lines: [], discount: 0 }, workspace), error => error instanceof BackendError && error.status === 422)
  workspace = await saveWorkspace(workspace.state, workspace, { confirmDraft: true })
  assert.equal(workspace.state.draftAccountingIssue, undefined)
  assert.equal(JSON.parse(fixture.db.prepare('SELECT draft_json FROM terminal_drafts WHERE terminal_id=1').get()!.draft_json as string).currencyVersion, 2)
  assert.equal(fixture.db.prepare("SELECT COUNT(*) AS n FROM accounting_repairs WHERE table_name='terminal_drafts'").get()!.n, 1)
  workspace = await saveWorkspace({ ...workspace.state, receipts: [receipt], lines: [], discount: 0 }, workspace)
  assert.equal(workspace.state.receipts[0].total, 345)
})

test('explicit historical quarantine cannot be bypassed by matching currency fields', async t => {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const state = { ...workspace.state, lines: [{ productId: 'mouse-opt', quantity: 1000 }] }
  const receipt = makeReceipt(state, 350, 'cash')
  workspace = await saveWorkspace({ ...state, lines: [], receipts: [receipt] }, workspace)
  fixture.db.prepare('INSERT INTO accounting_quarantine (table_name, record_id, reason, details_json) VALUES (?, ?, ?, ?)')
    .run('receipts', receipt.id, 'Historical refund needs reconciliation', '{}')
  workspace = await loadWorkspace(1)
  assert.equal(workspace.state.receipts[0].accountingIssue, 'Historical refund needs reconciliation')
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1,
    returns: [{ id: 'quarantined-return', createdAt: receipt.createdAt, receiptId: receipt.id, method: 'cash', restock: false,
      refunded: 350, lines: [{ productId: 'mouse-opt', quantity: 1000 }] }] })
  assert.equal(response.status, 422)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('local seed values use whole Taka and contain no customer credit-limit fields', async t => {
  const fixture = connect(t)
  fixture.db.exec(readFileSync('scripts/seed_computer_products.sql', 'utf8'))
  const workspace = await loadWorkspace(1)
  const mouse = workspace.state.customProducts!.find(p => p.id === 'mouse-opt')!
  assert.equal(mouse.price, 350)
  assert.equal(mouse.cost, 240)
  assert.equal(mouse.inventoryValue, 10800)
  assert.equal(workspace.state.expenses![0].amount, 150)
  assert.equal(workspace.state.customCustomers!.find(c => c.id === 'local-test-due')!.openingBalance, 250)
  assert.ok(workspace.state.customCustomers!.every(c => !('creditLimit' in c)))
})

test('saved drafts cannot replace authoritative financial records and malformed drafts require review', async t => {
  const fixture = connect(t)
  fixture.db.prepare('INSERT INTO terminal_drafts (terminal_id, draft_json) VALUES (?, ?)').run(1,
    JSON.stringify({ lines: [], discount: 0, customerId: null, currencyVersion: 2, receipts: [{ id: 'forged-sale', total: 999999 }], terminalId: 999 }))
  let workspace = await loadWorkspace(1)
  assert.deepEqual(workspace.state.receipts, [])
  assert.equal(workspace.state.terminalId, 1)
  fixture.db.prepare('UPDATE terminal_drafts SET draft_json=? WHERE terminal_id=1').run(JSON.stringify({ lines: [null], discount: 'bad', customerId: 123 }))
  workspace = await loadWorkspace(1)
  assert.match(workspace.state.draftAccountingIssue!, /malformed/)
  assert.deepEqual(workspace.state.lines, [])
  workspace = await saveWorkspace(workspace.state, workspace, { confirmDraft: true })
  assert.equal(workspace.state.draftAccountingIssue, undefined)
  assert.deepEqual(workspace.state.receipts, [])
})

// Supplier ledger integration exercises the same atomic API used by all terminals.
const supplier = { id: 'supplier-a', name: 'Regular distributor', phone: '01711111111' }
async function supplierPurchase(t: any, paid = 4000) {
  const fixture = connect(t)
  let workspace = await loadWorkspace(1)
  const product: Product = { ...allProducts(initialState.customProducts)[0], id: 'supplier-product', code: 'SUP-01', stock: 2000, purchased: 2000 }
  const purchase = makePurchase([{ productId: product.id, quantity: 2000, unitCost: 5000, total: 10000 }], { supplierId: supplier.id, supplier: supplier.name, paid, method: 'cash', invoiceNumber: 'INV-01' })
  workspace = await saveWorkspace({ ...workspace.state, suppliers: [supplier], customProducts: [product], purchases: [purchase] }, workspace)
  return { ...fixture, workspace, product, purchase: workspace.state.purchases![0] }
}

const supplierPayment = (purchaseId: string, amount: number, id = 'supplier-payment') => ({ id, purchaseId, supplierId: supplier.id, amount, method: 'bank' as const, type: 'payment' as const, createdAt: new Date().toISOString() })

test('supplier credit purchase updates stock and confirmed due and later payment persists across terminals', async t => {
  const { workspace, purchase } = await supplierPurchase(t)
  const { purchaseAccount, supplierAccount } = await import('../src/model.ts')
  assert.equal(workspace.state.customProducts!.find(item => item.id === 'supplier-product')!.stock, 2000)
  assert.equal(purchase.invoiceNumber, 'INV-01')
  assert.equal(purchaseAccount(purchase).due, 6000)
  const saved = await saveWorkspace({ ...workspace.state, supplierPayments: [supplierPayment(purchase.id, 2000)] }, workspace)
  const latest = (await loadWorkspace(2)).state
  assert.equal(latest.suppliers![0].name, supplier.name)
  assert.equal(latest.customProducts!.find(item => item.id === 'supplier-product')!.stock, 2000)
  assert.equal(supplierAccount(supplier.id, latest.purchases!, latest.supplierPayments).due, 4000)
  assert.equal(saved.state.supplierPayments![0].method, 'bank')
})

test('supplier payment rejects overpayment, supplier mismatch, and conflicting payment ID atomically', async t => {
  const { workspace, purchase } = await supplierPurchase(t)
  for (const payment of [supplierPayment(purchase.id, 6001), { ...supplierPayment(purchase.id, 100), supplierId: 'unknown' }]) {
    await assert.rejects(saveWorkspace({ ...workspace.state, supplierPayments: [payment] }, workspace), error => error instanceof BackendError && error.status === 422)
    assert.deepEqual(await loadWorkspace(1), workspace)
  }
  const payment = supplierPayment(purchase.id, 2000)
  const saved = await saveWorkspace({ ...workspace.state, supplierPayments: [payment] }, workspace)
  const fixtureResponse = await globalThis.fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: saved.revision, terminalId: 1, supplierPayments: [{ ...payment, amount: 1 }] }) })
  assert.equal(fixtureResponse.status, 422)
  assert.equal((await loadWorkspace(1)).state.supplierPayments!.length, 1)
})

test('one-time purchases must be fully paid, and named supplier credit needs a saved identity', async t => {
  connect(t)
  const workspace = await loadWorkspace(1)
  const lines = [{ productId: allProducts(initialState.customProducts)[0].id, quantity: 1000, unitCost: 100, total: 100 }]
  for (const purchase of [makePurchase(lines, { supplier: 'Loose market seller', paid: 50, method: 'cash' }), makePurchase(lines, { supplierId: 'missing', paid: 50, method: 'cash' })]) {
    await assert.rejects(saveWorkspace({ ...workspace.state, purchases: [purchase] }, workspace), error => error instanceof BackendError && error.status === 422)
    assert.deepEqual(await loadWorkspace(1), workspace)
  }
  const purchase = makePurchase(lines, { supplier: 'Loose market seller', paid: 100, method: 'mobile' })
  const saved = await saveWorkspace({ ...workspace.state, purchases: [purchase] }, workspace)
  assert.equal(saved.state.purchases![0].paid, 100)
  assert.equal(saved.state.purchases![0].supplierId, undefined)
})

test('archiving preserves supplier history and permits repayment but prevents new purchases', async t => {
  const { workspace: initial, purchase } = await supplierPurchase(t)
  const archived = await saveWorkspace({ ...initial.state, suppliers: [{ ...supplier, archived: true }] }, initial)
  const nextPurchase = makePurchase(purchase.lines, { supplierId: supplier.id, supplier: supplier.name, paid: 0, method: 'cash' })
  await assert.rejects(saveWorkspace({ ...archived.state, purchases: [...archived.state.purchases!, nextPurchase] }, archived), error => error instanceof BackendError && error.status === 422)
  const paid = await saveWorkspace({ ...archived.state, supplierPayments: [supplierPayment(purchase.id, 6000)] }, archived)
  assert.equal(paid.state.suppliers![0].archived, true)
  assert.equal(paid.state.purchases!.length, 1)
})

test('paid purchase void requires a full explicit refund and preserves both cash movements', async t => {
  const { workspace, purchase } = await supplierPurchase(t, 10000)
  const { purchaseAccount, purchaseCashEntries } = await import('../src/model.ts')
  const voidedAt = new Date().toISOString()
  const voided = { ...purchase, voidedAt, voidReason: 'Wrong purchase' }
  await assert.rejects(saveWorkspace({ ...workspace.state, purchases: [voided] }, workspace), error => error instanceof BackendError && error.status === 422)
  const refund = { ...supplierPayment(purchase.id, 10000), type: 'refund' as const, note: 'Full amount received back', createdAt: voidedAt }
  const saved = await saveWorkspace({ ...workspace.state, purchases: [voided], supplierPayments: [refund] }, workspace)
  assert.equal(saved.state.customProducts!.find(item => item.id === 'supplier-product')!.stock, 0)
  assert.equal(purchaseAccount(saved.state.purchases![0], saved.state.supplierPayments).due, 0)
  assert.deepEqual(purchaseCashEntries(saved.state.purchases!, saved.state.supplierPayments).map(p => [p.type, p.amount]), [['payment', 10000], ['refund', 10000]])
})

test('supplier refunds without a matching void and refunds greater than payment are rejected', async t => {
  const { workspace, purchase } = await supplierPurchase(t)
  const refund = { ...supplierPayment(purchase.id, 4000), type: 'refund' as const, note: 'Refund' }
  await assert.rejects(saveWorkspace({ ...workspace.state, supplierPayments: [refund] }, workspace), error => error instanceof BackendError && error.status === 422)
  const voided = { ...purchase, voidedAt: new Date().toISOString(), voidReason: 'Correction' }
  await assert.rejects(saveWorkspace({ ...workspace.state, purchases: [voided], supplierPayments: [{ ...refund, amount: 4001 }] }, workspace), error => error instanceof BackendError && error.status === 422)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('legacy purchases acquire reviewed settlement once without changing stock or original history', async t => {
  connect(t)
  const { purchaseAccount, purchaseCashEntries } = await import('../src/model.ts')
  let workspace = await loadWorkspace(1)
  const legacy = makePurchase([{ productId: allProducts(initialState.customProducts)[0].id, quantity: 1000, unitCost: 10000, total: 10000 }], { supplier: 'Old seller text', createdAt: '2026-10-01T00:00:00Z' })
  workspace = await saveWorkspace({ ...workspace.state, suppliers: [supplier], purchases: [legacy] }, workspace)
  assert.equal(purchaseAccount(workspace.state.purchases![0]).known, false)
  assert.deepEqual(purchaseCashEntries(workspace.state.purchases!), [])
  const stock = workspace.state.customProducts![0].stock
  const review = { id: 'review-1', purchaseId: legacy.id, supplierId: supplier.id, paid: 4000, method: 'cash' as const, note: 'Confirmed against original invoice', createdAt: new Date().toISOString() }
  const saved = await saveWorkspace({ ...workspace.state, purchaseSettlements: [review] }, workspace)
  assert.equal(saved.state.customProducts![0].stock, stock)
  assert.equal(saved.state.purchases![0].supplier, 'Old seller text')
  assert.equal(purchaseAccount(saved.state.purchases![0], [], saved.state.purchaseSettlements).due, 6000)
  assert.equal(purchaseCashEntries(saved.state.purchases!, [], saved.state.purchaseSettlements)[0].createdAt, legacy.createdAt)
  await assert.rejects(saveWorkspace({ ...saved.state, purchaseSettlements: [...saved.state.purchaseSettlements!, { ...review, id: 'review-2' }] }, saved), error => error instanceof BackendError && error.status === 422)
})

test('a late supplier payment appears on its payment date and changes no stock', async t => {
  const { workspace, purchase } = await supplierPurchase(t, 0)
  const { purchaseCashEntries } = await import('../src/model.ts')
  const payment = supplierPayment(purchase.id, 6000)
  const saved = await saveWorkspace({ ...workspace.state, supplierPayments: [payment] }, workspace)
  assert.equal(saved.state.customProducts![0].stock, workspace.state.customProducts![0].stock)
  const entries = purchaseCashEntries(saved.state.purchases!, saved.state.supplierPayments)
  assert.equal(entries.find(p => p.amount === 6000)!.createdAt, payment.createdAt)
})

test('supplier and purchase rollback together when payment insertion fails', async t => {
  const { workspace, purchase, db } = await supplierPurchase(t)
  db.exec("CREATE TRIGGER fail_supplier_payment BEFORE INSERT ON supplier_payments BEGIN SELECT RAISE(ABORT, 'payment failure'); END")
  await assert.rejects(saveWorkspace({ ...workspace.state, suppliers: [{ ...supplier, name: 'Must roll back' }], supplierPayments: [supplierPayment(purchase.id, 1000)] }, workspace), error => error instanceof BackendError && error.status === 500)
  assert.deepEqual(await loadWorkspace(1), workspace)
})

test('concurrent supplier payments cannot exceed due or duplicate a lost acknowledgement', async t => {
  const { workspace, purchase, post } = await supplierPurchase(t)
  const responses = await Promise.all(['a','b'].map(id => post({ expectedRevision: workspace.revision, terminalId: 1, supplierPayments: [supplierPayment(purchase.id, 6000, id)] })))
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409])
  const latest = await loadWorkspace(1)
  assert.equal(latest.state.supplierPayments!.length, 1)
  await assert.rejects(saveWorkspace({ ...workspace.state, supplierPayments: [supplierPayment(purchase.id, 6000, 'retry')] }, workspace), error => error instanceof BackendError && error.status === 409)
})

test('new products may exist without stock or supplier and a purchase may include multiple products', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  const products = ['a','b'].map(id => ({ ...allProducts(initialState.customProducts)[0], id: `zero-${id}`, code: `ZERO-${id}`, stock: 0, purchased: 0 }))
  workspace = await saveWorkspace({ ...workspace.state, customProducts: products, suppliers: [supplier] }, workspace)
  assert.equal(workspace.state.purchases!.length, 0)
  const purchase = makePurchase(products.map(p => ({ productId: p.id, quantity: 1000, unitCost: 100, total: 100 })), { supplierId: supplier.id, supplier: supplier.name, paid: 0, method: 'cash' })
  const saved = await saveWorkspace({ ...workspace.state, purchases: [purchase] }, workspace)
  assert.equal(saved.state.purchases![0].lines.length, 2)
  assert.deepEqual(saved.state.customProducts!.filter(p => p.id.startsWith('zero-')).map(p => p.stock), [1000,1000])
})

async function invoiceFixture(t: any, quantity = 10000, total = 1001) {
  const fixture = connect(t)
  const { makeInvoice } = await import('../src/model.ts')
  let workspace = await loadWorkspace(1)
  const products = ['Logitech M185', 'A4Tech G3'].map((name,index) => ({ ...allProducts(initialState.customProducts)[0], id:`brand-${index}`, code:`BRAND-${index}`, en:name, stock:0, purchased:0 }))
  const invoice = makeInvoice([{ id:'mice', description:'Wireless mice — mixed brands', unit:'pc', quantity, total }], { supplierId:supplier.id, supplier:supplier.name, paid:0, method:'cash', invoiceNumber:'MIXED-01' })
  workspace = await saveWorkspace({ ...workspace.state, suppliers:[supplier], customProducts:products, purchases:[invoice] }, workspace)
  return { ...fixture, workspace, invoice:workspace.state.purchases![0], products }
}
const receiveRequest = (purchaseId: string, quantity: number, productId='brand-0', id=crypto.randomUUID()): StockReceiving => ({ id, purchaseId, createdAt:new Date().toISOString(), currencyVersion:2 as const, lines:[{ invoiceLineId:'mice', productId, quantity, total:999999, unitCost:999999 }] })

test('supplier invoice records payment and debt without changing stock or requiring product identities', async t => {
  const { workspace, invoice, products } = await invoiceFixture(t)
  const { invoiceReceivingStatus, purchaseAccount } = await import('../src/model.ts')
  assert.deepEqual(products.map(p => workspace.state.customProducts!.find(c => c.id === p.id)!.stock), [0,0])
  assert.deepEqual(invoice.lines, [])
  assert.equal(invoice.invoiceLines![0].description,'Wireless mice — mixed brands')
  assert.equal(purchaseAccount(invoice).due,1001)
  assert.equal(invoiceReceivingStatus(invoice).status,'awaitingStock')
  const saved = await saveWorkspace({ ...workspace.state, supplierPayments:[supplierPayment(invoice.id,400)] }, workspace)
  assert.equal(purchaseAccount(saved.state.purchases![0],saved.state.supplierPayments).due,601)
  assert.equal(saved.state.stockReceivings!.length,0)
})

test('partial receiving splits a generic invoice line across exact brands and conserves every Taka', async t => {
  const { workspace, invoice } = await invoiceFixture(t)
  const { invoiceReceivingStatus, purchaseAccount } = await import('../src/model.ts')
  let saved = await saveWorkspace({ ...workspace.state, stockReceivings:[receiveRequest(invoice.id,6000)] },workspace)
  assert.equal(saved.state.stockReceivings![0].lines[0].total,601)
  assert.equal(saved.state.customProducts!.find(p=>p.id==='brand-0')!.stock,6000)
  let status=invoiceReceivingStatus(saved.state.purchases![0],saved.state.stockReceivings)
  assert.equal(status.status,'partReceived')
  assert.equal(status.lines[0].remainingQuantity,4000)
  assert.equal(status.remainingValue,400)
  saved = await saveWorkspace({ ...saved.state, stockReceivings:[...saved.state.stockReceivings!,receiveRequest(invoice.id,4000,'brand-1')] },saved)
  status=invoiceReceivingStatus(saved.state.purchases![0],saved.state.stockReceivings)
  assert.equal(status.status,'received')
  assert.equal(status.remainingValue,0)
  assert.equal(saved.state.stockReceivings![1].lines[0].total,400)
  assert.equal(saved.state.customProducts!.find(p=>p.id==='brand-1')!.stock,4000)
  assert.equal(saved.state.customProducts!.filter(p=>p.id.startsWith('brand-')).reduce((s,p)=>s+(p.inventoryValue??0),0),1001)
  assert.equal(saved.state.purchases!.length,1)
  assert.equal(purchaseAccount(saved.state.purchases![0]).due,1001)
  assert.equal(saved.state.supplierPayments!.length,0)
})

test('one receiving batch can map one invoice line to several product codes with exact final remainder', async t => {
  const {workspace,invoice}=await invoiceFixture(t,3000,10)
  const first=receiveRequest(invoice.id,1000)
  const batch={...first,lines:[...first.lines,{...first.lines[0],productId:'brand-1',quantity:2000}]}
  const saved=await saveWorkspace({...workspace.state,stockReceivings:[batch]},workspace)
  assert.deepEqual(saved.state.stockReceivings![0].lines.map(l=>l.total),[3,7])
  assert.deepEqual(['brand-0','brand-1'].map(id=>saved.state.customProducts!.find(p=>p.id===id)!.stock),[1000,2000])
})

test('receiving rejects excess, wrong invoice line, unknown SKU, service, fractional pieces, and incompatible units atomically', async t => {
  const {workspace,invoice}=await invoiceFixture(t)
  const wrongUnit={...allProducts(initialState.customProducts)[0],id:'weight-item',code:'WEIGHT',unit:'kg' as const,stock:0,purchased:0}
  const saved=await saveWorkspace({...workspace.state,customProducts:[...workspace.state.customProducts!,wrongUnit]},workspace)
  const bad=[receiveRequest(invoice.id,11000),receiveRequest(invoice.id,1500),receiveRequest(invoice.id,1000,'missing'),receiveRequest(invoice.id,1000,'service-pc-clean'),receiveRequest(invoice.id,1000,wrongUnit.id),{...receiveRequest(invoice.id,1000),lines:[{...receiveRequest(invoice.id,1000).lines[0],invoiceLineId:'other-line'}]}]
  for(const r of bad){await assert.rejects(saveWorkspace({...saved.state,stockReceivings:[r]},saved),error=>error instanceof BackendError&&error.status===422);assert.deepEqual(await loadWorkspace(1),saved)}
})

test('receiving replay is immutable and duplicate receiving cannot add the completed invoice twice', async t => {
  const {workspace,invoice,post}=await invoiceFixture(t)
  const request=receiveRequest(invoice.id,10000,'brand-0','receive-once')
  let saved=await saveWorkspace({...workspace.state,stockReceivings:[request]},workspace)
  const response=await post({expectedRevision:saved.revision,terminalId:1,stockReceivings:[request]})
  assert.equal(response.status,200)
  saved=await loadWorkspace(1)
  assert.equal(saved.state.stockReceivings!.length,1)
  assert.equal(saved.state.customProducts!.find(p=>p.id==='brand-0')!.stock,10000)
  await assert.rejects(saveWorkspace({...saved.state,stockReceivings:[...saved.state.stockReceivings!,receiveRequest(invoice.id,1000)]},saved),error=>error instanceof BackendError&&error.status===422)
  const conflict=await post({expectedRevision:saved.revision,terminalId:1,stockReceivings:[{...request,lines:[{...request.lines[0],quantity:1000}]}]})
  assert.equal(conflict.status,422)
})

test('concurrent terminals cannot receive the same remaining invoice quantity twice', async t => {
  const {workspace,invoice,post}=await invoiceFixture(t)
  const responses=await Promise.all(['receive-a','receive-b'].map(id=>post({expectedRevision:workspace.revision,terminalId:1,stockReceivings:[receiveRequest(invoice.id,10000,'brand-0',id)]})))
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
  const latest=await loadWorkspace(2)
  assert.equal(latest.state.stockReceivings!.length,1)
  assert.equal(latest.state.customProducts!.find(p=>p.id==='brand-0')!.stock,10000)
})

test('stock receiving can create a zero-opening exact SKU in the same save and rolls back on SQL failure', async t => {
  const {workspace,invoice,db}=await invoiceFixture(t)
  const product={...allProducts(initialState.customProducts)[0],id:'new-inline-sku',code:'INLINE',stock:0,purchased:0}
  db.exec("CREATE TRIGGER fail_receiving BEFORE INSERT ON stock_receivings BEGIN SELECT RAISE(ABORT, 'receiving failure'); END")
  await assert.rejects(saveWorkspace({...workspace.state,customProducts:[...workspace.state.customProducts!,product],stockReceivings:[receiveRequest(invoice.id,1000,product.id)]},workspace),error=>error instanceof BackendError&&error.status===500)
  assert.deepEqual(await loadWorkspace(1),workspace)
  db.exec('DROP TRIGGER fail_receiving')
  await assert.rejects(saveWorkspace({...workspace.state,customProducts:[...workspace.state.customProducts!,{...product,stock:1000}],stockReceivings:[receiveRequest(invoice.id,1000,product.id)]},workspace),error=>error instanceof BackendError&&error.status===422) // Opening stock cannot be smuggled in alongside receiving.
  const confirmed=await saveWorkspace({...workspace.state,customProducts:[...workspace.state.customProducts!,product],stockReceivings:[receiveRequest(invoice.id,1000,product.id)]},workspace)
  assert.equal(confirmed.state.customProducts!.find(p=>p.id===product.id)!.stock,1000)
})

test('voiding an unconsumed invoice reverses only received stock and closes its pending balance', async t => {
  const {workspace,invoice}=await invoiceFixture(t)
  let saved=await saveWorkspace({...workspace.state,stockReceivings:[receiveRequest(invoice.id,6000)]},workspace)
  saved=await saveWorkspace({...saved.state,purchases:[{...saved.state.purchases![0],voidedAt:new Date().toISOString(),voidReason:'Canceled remaining delivery'}]},saved)
  assert.equal(saved.state.customProducts!.find(p=>p.id==='brand-0')!.stock,0)
  assert.equal(saved.state.customProducts!.find(p=>p.id==='brand-0')!.inventoryValue,0)
  assert.equal(saved.state.stockReceivings!.length,1)
  await assert.rejects(saveWorkspace({...saved.state,stockReceivings:[...saved.state.stockReceivings!,receiveRequest(invoice.id,4000)]},saved),error=>error instanceof BackendError&&error.status===422)
})

test('mixed-brand receiving supports different costs without losing invoice value', async t=>{
  const {workspace,invoice}=await invoiceFixture(t)
  const first=receiveRequest(invoice.id,6000)
  first.lines[0].allocatedCost=900
  let saved=await saveWorkspace({...workspace.state,stockReceivings:[first]},workspace)
  assert.equal(saved.state.stockReceivings![0].lines[0].total,900)
  saved=await saveWorkspace({...saved.state,stockReceivings:[...saved.state.stockReceivings!,receiveRequest(invoice.id,4000,'brand-1')]},saved)
  assert.equal(saved.state.stockReceivings![1].lines[0].total,101)
  assert.equal(saved.state.customProducts!.filter(p=>p.id.startsWith('brand-')).reduce((s,p)=>s+(p.inventoryValue??0),0),1001)
})

test('manual receiving costs cannot exceed invoice value or leave cost behind after full receipt', async t=>{
  const {workspace,invoice}=await invoiceFixture(t)
  for(const [quantity,cost] of [[1000,1002],[10000,1000], [1000,-1]]){
    const request=receiveRequest(invoice.id,quantity)
    request.lines[0].allocatedCost=cost
    await assert.rejects(saveWorkspace({...workspace.state,stockReceivings:[request]},workspace),error=>error instanceof BackendError&&error.status===422)
    assert.deepEqual(await loadWorkspace(1),workspace)
  }
})

test('invoice stock that has been sold cannot be voided and its receiving history stays intact', async t=>{
  const {workspace,invoice}=await invoiceFixture(t)
  let saved=await saveWorkspace({...workspace.state,stockReceivings:[receiveRequest(invoice.id,6000)]},workspace)
  const sale=makeReceipt({...saved.state,lines:[{productId:'brand-0',quantity:1000}]},1000,'cash')
  saved=await saveWorkspace({...saved.state,receipts:[sale]},saved)
  await assert.rejects(saveWorkspace({...saved.state,purchases:[{...saved.state.purchases![0],voidedAt:new Date().toISOString(),voidReason:'Must preserve sold inventory'}]},saved),error=>error instanceof BackendError&&error.status===422)
  assert.deepEqual(await loadWorkspace(1),saved)
})

test('exact stock identity rejects duplicate product codes and changes to established stock units',async t=>{
  const {workspace}=await invoiceFixture(t)
  const duplicate={...allProducts(initialState.customProducts)[0],id:'duplicate-brand-code',code:'brand-0',stock:0,purchased:0}
  await assert.rejects(saveWorkspace({...workspace.state,customProducts:[...workspace.state.customProducts!,duplicate]},workspace),error=>error instanceof BackendError&&error.status===422)
  const changed=workspace.state.customProducts!.map(p=>p.id==='brand-0'?{...p,unit:'kg' as const}:p)
  await assert.rejects(saveWorkspace({...workspace.state,customProducts:changed},workspace),error=>error instanceof BackendError&&error.status===422)
  assert.deepEqual(await loadWorkspace(1),workspace)
})

test('manual prices persist through draft reload, sale, refund, and immutable receipt checks', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [{ productId: 'mouse-opt', quantity: 3000, unitPrice: 450 }] }, workspace)
  workspace = await loadWorkspace(1)
  assert.equal(workspace.state.lines[0].unitPrice, 450)
  const receipt = makeReceipt(workspace.state, 1350, 'cash', 1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [], receipts: [receipt] }, workspace)
  const saved = (await loadWorkspace(2)).state.receipts[0]
  assert.equal(saved.total, 1350)
  assert.equal(saved.lines[0].product.price, 450)
  assert.equal(saved.lines[0].unitPrice, 450)
  const returned = makeReturn(saved, [{ productId: 'mouse-opt', quantity: 1000 }], { method: 'cash', restock: true, priorReturns: [] })
  assert.equal(returned.refunded, 450)
  workspace = await saveWorkspace({ ...workspace.state, returns: [returned] }, workspace)
  assert.equal(workspace.state.returns![0].refunded, 450)
  const changed = { ...saved, lines: saved.lines.map(line => ({ ...line, unitPrice: 500 })) }
  await assert.rejects(() => saveWorkspace({ ...workspace.state, receipts: [changed] }, workspace), /immutable|changed|conflict/i)
})

test('exchange replacements retain manually entered prices on both terminals', async t => {
  connect(t)
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [{ productId: 'mouse-opt', quantity: 1000, unitPrice: 450 }] }, workspace)
  const receipt = makeReceipt(workspace.state, 450, 'cash', 1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [], receipts: [receipt] }, workspace)
  const saved = workspace.state.receipts[0]
  const replacement = makeReturnExchange(saved, [{ productId: 'mouse-opt', quantity: 1000, condition: 'sellable' }], [{ productId: 'keyboard-usb', quantity: 1000, unitPrice: 600 }], {
    catalog: allProducts(workspace.state.customProducts), receipts: workspace.state.receipts, priorReturns: [], customerDue: 0, received: 150, method: 'cash', issueCredit: false, reason: 'Replace mouse with keyboard', operator: 'Test operator',
  })
  workspace = await saveWorkspace({ ...workspace.state, returns: [replacement] }, workspace)
  const returned = (await loadWorkspace(2)).state.returns![0]
  assert.equal(returned.replacementLines![0].unitPrice, 600)
  assert.equal(returned.replacementLines![0].product.price, 600)
  assert.equal(returned.replacementLines![0].amount, 600)
  assert.equal(returned.settlement!.received, 150)
})
test('repair-job migration preserves historical snapshots and blocks old amount drafts', async t => {
  const fixture = connect(t)
  const service = allProducts(initialState.customProducts).find(p => p.id === 'service-custom')!
  let workspace = await loadWorkspace(1)
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [service] }, workspace)
  const historical = makeReceipt({ ...workspace.state, lines: [{ productId: service.id, quantity: 1000, unitPrice: 500 }] }, 500, 'cash', 1)
  workspace = await saveWorkspace({ ...workspace.state, receipts: [historical] }, workspace)
  const oldPayload = JSON.parse(fixture.db.prepare('SELECT payload_json FROM receipts WHERE id = ?').get(historical.id)!.payload_json as string)
  oldPayload.lines[0].quantity = 500000
  oldPayload.lines[0].price = 1
  oldPayload.lines[0].product.price = 1
  oldPayload.lines[0].product.unit = 'BDT'
  delete oldPayload.lines[0].unitPrice
  fixture.db.prepare('UPDATE receipts SET payload_json = ? WHERE id = ?').run(JSON.stringify(oldPayload), historical.id)
  fixture.db.exec("UPDATE custom_products SET unit = 'BDT', art = 'cleaner' WHERE id = 'service-custom'")
  const oldDraft = { lines: [{ productId: service.id, quantity: 500000 }], discount: 0, customerId: null, currencyVersion: 2 }
  fixture.db.prepare('INSERT INTO terminal_drafts (terminal_id, draft_json) VALUES (?, ?)').run(1, JSON.stringify(oldDraft))
  fixture.db.exec(readFileSync('migrations/0013_manual_sale_prices.sql', 'utf8'))
  workspace = await loadWorkspace(1)
  assert.equal(workspace.state.lines[0].legacyAmount, true)
  assert.equal(workspace.state.receipts[0].lines[0].product.unit, 'BDT')
  assert.equal(workspace.state.receipts[0].lines[0].product.price, 1)
  assert.equal(workspace.state.receipts[0].lines[0].quantity, 500000)
  assert.equal(workspace.state.receipts[0].total, 500)
  assert.equal(allProducts(workspace.state.customProducts).find(p => p.id === service.id)!.unit, 'pc')
  assert.throws(() => makeReceipt(workspace.state, 500, 'cash'), /legacyAmount/)
  const response = await fixture.post({ expectedRevision: workspace.revision, terminalId: 1, receipts: [{ id: 'legacy-attempt', number: 100001, createdAt: new Date().toISOString(), customer: null, lines: [{ productId: service.id, quantity: 500000 }], discount: 0, tendered: 500, method: 'cash', total: 500 }] })
  assert.equal(response.status, 422)
  workspace = await saveWorkspace({ ...workspace.state, lines: [] }, workspace)
  workspace = await saveWorkspace({ ...workspace.state, lines: [{ productId: service.id, quantity: 1000, unitPrice: 500 }] }, workspace)
  const receipt = makeReceipt(workspace.state, 500, 'cash', 1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [], receipts: [...workspace.state.receipts, receipt] }, workspace)
  assert.equal(workspace.state.receipts.find(r => r.id === receipt.id)!.total, 500)
  assert.equal(workspace.state.receipts.find(r => r.id === receipt.id)!.lines[0].quantity, 1000)
  assert.equal(fixture.db.prepare('SELECT payload_json FROM receipts WHERE id = ?').get(historical.id)!.payload_json, JSON.stringify(oldPayload))
})

test('supplier stock receiving accepts an item without a configured selling price', async t => {
  const { workspace: initial, invoice } = await invoiceFixture(t)
  let workspace = initial
  const product: Product = { ...allProducts(initialState.customProducts)[0], id: 'unpriced-mouse', code: 'UNPRICED', en: 'Mouse with manual checkout price', price: parseReferencePrice('')!, stock: 0, purchased: 0 }
  workspace = await saveWorkspace({ ...workspace.state, customProducts: [...workspace.state.customProducts!, product] }, workspace)
  workspace = await saveWorkspace({ ...workspace.state, stockReceivings: [receiveRequest(invoice.id, 10000, product.id)] }, workspace)
  const received = (await loadWorkspace(2)).state.customProducts!.find(item => item.id === product.id)!
  assert.equal(received.price, 0)
  assert.equal(received.stock, 10000)
  assert.equal(received.inventoryValue, invoice.total)
  workspace = await saveWorkspace({ ...workspace.state, lines: [{ productId: product.id, quantity: 1000, unitPrice: 450 }] }, workspace)
  const receipt = makeReceipt(workspace.state, 450, 'cash', 1)
  workspace = await saveWorkspace({ ...workspace.state, lines: [], receipts: [receipt] }, workspace)
  assert.equal(workspace.state.receipts[0].lines[0].product.price, 450)
  assert.equal(workspace.state.customProducts!.find(item => item.id === product.id)!.price, 0)
})
