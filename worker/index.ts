import {
  buildCatalog,
  computePurchaseTotal,
  computeReceipt,
  computeReturn,
  receiptForReturn,
  storedReceiptLines,
  storedReturnLines,
  type ComputedReceipt,
  type PriorReturnLine,
  type ReceiptForReturn,
} from './recalc'
import { InventoryLedger, initializeValuations } from './inventory'
import { authResponse, handleAuth, hasSession, sameOrigin } from './auth'
import { parseMutationPayload, ValidationError, type Rejection, type MutationInput } from './validate'
import { allCustomers, allProducts, customerBalance, findCustomerIn, findProductIn, normalizeProductUnit, receiptOutstandingDue, proportionalAmount, purchaseAccount, makeStockReceiving, type StockReceiving, isService, costStatusOf, type Product, type ShopState, type Receipt, type Return, type StockAdjustment, type Purchase } from '../src/model'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  })
}

function parseJson(text: string | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function currencyIssue(payload: any, row: any): string | undefined {
  if (!payload || typeof payload !== 'object') return 'Historical payload is missing; reconciliation is required.'
  for (const field of ['subtotal', 'discount', 'total', 'paid', 'tendered', 'change', 'due', 'refunded']) {
    if (typeof row[field] === 'number' && typeof payload[field] === 'number' && row[field] !== payload[field]) return 'Historical monetary units disagree. Run the accounting repair before using this record.'
  }
  if (typeof row.subtotal === 'number') {
    const gross = storedReceiptLines(payload).reduce((sum, l) => sum + (l.gross ?? Math.round(l.price * l.quantity / 1000)), 0)
    if (gross !== row.subtotal || row.subtotal - row.discount !== row.total) return 'Historical receipt lines do not reconcile with the bill total.'
  }
  if (typeof row.total === 'number' && row.subtotal === undefined && Array.isArray(payload.lines)
    && (payload.mode === 'invoice' ? payload.invoiceLines ?? [] : payload.lines).reduce((sum: number, l: any) => sum + (l.total ?? 0), 0) !== row.total) return 'Historical purchase lines do not reconcile with its total.'
  if (payload.settlement && typeof row.refunded === 'number') {
    const s = payload.settlement
    if (s.dueReduced + s.exchangeCredit + s.payout + s.creditIssued !== row.refunded) return 'Historical return settlement does not reconcile with its refund.'
  }
}

const canonicalDate = (value: string) => new Date(value).toISOString()
function immutableReceipt(r: any) {
  return { id: r.id, number: r.number, createdAt: canonicalDate(r.createdAt), customerId: r.customerId ?? r.customer?.id ?? null,
    lines: r.lines.map((l: any) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice ?? null })), discount: r.discount,
    tendered: r.tendered, method: r.method, creditApplied: r.creditApplied ?? 0, address: r.address ?? '', remarks: r.remarks ?? '', preparedBy: r.preparedBy ?? '' }
}
function immutableReturn(r: any) {
  return { id: r.id, createdAt: canonicalDate(r.createdAt), receiptId: r.receiptId, method: r.method, restock: r.restock, refunded: r.refunded,
    lines: r.lines.map((l: any) => ({ productId: l.productId, quantity: l.quantity, condition: r.conditions?.[l.productId] ?? l.condition ?? null })),
    replacementLines: (r.replacementLines ?? []).map((l: any) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice ?? null, amount: l.amount, cost: l.cost })),
    settlement: r.settlement ?? null, note: r.note ?? '', reason: r.reason ?? '', operator: r.operator ?? '' }
}
function immutablePurchase(p: any) { return { id: p.id, createdAt: canonicalDate(p.createdAt), lines: p.lines, mode: p.mode ?? null, invoiceLines: p.invoiceLines ?? null, supplier: p.supplier ?? '', supplierId: p.supplierId ?? null, paid: p.paid ?? null, invoiceNumber: p.invoiceNumber ?? '', method: p.method ?? null, note: p.note ?? '' } }
function stable(value: any): string { return JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v) }
function filterImmutable<T extends { id: string }>(incoming: T[], existing: any[], normalize: (v: any) => unknown, name: string): T[] {
  const prior = new Map(existing.map(v => [v.id, stable(normalize(v))]))
  const accepted: T[] = []
  for (const record of incoming) {
    const signature = stable(normalize(record))
    if (prior.has(record.id)) {
      if (prior.get(record.id) !== signature) throw new ValidationError(`${name} ${record.id}: conflicting reuse of an immutable record ID`)
      continue
    }
    prior.set(record.id, signature)
    accepted.push(record)
  }
  return accepted
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

function chunks<T>(list: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < list.length; index += size) groups.push(list.slice(index, index + size))
  return groups
}

// D1 caps bound parameters per query, so IN (...) lookups are issued in small groups.
async function loadStoredReceipts(env: Env, ids: string[]): Promise<Map<string, ReceiptForReturn>> {
  const stored = new Map<string, ReceiptForReturn>()
  for (const group of chunks(dedupe(ids), 50)) {
    const rows = await env.DB.prepare(
      `SELECT id, receipt_number, created_at, customer_id, discount, due, payload_json FROM receipts WHERE id IN (${group.map(() => '?').join(',')})`
    ).bind(...group).all<{ id: string; receipt_number: number; created_at: string; customer_id: string | null; discount: number; due: number; payload_json: string | null }>()
    for (const row of rows.results ?? []) {
      stored.set(row.id, {
        id: row.id,
        number: row.receipt_number,
        createdAt: row.created_at,
        customerId: row.customer_id,
        discount: row.discount,
        due: row.due,
        lines: storedReceiptLines(parseJson(row.payload_json)),
      })
    }
  }
  return stored
}

async function loadPriorReturns(env: Env, receiptIds: string[]): Promise<Map<string, PriorReturnLine[]>> {
  const prior = new Map<string, PriorReturnLine[]>()
  for (const group of chunks(dedupe(receiptIds), 50)) {
    const rows = await env.DB.prepare(
      `SELECT id, receipt_id, payload_json FROM returns WHERE receipt_id IN (${group.map(() => '?').join(',')})`
    ).bind(...group).all<{ id: string; receipt_id: string; payload_json: string | null }>()
    for (const row of rows.results ?? []) {
      const payload = parseJson(row.payload_json) as any
      const lines = storedReturnLines(payload).map((line, index) => ({ id: row.id, ...line, ...(index === 0 ? { dueReduced: payload?.settlement?.dueReduced ?? (payload?.method === 'due' ? payload?.refunded ?? 0 : 0) } : {}) }))
      prior.set(row.receipt_id, [...(prior.get(row.receipt_id) ?? []), ...lines])
    }
  }
  return prior
}

async function loadPurchaseIds(env: Env, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (const group of chunks(dedupe(ids), 50)) {
    const rows = await env.DB.prepare(
      `SELECT id FROM purchases WHERE id IN (${group.map(() => '?').join(',')})`
    ).bind(...group).all<{ id: string }>()
    for (const row of rows.results ?? []) found.add(row.id)
  }
  return found
}

export function buildWorkspaceFromRelational(records: {
  receipts: any[]
  transactions: any[]
  purchases: any[]
  expenses: any[]
  adjustments: any[]
  returns: any[]
  purchaseVoids: any[]
  customProducts: any[]
  customCustomers: any[]
  suppliers?: any[]
  supplierPayments?: any[]
  purchaseSettlements?: any[]
  stockReceivings?: any[]
}): any {
  const customProducts = (records.customProducts || []).map((product: any) => ({ ...product, unit: normalizeProductUnit(product.unit) }))
  const catalog = allProducts(customProducts)
  const custCatalog = allCustomers(records.customCustomers)
  const voidMap = new Map((records.purchaseVoids || []).map((v) => [v.purchaseId, v]))
  const purchases = (records.purchases || []).map((p) => {
    const v = voidMap.get(p.id)
    const normalized = { ...p, ...(p.invoiceLines ? { invoiceLines: p.invoiceLines.map((line: any) => ({ ...line, unit: normalizeProductUnit(line.unit) })) } : {}) }
    if (v) {
      return {
        ...normalized,
        voidedAt: v.createdAt,
        ...(v.reason ? { voidReason: v.reason } : {}),
      }
    }
    return normalized
  })

  const receipts = (records.receipts || []).map((r) => {
    const custId = r.customer?.id || r.customerId
    const currentCustomer = custId ? findCustomerIn(custId, custCatalog) : null
    const rawCustomer = r.customer && r.customer.en ? r.customer : currentCustomer ?? r.customer ?? null
    const customer = rawCustomer ? { id: rawCustomer.id, en: rawCustomer.en ?? '', bn: rawCustomer.bn ?? '', phone: rawCustomer.phone ?? '',
      ...(rawCustomer.address ? { address: rawCustomer.address } : {}),
      ...(currentCustomer?.openingBalance !== undefined ? { openingBalance: currentCustomer.openingBalance } : rawCustomer.openingBalance !== undefined ? { openingBalance: rawCustomer.openingBalance } : {}),
      ...(currentCustomer?.accountingIssue ? { accountingIssue: currentCustomer.accountingIssue } : {}),
    } : null
    const lines = (r.lines || []).map((line: any) => {
      const product = line.product ?? findProductIn(line.productId, catalog)
      return { ...line, ...(line.unit ? { unit: normalizeProductUnit(line.unit) } : {}), costStatus: line.costStatus ?? (line.product ? costStatusOf(line.product) : 'unverified'), product: { ...product, unit: normalizeProductUnit(line.unit ?? product.unit), price: line.price ?? product.price, kind: line.kind ?? product.kind, cost: line.costStatus === 'unassigned' ? undefined : line.cost ?? product.cost, warranty: line.warranty ?? line.product?.warranty ?? '' } }
    })
    return {
      ...r,
      customer,
      lines,
    }
  })

  return {
    version: 2,
    lines: [],
    discount: 0,
    customerId: null,
    receipts,
    customCustomers: records.customCustomers || [],
    customProducts,
    transactions: records.transactions || [],
    purchases,
    suppliers: records.suppliers ?? [],
    supplierPayments: records.supplierPayments ?? [],
    purchaseSettlements: records.purchaseSettlements ?? [],
    stockReceivings: records.stockReceivings ?? [],
    expenses: records.expenses || [],
    adjustments: records.adjustments || [],
    returns: (records.returns || []).map(r => ({ ...r,
      lines: (r.lines ?? []).map((line: any) => ({ ...line, ...(line.unit ? { unit: normalizeProductUnit(line.unit) } : {}) })),
      replacementLines: (r.replacementLines ?? []).map((line: any) => {
        const product = line.product ?? findProductIn(line.productId, catalog)
        return { ...line, ...(line.unit ? { unit: normalizeProductUnit(line.unit) } : {}), product: { ...product, unit: normalizeProductUnit(line.unit ?? product.unit), price: line.quantity ? Math.round(line.amount * 1000 / line.quantity) : product.price }, costStatus: line.costStatus ?? (line.product ? costStatusOf(line.product) : 'unverified') }
      })
    })),
  }
}

export async function queryWorkspace(env: Env, terminalId: number, writes: D1PreparedStatement[] = []) {
  const queries = [
    env.DB.prepare('SELECT id, receipt_number, created_at, customer_id, subtotal, discount, total, paid, tendered, change, due, method, address, remarks, payload_json FROM receipts ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT id, customer_id, type, amount, created_at, note, receipt_id FROM account_transactions ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT id, created_at, supplier, method, note, total, payload_json FROM purchases ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT id, created_at, category, amount, method, note FROM expenses ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT id, created_at, product_id, quantity, reason, counted, note, cost_amount FROM stock_adjustments ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT id, created_at, receipt_id, receipt_number, customer_id, refunded, method, restock, note, payload_json FROM returns ORDER BY created_at ASC, id ASC'),
    env.DB.prepare('SELECT purchase_id, created_at, reason FROM purchase_voids ORDER BY created_at ASC, purchase_id ASC'),
    env.DB.prepare('SELECT id, code, en, bn, category, unit, price, cost, stock, purchased, kind, group_id, variant_name, variant_name_bn, archived, art, color, detail, detail_bn, warranty, updated_at, inventory_value, valuation_status FROM custom_products ORDER BY updated_at ASC'),
    env.DB.prepare('SELECT id, en, bn, phone, address, opening_balance, note, updated_at FROM custom_customers ORDER BY updated_at ASC'),
    env.DB.prepare('SELECT revision FROM app_revision WHERE id = 1'),
    env.DB.prepare('SELECT draft_json FROM terminal_drafts WHERE terminal_id = ?').bind(terminalId),
    env.DB.prepare('SELECT table_name, record_id, reason FROM accounting_quarantine'),
    env.DB.prepare('SELECT payload_json FROM suppliers ORDER BY id'),
    env.DB.prepare('SELECT payload_json FROM supplier_payments ORDER BY id'),
    env.DB.prepare('SELECT payload_json FROM purchase_settlements ORDER BY id'),
    env.DB.prepare('SELECT payload_json FROM stock_receivings ORDER BY created_at, id'),
  ]
  const results = (await env.DB.batch([...writes, ...queries])).slice(writes.length)
  const [rReceipts, rTx, rPurchases, rExpenses, rAdj, rReturns, rVoids, rProds, rCusts, rRevision, rDraft, rQuarantine, rSuppliers, rSupplierPayments, rSettlements, rReceivings] = results

  const receipts = (rReceipts.results ?? []).map((row: any) => {
    const payload = parseJson(row.payload_json) as any
    return {
      id: row.id,
      number: row.receipt_number,
      createdAt: row.created_at,
      customerId: row.customer_id,
      customer: payload?.customer ?? (row.customer_id ? { id: row.customer_id } : null),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      paid: row.paid,
      tendered: row.tendered,
      change: row.change,
      due: row.due,
      method: row.method as any,
      ...(payload?.creditApplied ? { creditApplied: payload.creditApplied } : {}),
      ...(payload?.currencyVersion ? { currencyVersion: payload.currencyVersion } : {}),
      ...(currencyIssue(payload, row) ? { accountingIssue: currencyIssue(payload, row) } : {}),
      address: row.address || undefined,
      remarks: row.remarks || undefined,
      preparedBy: typeof payload?.preparedBy === 'string' ? payload.preparedBy : undefined,
      lines: payload?.lines ?? [],
    }
  })

  const transactions = (rTx.results ?? []).map((row: any) => ({
    id: row.id,
    customerId: row.customer_id,
    type: row.type,
    amount: row.amount,
    createdAt: row.created_at,
    ...(row.note ? { note: row.note } : {}),
    ...(row.receipt_id ? { receiptId: row.receipt_id } : {}),
  }))

  const purchases = (rPurchases.results ?? []).map((row: any) => {
    const payload = parseJson(row.payload_json) as any
    return {
      id: row.id,
      createdAt: row.created_at,
      lines: payload?.lines ?? [],
      ...(payload?.currencyVersion ? { currencyVersion: payload.currencyVersion } : {}),
      ...(currencyIssue(payload, row) ? { accountingIssue: currencyIssue(payload, row) } : {}),
      total: row.total,
      ...(payload?.supplierId ? { supplierId: payload.supplierId } : {}),
      ...(payload?.paid !== undefined ? { paid: payload.paid } : {}),
      ...(payload?.invoiceNumber ? { invoiceNumber: payload.invoiceNumber } : {}),
      ...(payload?.mode === 'invoice' ? { mode: 'invoice' as const, invoiceLines: payload.invoiceLines ?? [] } : {}),
      ...(row.supplier ? { supplier: row.supplier } : {}),
      ...(row.method ? { method: row.method } : {}),
      ...(row.note ? { note: row.note } : {}),
    }
  })

  const expenses = (rExpenses.results ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    category: row.category,
    amount: row.amount,
    method: row.method,
    ...(row.note ? { note: row.note } : {}),
  }))

  const adjustments = (rAdj.results ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    productId: row.product_id,
    quantity: row.quantity,
    reason: row.reason,
    ...(row.cost_amount !== null && row.cost_amount !== undefined ? { costAmount: row.cost_amount } : {}),
    ...(row.counted !== null && row.counted !== undefined ? { counted: row.counted } : {}),
    ...(row.note ? { note: row.note } : {}),
  }))

  const returns = (rReturns.results ?? []).map((row: any) => {
    const payload = parseJson(row.payload_json) as any
    return {
      id: row.id,
      createdAt: row.created_at,
      receiptId: row.receipt_id,
      receiptNumber: row.receipt_number,
      ...(row.customer_id ? { customerId: row.customer_id } : {}),
      lines: payload?.lines ?? [],
      ...(payload?.currencyVersion ? { currencyVersion: payload.currencyVersion } : {}),
      ...(currencyIssue(payload, row) ? { accountingIssue: currencyIssue(payload, row) } : {}),
      refunded: row.refunded,
      method: row.method,
      restock: Boolean(row.restock),
      ...(row.note ? { note: row.note } : {}),
      ...(payload?.settlement ? { settlement: payload.settlement, replacementLines: payload.replacementLines ?? [], reason: payload.reason, operator: payload.operator } : {}),
    }
  })

  const purchaseVoids = (rVoids.results ?? []).map((row: any) => ({
    purchaseId: row.purchase_id,
    createdAt: row.created_at,
    ...(row.reason ? { reason: row.reason } : {}),
  }))

  const customProducts = (rProds.results ?? []).map((row: any) => ({
    id: row.id,
    code: row.code,
    en: row.en,
    category: row.category,
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    ...(row.inventory_value !== null && row.inventory_value !== undefined ? { inventoryValue: row.inventory_value } : {}),
    ...(row.valuation_status ? { valuationStatus: row.valuation_status } : {}),
    ...(row.kind === 'service' ? { kind: 'service' } : {}),
    art: row.art ?? 'daily',
    color: row.color ?? '#ffffff',
    detail: row.detail ?? '',
    detailBn: row.detail_bn ?? '',
    warranty: row.warranty ?? '',
    ...(row.cost !== null && row.cost !== undefined ? { cost: row.cost } : {}),
    ...(row.purchased !== null && row.purchased !== undefined ? { purchased: row.purchased } : {}),
    ...(row.group_id ? { groupId: row.group_id } : {}),
    ...(row.variant_name ? { variantName: row.variant_name } : {}),
    ...(row.archived ? { archived: true } : {}),
    ...(row.updated_at ? { updated_at: row.updated_at } : {}),
  }))

  const customCustomers = (rCusts.results ?? []).map((row: any) => ({
    id: row.id,
    en: row.en,
    bn: row.bn ?? '',
    phone: row.phone ?? '',
    ...(row.address ? { address: row.address } : {}),
    ...(row.opening_balance !== null && row.opening_balance !== undefined ? { openingBalance: row.opening_balance } : {}),
    ...(row.note ? { note: row.note } : {}),
    ...(row.updated_at ? { updated_at: row.updated_at } : {}),
  }))

  const quarantines = rQuarantine.results ?? []
  for (const q of quarantines as any[]) {
    const list = q.table_name === 'receipts' ? receipts : q.table_name === 'purchases' ? purchases : q.table_name === 'returns' ? returns : q.table_name === 'account_transactions' ? transactions : q.table_name === 'custom_customers' ? customCustomers : null
    const record: any = list?.find(r => r.id === q.record_id)
    if (record) record.accountingIssue = q.reason
    if (q.table_name === 'custom_products') { const product = customProducts.find(p => p.id === q.record_id); if (product) { product.valuationStatus = 'unverified'; product.inventoryValue = undefined } }
  }
  const readPayloads = (result: D1Result) => (result.results ?? []).map((row: any) => parseJson(row.payload_json))
  const records = { receipts, transactions, purchases, expenses, adjustments, returns, purchaseVoids, customProducts, customCustomers,
    suppliers: readPayloads(rSuppliers), supplierPayments: readPayloads(rSupplierPayments), purchaseSettlements: readPayloads(rSettlements), stockReceivings: readPayloads(rReceivings) }
  const rawDraft = parseJson((rDraft.results?.[0] as { draft_json: string } | undefined)?.draft_json ?? null) as Record<string, unknown> | null
  const linesValid = Array.isArray(rawDraft?.lines) && rawDraft.lines.every((line: any) => line && typeof line.productId === 'string' && Number.isSafeInteger(line.quantity) && line.quantity > 0 && (line.unitPrice === undefined || (Number.isSafeInteger(line.unitPrice) && line.unitPrice > 0 && line.unitPrice <= 100000000)))
  const discountValid = Number.isSafeInteger(rawDraft?.discount) && (rawDraft!.discount as number) >= 0
  const customerValid = rawDraft?.customerId === null || typeof rawDraft?.customerId === 'string'
  const draft: Pick<ShopState, 'lines' | 'discount' | 'customerId'> | null = rawDraft ? {
    lines: linesValid ? (rawDraft.lines as ShopState['lines']).map(line => customProducts.some(p => p.id === line.productId && p.unit === 'BDT') ? { ...line, legacyAmount: true } : line) : [],
    discount: discountValid ? rawDraft.discount as number : 0,
    customerId: customerValid ? rawDraft.customerId as string | null : null,
  } : null
  const draftIssue = (quarantines as any[]).find(q => q.table_name === 'terminal_drafts' && String(q.record_id) === String(terminalId))?.reason
    ?? (rawDraft && (!linesValid || !discountValid || !customerValid) ? 'The saved draft is malformed. Review its discount or clear the draft.'
      : draft?.discount && rawDraft?.currencyVersion !== 2 ? 'Review and confirm this saved discount in whole Taka before checkout.' : undefined)
  const state = buildWorkspaceFromRelational(records) as ShopState
  if (draftIssue) state.draftAccountingIssue = draftIssue
  const initialized = initializeValuations(state)
  state.customProducts = [...state.customProducts ?? [], ...initialized.filter(p => !state.customProducts?.some(c => c.id === p.id))].map(p => initialized.find(i => i.id === p.id) ?? p)
  state.accountingIssues = [...receipts.map(r => ({ ...r, table: 'receipts' })), ...purchases.map(p => ({ ...p, table: 'purchases' })), ...returns.map(r => ({ ...r, table: 'returns' }))].filter(r => r.accountingIssue).map(r => ({ table: r.table, id: r.id, reason: r.accountingIssue! }))
  if (draftIssue && !state.accountingIssues.some(r => r.table === 'terminal_drafts' && r.id === String(terminalId))) state.accountingIssues.push({ table: 'terminal_drafts', id: String(terminalId), reason: draftIssue })
  for (const q of quarantines as any[]) if (!state.accountingIssues.some(r => r.table === q.table_name && r.id === q.record_id)) state.accountingIssues.push({ table: q.table_name, id: q.record_id, reason: q.reason })
  return {
    ok: true,
    revision: (rRevision.results?.[0] as { revision: number }).revision,
    state: { ...state, ...draft, terminalId },
  }
}

export async function handleMutation(request: Request, env: Env): Promise<Response> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  // Parse every section before constructing the atomic operation.
  let input: MutationInput
  try {
    input = parseMutationPayload(raw)
  } catch (error) {
    if (error instanceof ValidationError) return jsonResponse({ error: error.message }, 400)
    throw error
  }

  const rejected: Rejection[] = input.rejected
  const statements: D1PreparedStatement[] = []
  const revision = await env.DB.prepare('SELECT revision FROM app_revision WHERE id = 1').first<{ revision: number }>()
  if (revision?.revision !== input.expectedRevision) {
    return jsonResponse({ error: 'Data changed on another terminal. Refresh before trying again.', code: 'conflict' }, 409)
  }

  const { state: history, revision: historyRevision } = await queryWorkspace(env, input.terminalId)
  if (historyRevision !== input.expectedRevision) return jsonResponse({ error: 'Data changed on another terminal. Refresh before trying again.', code: 'conflict' }, 409)
  if (history.draftAccountingIssue && (input.receipts.length || (input.draft && input.draft.discount !== 0 && !input.confirmDraft))) return jsonResponse({ error: history.draftAccountingIssue }, 422)
  if (input.receipts.length && history.lines.some(line => line.legacyAmount)) return jsonResponse({ error: 'Remove and add old amount-based draft services again before checkout.' }, 422)
  if (input.customProducts.some(product => product.unit === 'BDT')) return jsonResponse({ error: 'New items must use product or repair-job units and computer-shop artwork.' }, 422)
  let inventory: InventoryLedger
  const newAdjustments: StockAdjustment[] = []
  const newSales: Receipt[] = []
  const newReceivings: StockReceiving[] = []
  try {
    for (const receipt of input.receipts) {
      const stored = history.receipts.find(r => r.id === receipt.id)
      if (stored && receipt.claimedTotal !== undefined && stored.total !== receipt.claimedTotal) throw new ValidationError(`receipt ${receipt.id}: conflicting total`)
    }
    input.receipts = filterImmutable(input.receipts, history.receipts, immutableReceipt, 'receipt')
    input.returns = filterImmutable(input.returns, history.returns ?? [], immutableReturn, 'return')
    input.purchases = filterImmutable(input.purchases, history.purchases ?? [], immutablePurchase, 'purchase')
    for (const purchase of input.purchases) for (const line of purchase.lines) line.unitCost = proportionalAmount(line.total, 1000, line.quantity)
    const voids = new Map<string, typeof input.purchaseVoids[number]>()
    for (const v of input.purchaseVoids) {
      const before = voids.get(v.purchaseId)
      if (before && stable(before) !== stable(v)) throw new ValidationError(`purchase ${v.purchaseId}: conflicting void requests`)
      const stored = history.purchases?.find(p => p.id === v.purchaseId && p.voidedAt)
      if (stored) { if (canonicalDate(stored.voidedAt!) !== canonicalDate(v.createdAt) || (stored.voidReason ?? '') !== (v.reason ?? '')) throw new ValidationError('Conflicting replay of a purchase void'); continue }
      voids.set(v.purchaseId, v)
    }
    input.purchaseVoids = [...voids.values()]
    const knownCustomers = allCustomers([...(history.customCustomers ?? []), ...input.customCustomers])
    for (const receipt of input.receipts) if (receipt.customerId && !knownCustomers.some(c => c.id === receipt.customerId)) throw new ValidationError('Unknown customer on receipt')
    for (const tx of input.transactions) if (!knownCustomers.some(c => c.id === tx.customerId)) throw new ValidationError('Unknown customer on account transaction')
    const tx = (r: any) => ({ id: r.id, customerId: r.customerId, type: r.type, amount: r.amount, createdAt: canonicalDate(r.createdAt), receiptId: r.receiptId ?? null, note: r.note ?? '' })
    const adj = (r: any) => ({ id: r.id, productId: r.productId, quantity: r.quantity, reason: r.reason, counted: r.counted ?? null, createdAt: canonicalDate(r.createdAt), note: r.note ?? '' })
    input.transactions = filterImmutable(input.transactions, history.transactions ?? [], tx, 'transaction')
    input.adjustments = filterImmutable(input.adjustments, history.adjustments ?? [], adj, 'adjustment')
    const receivingSignature = (r: any) => ({ id: r.id, purchaseId: r.purchaseId, createdAt: canonicalDate(r.createdAt), note: r.note ?? '', lines: r.lines.map((l: any) => ({ invoiceLineId: l.invoiceLineId, productId: l.productId, quantity: l.quantity, allocatedCost: l.allocatedCost ?? null })) })
    input.stockReceivings = filterImmutable(input.stockReceivings, history.stockReceivings ?? [], receivingSignature, 'stock receiving')
    const paymentSignature = (p: any) => ({ ...p, createdAt: canonicalDate(p.createdAt) })
    input.supplierPayments = filterImmutable(input.supplierPayments, history.supplierPayments ?? [], paymentSignature, 'supplier payment')
    input.purchaseSettlements = filterImmutable(input.purchaseSettlements, history.purchaseSettlements ?? [], paymentSignature, 'purchase settlement')
    const suppliers = new Map((history.suppliers ?? []).map(s => [s.id, s]))
    const incomingSuppliers = new Set<string>()
    for (const s of input.suppliers) {
      if (incomingSuppliers.has(s.id)) throw new ValidationError('Duplicate supplier updates')
      incomingSuppliers.add(s.id); suppliers.set(s.id, s)
    }
    const requireSupplier = (id: string | undefined, allowArchived = false) => {
      if (id && (!suppliers.has(id) || (!allowArchived && suppliers.get(id)!.archived))) throw new ValidationError('Select an active supplier')
    }
    const purchases: Purchase[] = [...history.purchases ?? [], ...input.purchases.map(p => ({ ...p, total: computePurchaseTotal(p.mode === 'invoice' ? p.invoiceLines! : p.lines) }))]
    for (const p of input.purchases) {
      requireSupplier(p.supplierId)
      const total = computePurchaseTotal(p.mode === 'invoice' ? p.invoiceLines! : p.lines)
      if (p.paid === undefined && (p.supplierId || p.mode === 'invoice')) throw new ValidationError('Supplier purchases require a confirmed payment amount')
      if (p.paid !== undefined && (p.paid > total || (p.paid < total && !p.supplierId) || !p.method)) throw new ValidationError('Purchase payment must match its total or have a supplier for due')
      if (p.supplierId) p.supplier = suppliers.get(p.supplierId)!.name
    }
    const reviews = [...history.purchaseSettlements ?? []]
    for (const review of input.purchaseSettlements) {
      const p = history.purchases?.find(p => p.id === review.purchaseId)
      if (!p || p.voidedAt || p.accountingIssue || p.paid !== undefined || reviews.some(r => r.purchaseId === p.id)) throw new ValidationError('Only an unreconciled historical purchase can be reviewed once')
      requireSupplier(review.supplierId)
      if (review.paid > p.total || (review.paid < p.total && !review.supplierId)) throw new ValidationError('Historical unpaid amount requires a supplier')
      if (Date.parse(review.createdAt) < Date.parse(p.createdAt) || Date.parse(review.createdAt) > Date.now() + 300000) throw new ValidationError('Review date cannot precede purchase')
      reviews.push(review)
    }
    const payments = [...history.supplierPayments ?? []]
    for (const payment of input.supplierPayments) {
      const p = purchases.find(p => p.id === payment.purchaseId)
      if (!p || p.voidedAt || p.accountingIssue) throw new ValidationError('Select an active, reconciled purchase')
      const account = purchaseAccount(p, payments, reviews)
      requireSupplier(payment.supplierId, true)
      if (!account.known || account.supplierId !== payment.supplierId) throw new ValidationError('Payment supplier does not match its purchase')
      if (Date.parse(payment.createdAt) < Date.parse(p.createdAt) || Date.parse(payment.createdAt) > Date.now() + 300000) throw new ValidationError('Invalid supplier payment date')
      if (payment.type === 'payment' && (!payment.supplierId || payment.amount > account.due || input.purchaseVoids.some(v => v.purchaseId === p.id))) throw new ValidationError('Payment exceeds outstanding purchase amount')
      if (payment.type === 'refund' && (!input.purchaseVoids.some(v => v.purchaseId === p.id) || payment.amount > account.paid || !payment.note)) throw new ValidationError('A refund requires a reason and a matching purchase void')
      payments.push(payment)
    }
    for (const v of input.purchaseVoids) {
      const p = purchases.find(p => p.id === v.purchaseId)
      if (!p || p.voidedAt) continue
      const account = purchaseAccount(p, payments, reviews)
      if (account.known && account.paid !== 0) throw new ValidationError('Record the full supplier refund with this void before removing the purchase')
    }
    inventory = new InventoryLedger(history, input.customProducts, input.purchases)
    for (const p of input.customProducts) if ([...inventory.products.values()].some(other=>other.id!==p.id&&other.code.trim().toLowerCase()===p.code.trim().toLowerCase())) throw new ValidationError('Each product brand/model requires a unique product code')
    for (const checkpoint of input.valuationCheckpoints) {
      const before = inventory.product(checkpoint.productId)
      inventory.checkpoint(checkpoint)
      statements.push(env.DB.prepare('DELETE FROM accounting_quarantine WHERE table_name = ? AND record_id = ?').bind('custom_products', checkpoint.productId))
      statements.push(env.DB.prepare(`INSERT INTO accounting_repairs (id, table_name, record_id, before_json, after_json, source) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(`valuation-${input.expectedRevision + 1}-${checkpoint.productId}`, 'custom_products', checkpoint.productId, JSON.stringify(before), JSON.stringify(inventory.product(checkpoint.productId)), `Owner opening valuation: ${checkpoint.reason}`))
    }
    for (const purchase of input.purchases) if (purchase.mode !== 'invoice') inventory.purchase(purchase)
    const receivings = [...history.stockReceivings ?? []]
    for (const request of input.stockReceivings) {
      const p = purchases.find(p => p.id === request.purchaseId)
      if (!p || p.voidedAt || p.accountingIssue || p.mode !== 'invoice' || input.purchaseVoids.some(v => v.purchaseId === p.id)) throw new ValidationError('Select an active invoice awaiting stock')
      if (Date.parse(request.createdAt) < Date.parse(p.createdAt) || Date.parse(request.createdAt) > Date.now() + 300000) throw new ValidationError('Invalid stock receiving date')
      let received: StockReceiving
      try { received = makeStockReceiving(p, receivings, request.lines, request) }
      catch { throw new ValidationError('Receiving quantities and allocated costs must fit the remaining invoice lines') }
      for (const l of received.lines) {
        const invoiceLine = p.invoiceLines!.find(v => v.id === l.invoiceLineId)!
        if (inventory.product(l.productId).unit !== invoiceLine.unit) throw new ValidationError('Stock item unit must match the invoice line unit')
      }
      inventory.purchase({ id: received.id, createdAt: received.createdAt, lines: received.lines })
      receivings.push(received); newReceivings.push(received)
    }
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error
    return jsonResponse({ error: error.message }, 422)
  }
  const currentCatalog = () => {
    const catalog = buildCatalog([], [...inventory.products.values()])
    for (const [id, entry] of catalog) entry.quantity = inventory.quantity(id)
    return catalog
  }
  const catalog = currentCatalog()
  if (input.draft?.lines.some(line => !catalog.has(line.productId))) return jsonResponse({ error: 'The draft contains an unknown product.' }, 422)

  // 1. Receipts — every money field is recalculated from the server catalog; the
  // device's claimed total is only compared, never trusted.
  const computedReceipts = new Map<string, ComputedReceipt>()
  const receiptStatements = new Map<string, D1PreparedStatement>()
  for (const receipt of input.receipts) {
    try {
      for (const line of receipt.lines) inventory.requireReady(line.productId)
      const computed = computeReceipt(receipt, currentCatalog())
      const customer = receipt.customerId ? findCustomerIn(receipt.customerId, allCustomers([...(history.customCustomers ?? []), ...input.customCustomers])) ?? null : null
      if (computed.creditApplied && customer && customerBalance(customer, history.receipts, history.transactions, history.returns).accountingIssue) throw new ValidationError('Repair this customer history before applying store credit')
      const sale = { ...computed, customer, lines: computed.lines.map(l => ({ ...l, product: l.product ?? inventory.product(l.productId) })) } as Receipt
      inventory.sale(sale)
      newSales.push(sale)
      computedReceipts.set(computed.id, computed)
      const statement = env.DB.prepare(
          `INSERT OR IGNORE INTO receipts (
            id, receipt_number, created_at, customer_id,
            subtotal, discount, total, paid, tendered, change, due,
            method, address, remarks, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          computed.id,
          computed.number,
          computed.createdAt,
          computed.customerId,
          computed.subtotal,
          computed.discount,
          computed.total,
          computed.paid,
          computed.tendered,
          computed.change,
          computed.due,
          computed.method,
          computed.address ?? null,
          computed.remarks ?? null,
          JSON.stringify(computed)
        )
      statements.push(statement)
      receiptStatements.set(computed.id, statement)
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error
      rejected.push({ type: 'receipts', id: receipt.id, reason: error.message })
    }
  }

  // 2. Account transactions — primitive amounts, accepted after shape validation.
  for (const tx of input.transactions) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO account_transactions (
          id, customer_id, type, amount, created_at, note, receipt_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(tx.id, tx.customerId, tx.type, tx.amount, tx.createdAt, tx.note ?? null, tx.receiptId ?? null)
    )
  }

  // 3. Purchases — the bill total is summed from the line amounts on the server.
  for (const purchase of input.purchases) {
    const total = computePurchaseTotal(purchase.mode === 'invoice' ? purchase.invoiceLines! : purchase.lines)
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO purchases (
          id, created_at, supplier, method, note, total, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        purchase.id,
        purchase.createdAt,
        purchase.supplier ?? null,
        purchase.method ?? null,
        purchase.note ?? null,
        total,
        JSON.stringify({ ...purchase, total, currencyVersion: 2 })
      )
    )
  }

  // 4. Expenses — primitive amounts, accepted after shape validation.
  for (const expense of input.expenses) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO expenses (
          id, created_at, category, amount, method, note
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(expense.id, expense.createdAt, expense.category, expense.amount, expense.method, expense.note ?? null)
    )
  }

  // 5. Stock adjustments — signed deltas, accepted after shape validation.
  for (const rawAdjustment of input.adjustments) {
    let adjustment: StockAdjustment
    try { adjustment = inventory.adjustment(rawAdjustment); newAdjustments.push(adjustment) }
    catch (error) { rejected.push({ type: 'adjustments', id: rawAdjustment.id, reason: (error as Error).message }); continue }
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO stock_adjustments (
          id, created_at, product_id, quantity, reason, counted, note, cost_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        adjustment.id,
        adjustment.createdAt,
        adjustment.productId,
        adjustment.quantity,
        adjustment.reason,
        adjustment.counted ?? null,
        adjustment.note ?? null,
        adjustment.costAmount ?? null
      )
    )
  }

  // 6. Purchase voids — only accepted when the purchase exists in D1 or in this batch.
  if (input.purchaseVoids.length > 0) {
    const known = new Set(input.purchases.map((purchase) => purchase.id))
    const missing = input.purchaseVoids.filter((voided) => !known.has(voided.purchaseId)).map((voided) => voided.purchaseId)
    for (const id of await loadPurchaseIds(env, missing)) known.add(id)
    for (const voided of input.purchaseVoids) {
      if (!known.has(voided.purchaseId)) {
        rejected.push({ type: 'purchaseVoids', id: voided.purchaseId, reason: `purchase ${voided.purchaseId} was not found` })
        continue
      }
      const purchase = [...(history.purchases ?? []), ...input.purchases].find(p => p.id === voided.purchaseId)
      if ((history.purchases ?? []).some(p => p.id === voided.purchaseId && p.voidedAt)) continue
      try {
        if (!purchase || ('accountingIssue' in purchase && purchase.accountingIssue)) throw new ValidationError('Repair the historical purchase before voiding it')
        if ('mode' in purchase && purchase.mode === 'invoice') {
          for (const received of [...history.stockReceivings ?? [], ...newReceivings].filter(r => r.purchaseId === purchase.id)) inventory.void({ id: purchase.id, createdAt: received.createdAt, lines: received.lines }, voided.createdAt, newSales, input.returns as any, newAdjustments)
        } else inventory.void(purchase, voided.createdAt, newSales, input.returns as any, newAdjustments)
      } catch (error) { rejected.push({ type: 'purchaseVoids', id: voided.purchaseId, reason: (error as Error).message }); continue }
      statements.push(
    env.DB.prepare(
          `INSERT OR IGNORE INTO purchase_voids (purchase_id, created_at, reason) VALUES (?, ?, ?)`
        ).bind(voided.purchaseId, voided.createdAt, voided.reason ?? null)
      )
    }
  }

  // 7. Returns — quantities are verified against the original receipt (in D1 or in
  // this same batch), prior returns are accounted for, and the refund is capped at
  // the server-calculated amount. The receipt number and customer are derived from
  // the stored bill, never claimed.
  const acceptedReturnLines = new Map<string, PriorReturnLine[]>()
  const acceptedReturns: { result: Return; statement: D1PreparedStatement }[] = []
  if (input.returns.length > 0) {
    const storedReceipts = await loadStoredReceipts(
      env,
      input.returns.map((entry) => entry.receiptId)
    )
    const priorReturns = await loadPriorReturns(env, input.returns.map((entry) => entry.receiptId))
    for (const entry of input.returns) {
      const computed = computedReceipts.get(entry.receiptId)
      const receipt = storedReceipts.get(entry.receiptId) ?? (computed ? receiptForReturn(computed) : undefined)
      if (!receipt) {
        rejected.push({ type: 'returns', id: entry.id, reason: `receipt ${entry.receiptId} was not found` })
        continue
      }
      const priorLines = [...(priorReturns.get(entry.receiptId) ?? []), ...(acceptedReturnLines.get(entry.receiptId) ?? [])]
      try {
        const original = [...history.receipts, ...newSales].find(r => r.id === entry.receiptId)
        if (!original || original.accountingIssue) throw new ValidationError('Repair the historical bill before returning its items')
        if ((history.returns ?? []).some(r => r.receiptId === entry.receiptId && r.accountingIssue)) throw new ValidationError('Repair the previous returns on this bill before accepting another return')
        for (const line of [...entry.lines, ...(entry.replacementLines ?? [])]) inventory.requireReady(line.productId)
        if (original.customer && customerBalance(original.customer, history.receipts, history.transactions, history.returns).accountingIssue) throw new ValidationError('Repair this customer history before settling a return')
        const actualDue = receiptOutstandingDue(original, [...history.receipts, ...newSales], [...history.transactions ?? [], ...input.transactions], [...history.returns ?? [], ...acceptedReturns.map(r => r.result)])
        if (entry.settlement && entry.settlement.dueReduced !== Math.min(entry.refunded, actualDue)) throw new ValidationError('Return due reduction differs from the remaining debt on this bill')
        if (entry.method === 'due' && entry.refunded > actualDue) throw new ValidationError('Due refund exceeds the remaining debt on this bill')
        const result = computeReturn(entry, receipt, priorLines, currentCatalog())
        inventory.return(result as Return)
        acceptedReturnLines.set(entry.receiptId, [
          ...(acceptedReturnLines.get(entry.receiptId) ?? []),
          ...result.lines.map((line, index) => ({ id: result.id, productId: line.productId, quantity: line.quantity, amount: line.amount, cost: line.cost, ...(index === 0 ? { dueReduced: result.settlement?.dueReduced ?? (result.method === 'due' ? result.refunded : 0) } : {}) })),
        ])
        const statement = env.DB.prepare(
            `INSERT OR IGNORE INTO returns (
              id, created_at, receipt_id, receipt_number, customer_id, refunded, method, restock, note, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            result.id,
            result.createdAt,
            result.receiptId,
            result.receiptNumber,
            result.customerId,
            result.refunded,
            result.method,
            result.restock ? 1 : 0,
            result.note ?? null,
            JSON.stringify(result)
          )
        statements.push(statement)
        acceptedReturns.push({ result: result as Return, statement })
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error
        rejected.push({ type: 'returns', id: entry.id, reason: error.message })
      }
    }
  }

  // Verify customer credit against committed history plus accepted events in this
  // upload. A second terminal with a stale balance must not spend the same credit.
  if ([...computedReceipts.values()].some(receipt => receipt.creditApplied)) {
    const customers = allCustomers([...(history.customCustomers ?? []), ...input.customCustomers])
    const priorReceipts = history.receipts as Receipt[]
    const priorReturns = history.returns as Return[]
    const priorReceiptIds = new Set(priorReceipts.map(receipt => receipt.id))
    const priorReturnIds = new Set(priorReturns.map(entry => entry.id))
    const accepted = acceptedReturns.map(item => item.result).filter(entry => !priorReturnIds.has(entry.id))
    const priorTransactions = history.transactions ?? []
    const priorTransactionIds = new Set(priorTransactions.map((tx: { id: string }) => tx.id))
    const transactions = [...priorTransactions, ...input.transactions.filter(tx => !priorTransactionIds.has(tx.id))]
    const inBatch: Receipt[] = []
    for (const receipt of [...computedReceipts.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (priorReceiptIds.has(receipt.id)) continue
      const customer = receipt.customerId ? findCustomerIn(receipt.customerId, customers) : null
      if (customer && [...history.receipts.filter(r => r.customer?.id === customer.id), ...(history.returns ?? []).filter(r => r.customerId === customer.id)].some(r => r.accountingIssue)) { rejected.push({ type: 'receipts', id: receipt.id, reason: 'Repair this customer history before applying store credit' }); continue }
      const credit = customer ? customerBalance(customer, [...priorReceipts, ...inBatch], transactions, [...priorReturns, ...accepted.filter(entry => entry.createdAt <= receipt.createdAt)]).storeCredit : 0
      if ((receipt.creditApplied ?? 0) > credit) {
        const statement = receiptStatements.get(receipt.id)
        if (statement) statements.splice(statements.indexOf(statement), 1)
        computedReceipts.delete(receipt.id)
        rejected.push({ type: 'receipts', id: receipt.id, reason: `receipt ${receipt.id}: customer credit exceeds the available balance` })
        for (const item of acceptedReturns.filter(item => item.result.receiptId === receipt.id)) {
          statements.splice(statements.indexOf(item.statement), 1)
          const acceptedIndex = accepted.findIndex(entry => entry.id === item.result.id)
          if (acceptedIndex >= 0) accepted.splice(acceptedIndex, 1)
          rejected.push({ type: 'returns', id: item.result.id, reason: `return ${item.result.id}: original receipt was rejected` })
        }
        continue
      }
      inBatch.push({ ...receipt, customer, lines: [] } as Receipt)
    }
  }

  // 8. Custom products — shape-validated upserts; the latest copy wins.
  for (const raw of input.customProducts) {
    const changed = inventory.product(raw.id)
    const baseline = history.customProducts?.find(p=>p.id===raw.id)?.stock ?? 0
    const receivedQuantity = newReceivings.flatMap(r=>r.lines).filter(l=>l.productId===raw.id).reduce((s,l)=>s+l.quantity,0)
    const receivingExplainsChange = receivedQuantity > 0 && raw.stock === baseline && changed.stock === baseline + receivedQuantity
    if (!isService(changed) && raw.stock !== changed.stock && !receivingExplainsChange) rejected.push({ type: 'customProducts', id: raw.id, reason: 'Stock quantity changes require confirmed receiving, a permitted void, or a stock correction.' })
  }
  for (const id of inventory.touched) {
    const p = inventory.product(id)
    statements.push(
      env.DB.prepare(
        `INSERT INTO custom_products (
          id, code, en, bn, category, unit, price, cost, stock, purchased, kind,
          group_id, variant_name, variant_name_bn, archived, art, color,
          detail, detail_bn, warranty, inventory_value, valuation_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          code=excluded.code, en=excluded.en, bn=excluded.bn,
          category=excluded.category, unit=excluded.unit, price=excluded.price,
          cost=excluded.cost, stock=excluded.stock, purchased=excluded.purchased, kind=excluded.kind,
          group_id=excluded.group_id, variant_name=excluded.variant_name,
          variant_name_bn=excluded.variant_name_bn, archived=excluded.archived,
          art=excluded.art, color=excluded.color, detail=excluded.detail,
          detail_bn=excluded.detail_bn, warranty=excluded.warranty, inventory_value=excluded.inventory_value, valuation_status=excluded.valuation_status, updated_at=CURRENT_TIMESTAMP`
      ).bind(
        p.id,
        p.code,
        p.en,
        '', // Legacy database column; product names use en only.
        p.category,
        p.unit,
        p.price,
        p.cost ?? null,
        p.stock,
        p.purchased ?? null,
        p.kind ?? null,
        p.groupId ?? null,
        p.variantName ?? null,
        null,
        p.archived ? 1 : 0,
        p.art,
        p.color,
        p.detail,
        p.detailBn,
        p.warranty ?? '',
        p.inventoryValue ?? null,
        p.valuationStatus ?? null
      )
    )
  }

  // 9. Custom customers — shape-validated upserts; the latest copy wins.
  for (const c of input.customCustomers) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO custom_customers (
          id, en, bn, phone, address, opening_balance, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          en=excluded.en, bn=excluded.bn, phone=excluded.phone,
          address=excluded.address,
          opening_balance=excluded.opening_balance, note=excluded.note,
          updated_at=CURRENT_TIMESTAMP`
      ).bind(
        c.id,
        c.en,
        c.bn,
        c.phone,
        c.address ?? null,
        c.openingBalance ?? null,
        c.note ?? null
      )
    )
  }

  for (const r of newReceivings) statements.push(env.DB.prepare('INSERT INTO stock_receivings (id, purchase_id, created_at, payload_json) VALUES (?, ?, ?, ?)').bind(r.id, r.purchaseId, r.createdAt, JSON.stringify(r)))
  for (const s of input.suppliers) statements.push(env.DB.prepare('INSERT INTO suppliers (id, payload_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json').bind(s.id, JSON.stringify(s)))
  for (const p of input.supplierPayments) statements.push(env.DB.prepare('INSERT INTO supplier_payments (id, purchase_id, payload_json) VALUES (?, ?, ?)').bind(p.id, p.purchaseId, JSON.stringify(p)))
  for (const r of input.purchaseSettlements) statements.push(env.DB.prepare('INSERT INTO purchase_settlements (id, purchase_id, payload_json) VALUES (?, ?, ?)').bind(r.id, r.purchaseId, JSON.stringify(r)))

  // Validation and business-rule failures reject the complete operation.
  if (rejected.length) return jsonResponse({ error: rejected[0].reason, rejected }, 422)

  for (const id of input.deletedExpenses) {
    statements.push(env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(id))
  }
  if (input.draft) {
    if (history.draftAccountingIssue) {
      const before = await env.DB.prepare('SELECT draft_json FROM terminal_drafts WHERE terminal_id = ?').bind(input.terminalId).first<{ draft_json: string }>()
      statements.push(env.DB.prepare('INSERT INTO accounting_repairs (id, table_name, record_id, before_json, after_json, source) VALUES (?, ?, ?, ?, ?, ?)').bind(`draft-${input.expectedRevision + 1}-${input.terminalId}`, 'terminal_drafts', String(input.terminalId), before?.draft_json ?? '{}', JSON.stringify({ ...input.draft, currencyVersion: 2 }), input.confirmDraft ? 'Owner confirmed whole-Taka draft discount' : 'Owner cleared an unverified draft'))
    }
    statements.push(env.DB.prepare('DELETE FROM accounting_quarantine WHERE table_name = ? AND record_id = ?').bind('terminal_drafts', String(input.terminalId)))
    statements.push(env.DB.prepare(`INSERT INTO terminal_drafts (terminal_id, draft_json) VALUES (?, ?)
      ON CONFLICT(terminal_id) DO UPDATE SET draft_json=excluded.draft_json, updated_at=CURRENT_TIMESTAMP`)
      .bind(input.terminalId, JSON.stringify({ ...input.draft, currencyVersion: 2 })))
  }

  // The revision guard and every write share one D1 transaction. A racing
  // request violates NOT NULL and rolls the entire batch back.
  const guard = env.DB.prepare(`UPDATE app_revision SET revision =
    CASE WHEN revision = ? THEN revision + 1 ELSE NULL END WHERE id = 1`).bind(input.expectedRevision)
  try {
    return jsonResponse(await queryWorkspace(env, input.terminalId, [guard, ...statements]))
  } catch (error) {
    const latest = await env.DB.prepare('SELECT revision FROM app_revision WHERE id = 1').first<{ revision: number }>()
    if (latest?.revision !== input.expectedRevision) {
      return jsonResponse({ error: 'Data changed on another terminal. Refresh before trying again.', code: 'conflict' }, 409)
    }
    throw error
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // API Routing
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) {
          return authResponse({ error: 'Request origin is not allowed.' }, 403)
        }
        const auth = await handleAuth(request, env)
        if (auth) return auth
        if (url.pathname === '/api/health') {
          const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
          const existing = new Set((tables.results ?? []).map(row => row.name))
          const required = ['receipts', 'account_transactions', 'custom_products', 'custom_customers', 'app_revision', 'terminal_drafts', 'purchases', 'expenses', 'stock_adjustments', 'returns', 'purchase_voids', 'accounting_repairs', 'accounting_quarantine', 'accounting_checkpoints', 'suppliers', 'supplier_payments', 'purchase_settlements', 'stock_receivings', 'auth_sessions', 'auth_login_attempts']
          const missingTables = required.filter(name => !existing.has(name))
          if (missingTables.length) {
            return jsonResponse({ status: 'error', db: true, missingTables, error: 'D1 schema is incomplete. Apply the remote migrations before deploying.' }, 503)
          }
          return jsonResponse({ status: 'ok', db: true, timestamp: new Date().toISOString() })
        }

        if (!await hasSession(request, env)) return authResponse({ error: 'Please sign in to continue.', code: 'unauthenticated' }, 401)

        if (url.pathname === '/api/workspace/revision' && request.method === 'GET') {
          const row = await env.DB.prepare('SELECT revision FROM app_revision WHERE id = 1').first<{ revision: number }>()
          if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0) return jsonResponse({ error: 'Workspace revision is unavailable.' }, 503)
          return jsonResponse({ ok: true, revision: row.revision })
        }

        if (url.pathname === '/api/workspace' && request.method === 'POST') {
          return await handleMutation(request, env)
        }

        if (url.pathname === '/api/workspace' && request.method === 'GET') {
          const terminalId = Number(url.searchParams.get('terminalId') ?? 1)
          if (!Number.isInteger(terminalId) || terminalId < 1 || terminalId > 999) {
            return jsonResponse({ error: 'Invalid terminal number' }, 400)
          }
          return jsonResponse(await queryWorkspace(env, terminalId))
        }

        if (url.pathname === '/api/reports/summary' && request.method === 'GET') {
          const summary = await env.DB.prepare(
            `SELECT
               COUNT(*) as receipt_count,
               COALESCE(SUM(total), 0) as total_sales,
               COALESCE(SUM(paid), 0) as total_paid,
               COALESCE(SUM(due), 0) as total_due
             FROM receipts`
          ).first()

          return jsonResponse({ ok: true, summary })
        }

        return jsonResponse({ error: 'Endpoint not found' }, 404)
      } catch (err) {
        console.error('API Error:', err)
        return jsonResponse(
          { error: 'Internal Server Error', details: err instanceof Error ? err.message : String(err) },
          500
        )
      }
    }

    // Static Assets & Single-Page Application routing
    return env.ASSETS.fetch(request)
  },
}
