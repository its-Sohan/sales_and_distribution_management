// Server-side recalculation. The device only supplies primitive inputs (quantities,
// selling prices, a discount, the tendered amount); derived money fields are
// computed here using validated sale prices and server-owned inventory costs. A client can
// never write forged totals into the ledger. Claims from the device are compared,
// never trusted.

import { assertSaleAboveCost, saleUnitPrice, allocateDiscount, costStatusOf, inventoryCostAmount, proportionalAmount, lineTotal, isDiscreteUnit, isService, productCost, sameProductUnit, type CostStatus, RETURN_WINDOW_DAYS, type PaymentMethod, type Product, type ReturnMethod, type ReturnSettlement } from '../src/model'
import { ValidationError, type PurchaseInput, type ReceiptInput, type ReturnInput } from './validate'

export type CatalogEntry = { price: number; cost: number; warranty?: string; product?: Product; quantity?: number; costStatus?: CostStatus }
export type Catalog = Map<string, CatalogEntry>

/** A bill line total: integer Taka prices, 1000-scaled quantities, rounded once at the line boundary (mirrors src/model.ts). */

/**
 * Price authority for recalculation: records already stored in D1, followed by
 * the catalog validated by the inventory ledger for this atomic operation.
 */
export function buildCatalog(d1Products: { id: string; price: number | null; cost: number | null; kind?: string | null; warranty?: string | null }[], payloadProducts: Product[]): Catalog {
  const catalog: Catalog = new Map()
  for (const row of d1Products) {
    const price = row.price ?? 0
    catalog.set(row.id, { price, warranty: row.warranty ?? '', cost: row.kind === 'service' ? (row.cost ?? 0) : (row.cost ?? Math.round(price * 0.85)) })
  }
  for (const product of payloadProducts) catalog.set(product.id, { price: product.price, cost: productCost(product), warranty: product.warranty ?? '', product: { ...product }, costStatus: costStatusOf(product) })
  return catalog
}

export type ComputedReceiptLine = { productId: string; quantity: number; unitPrice?: number; price: number; gross: number; cost: number; costAmount: number; costStatus: CostStatus; product?: Product; warranty: string }

export type ComputedReceipt = {
  currencyVersion: 2
  id: string
  number: number
  createdAt: string
  customerId: string | null
  lines: ComputedReceiptLine[]
  subtotal: number
  discount: number
  total: number
  paid: number
  tendered: number
  change: number
  due: number
  method: PaymentMethod
  creditApplied?: number
  address?: string
  remarks?: string
  preparedBy?: string
}

/**
 * Recomputes receipt amounts from validated sale prices and server inventory costs,
 * enforcing the same business rules as `makeReceipt` on the device. Throws
 * ValidationError when the write must be refused — including when the device's
 * claimed total disagrees with the server's total.
 */
export function computeReceipt(input: ReceiptInput, catalog: Catalog): ComputedReceipt {
  if (new Set(input.lines.map(l => l.productId)).size !== input.lines.length) throw new ValidationError('Duplicate products on a receipt must be combined')
  const lines = input.lines.map((line) => {
    const entry = catalog.get(line.productId)
    if (!entry) throw new ValidationError(`receipt ${input.id}: unknown product '${line.productId}'`)
    if (entry.product && ((isDiscreteUnit(entry.product.unit) || entry.product.unit === 'BDT') && line.quantity % 1000 !== 0)) throw new ValidationError('Invalid quantity for this item unit')
    if (entry.product?.unit === 'BDT') throw new ValidationError('Amount-based items must be converted to repair jobs before sale')
    let price: number
    try { price = saleUnitPrice(line, entry.product ?? { price: entry.price }) }
    catch { throw new ValidationError('Invalid selling price or legacy amount item; remove and add the item again') }
    if (price < entry.cost) throw new ValidationError(`Selling price for '${line.productId}' cannot be below buy cost`)
    const costAmount = entry.product ? inventoryCostAmount(entry.product, entry.quantity ?? entry.product.stock, line.quantity) : lineTotal(entry.cost, line.quantity)
    return {
      productId: line.productId,
      quantity: line.quantity,
      ...(line.unitPrice !== undefined ? { unitPrice: price } : {}),
      price,
      gross: lineTotal(price, line.quantity),
      cost: entry.cost,
      costAmount, costStatus: entry.costStatus ?? 'unverified',
      ...(entry.product ? { product: { ...entry.product, price } } : {}),
      warranty: entry.warranty ?? '',
    }
  })
  const subtotal = lines.reduce((sum, line) => sum + line.gross, 0)
  const total = Math.max(0, subtotal - input.discount)
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total) || total > 100_000_000 || input.discount > subtotal) throw new ValidationError(`receipt ${input.id}: total exceeds the allowed amount`)
  try { assertSaleAboveCost(lines, input.discount) }
  catch { throw new ValidationError('Selling price after discount cannot be below buy cost') }
  if (total <= 0) throw new ValidationError(`receipt ${input.id}: total must be positive`)
  const creditApplied = input.creditApplied ?? 0
  if (creditApplied > total || (creditApplied && !input.customerId)) throw new ValidationError(`receipt ${input.id}: invalid store credit`)
  const payable = total - creditApplied
  if (input.tendered < payable && !input.customerId) throw new ValidationError(`receipt ${input.id}: underpayment requires a customer`)
  if (input.method !== 'cash' && input.tendered > payable) throw new ValidationError(`receipt ${input.id}: electronic methods cannot be overpaid`)
  if (input.claimedTotal !== undefined && input.claimedTotal !== total) {
    throw new ValidationError(`receipt ${input.id}: claimed total ${input.claimedTotal} does not match the server total ${total}`)
  }
  const receipt: ComputedReceipt = {
    currencyVersion: 2,
    id: input.id,
    number: input.number,
    createdAt: input.createdAt,
    customerId: input.customerId,
    lines,
    subtotal,
    discount: input.discount,
    total,
    paid: Math.min(payable, input.tendered),
    tendered: input.tendered,
    change: Math.max(0, input.tendered - payable),
    due: Math.max(0, payable - input.tendered),
    method: input.method,
    ...(creditApplied ? { creditApplied } : {}),
  }
  if (input.address) receipt.address = input.address
  if (input.remarks) receipt.remarks = input.remarks
  if (input.preparedBy) receipt.preparedBy = input.preparedBy
  return receipt
}

/** The bill amounts a return is verified against: sale-time prices, discount, and identity. */
export type ReceiptForReturn = {
  id: string
  number: number
  createdAt?: string
  customerId: string | null
  discount: number
  due?: number
  lines: { productId: string; quantity: number; price: number; cost: number | null; costAmount?: number; costStatus?: CostStatus; gross?: number; unit?: Product['unit']; kind?: Product['kind'] }[]
}

/** Narrows a freshly recalculated receipt into the view return verification needs. */
export function receiptForReturn(computed: ComputedReceipt): ReceiptForReturn {
  return {
    id: computed.id,
    number: computed.number,
    createdAt: computed.createdAt,
    customerId: computed.customerId,
    discount: computed.discount,
    due: computed.due,
    lines: computed.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, price: line.price, cost: line.cost, costAmount: line.costAmount, costStatus: line.costStatus, gross: line.gross, unit: line.product?.unit, kind: line.product?.kind })),
  }
}

/** Leniently reads bill lines out of a stored receipt payload (canonical or legacy client shape). */
export function storedReceiptLines(payload: unknown): ReceiptForReturn['lines'] {
  if (typeof payload !== 'object' || payload === null) return []
  const raw = (payload as Record<string, unknown>).lines
  if (!Array.isArray(raw)) return []
  const lines: ReceiptForReturn['lines'] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const line = item as Record<string, unknown>
    const product = typeof line.product === 'object' && line.product !== null ? line.product as Record<string, unknown> : null
    const productId = typeof line.productId === 'string' ? line.productId : null
    const quantity = typeof line.quantity === 'number' ? line.quantity : null
    const price = typeof line.price === 'number' ? line.price : product !== null && typeof product.price === 'number' ? product.price : null
    const cost = typeof line.cost === 'number' ? line.cost : product !== null && typeof product.cost === 'number' ? product.cost : null
    if (productId !== null && quantity !== null && price !== null) lines.push({ productId, quantity, price, cost,
      ...(typeof line.costAmount === 'number' ? { costAmount: line.costAmount } : {}),
      ...(typeof line.gross === 'number' ? { gross: line.gross } : {}),
      ...(typeof line.costStatus === 'string' ? { costStatus: line.costStatus as CostStatus } : { costStatus: product?.cost === undefined ? 'unverified' as const : 'recorded' as const }),
      ...((line.unit ?? product?.unit) ? { unit: (line.unit ?? product?.unit) as Product['unit'] } : {}),
      ...((line.kind ?? product?.kind) === 'service' ? { kind: 'service' as const } : {}),
    })
  }
  return lines
}

/** A previously accepted return whose quantities count against what is left on a bill. */
export type PriorReturnLine = { id: string | null; productId: string; quantity: number; dueReduced?: number; amount?: number; cost?: number; refunded?: number }

/** Leniently reads returned quantities out of a stored return payload (canonical or legacy client shape). */
export function storedReturnLines(payload: unknown): { productId: string; quantity: number; amount?: number; cost?: number }[] {
  if (typeof payload !== 'object' || payload === null) return []
  const raw = (payload as Record<string, unknown>).lines
  if (!Array.isArray(raw)) return []
  const lines: { productId: string; quantity: number; amount?: number; cost?: number }[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const line = item as Record<string, unknown>
    if (typeof line.productId === 'string' && typeof line.quantity === 'number') {
      lines.push({ productId: line.productId, quantity: line.quantity, ...(typeof line.amount === 'number' ? { amount: line.amount } : {}), ...(typeof line.cost === 'number' ? { cost: line.cost } : {}) })
    }
  }
  return lines
}

export type ComputedReturnLine = { productId: string; quantity: number; amount: number; cost: number; costStatus?: CostStatus; condition?: 'sellable' | 'damaged' }

export type ComputedReturn = {
  currencyVersion: 2
  id: string
  createdAt: string
  receiptId: string
  receiptNumber: number
  customerId: string | null
  refunded: number
  method: ReturnMethod
  restock: boolean
  lines: ComputedReturnLine[]
  replacementLines?: { productId: string; quantity: number; unitPrice?: number; product?: Product; amount: number; cost: number }[]
  settlement?: ReturnSettlement
  reason?: string
  operator?: string
  note?: string
}

/**
 * Verifies a return against the original bill and recalculates its line amounts and
 * costs with the device's own discount-allocation math (largest-remainder). The
 * receipt number and customer are derived from the stored bill, never claimed, and
 * the refund may not exceed the server-calculated maximum for the returned goods.
 */
export function computeReturn(input: ReturnInput, receipt: ReceiptForReturn, priorLines: PriorReturnLine[], catalog: Catalog): ComputedReturn {
  const requested = new Map<string, number>()
  for (const line of input.lines) requested.set(line.productId, (requested.get(line.productId) ?? 0) + line.quantity)
  const prior = new Map<string, number>()
  for (const line of priorLines) {
    // A resend of this very return is not a "prior" return; it must not count against itself.
    if (line.id === input.id) continue
    prior.set(line.productId, (prior.get(line.productId) ?? 0) + line.quantity)
  }

  const gross = receipt.lines.map((line) => line.gross ?? lineTotal(line.price, line.quantity))
  const discounts = allocateDiscount(gross, receipt.discount)
  const lines: ComputedReturnLine[] = []
  for (const [productId, quantity] of requested) {
    const index = receipt.lines.findIndex((line) => line.productId === productId)
    if (index < 0) throw new ValidationError(`return ${input.id}: product '${productId}' is not on receipt ${receipt.id}`)
    const originals = receipt.lines.map((line, i) => ({ line, index: i })).filter(part => part.line.productId === productId)
    const source = { ...receipt.lines[index], quantity: originals.reduce((sum, part) => sum + part.line.quantity, 0) }
    if (originals.some(part => part.line.unit && source.unit && !sameProductUnit(part.line.unit, source.unit))) throw new ValidationError('Historical product units disagree')
    const remaining = source.quantity - (prior.get(productId) ?? 0)
    if (quantity > remaining) {
      throw new ValidationError(`return ${input.id}: quantity for '${productId}' exceeds the ${remaining} left on receipt ${receipt.id}`)
    }
    const revenue = originals.reduce((sum, part) => sum + gross[part.index] - discounts[part.index], 0)
    const unitCost = source.cost ?? catalog.get(productId)?.cost ?? Math.round(source.price * 0.85)
    if (source.unit && ((isDiscreteUnit(source.unit) || source.unit === 'BDT') && quantity % 1000 !== 0)) throw new ValidationError('Invalid return quantity')
    const costBase = originals.reduce((sum, part) => sum + (part.line.costAmount ?? lineTotal(part.line.cost ?? unitCost, part.line.quantity)), 0)
    const previous = priorLines.filter(l => l.id !== input.id && l.productId === productId)
    const priorQuantity = prior.get(productId) ?? 0
    const allocatedRevenue = previous.reduce((sum, l) => sum + (l.amount ?? proportionalAmount(revenue, l.quantity, source.quantity)), 0)
    const allocatedCost = previous.reduce((sum, l) => sum + (l.cost ?? proportionalAmount(costBase, l.quantity, source.quantity)), 0)
    lines.push({
      productId,
      quantity,
      amount: proportionalAmount(Math.max(0, revenue - allocatedRevenue), quantity, source.quantity - priorQuantity),
      cost: proportionalAmount(Math.max(0, costBase - allocatedCost), quantity, source.quantity - priorQuantity),
      costStatus: originals.every(part => part.line.costStatus === 'recorded') ? 'recorded' : source.costStatus ?? 'unverified',
      ...(source.kind === 'service' || (catalog.get(productId)?.product && isService(catalog.get(productId)!.product!)) ? { condition: 'damaged' as const } : input.conditions?.[productId] ? { condition: input.conditions[productId] } : {}),
    })
  }
  const maxRefund = lines.reduce((sum, line) => sum + line.amount, 0)
  if (input.refunded > maxRefund) {
    throw new ValidationError(`return ${input.id}: refund ${input.refunded} exceeds the server-calculated maximum ${maxRefund}`)
  }
  if (input.method === 'due' && !receipt.customerId) {
    throw new ValidationError(`return ${input.id}: due refunds require the receipt to have a customer`)
  }
  if (input.settlement) {
    const age = Date.parse(input.createdAt) - Date.parse(receipt.createdAt ?? input.createdAt)
    if (Date.parse(input.createdAt) - Date.now() > 300000 || age < -300000 || age > RETURN_WINDOW_DAYS * 86400000) {
      throw new ValidationError(`return ${input.id}: outside the return window`)
    }
    const s = input.settlement
    if (s.method !== input.method) throw new ValidationError(`return ${input.id}: settlement method does not match`)
    if (s.dueReduced + s.exchangeCredit + s.payout + s.creditIssued !== input.refunded) throw new ValidationError(`return ${input.id}: settlement does not match return value`)
    if ((s.dueReduced || s.creditIssued || s.newDue) && !receipt.customerId) throw new ValidationError(`return ${input.id}: customer required for account settlement`)
    const priorDueReduced = priorLines.filter(line => line.id !== input.id).reduce((sum, line) => sum + (line.dueReduced ?? 0), 0)
    if (s.dueReduced > Math.max(0, (receipt.due ?? 0) - priorDueReduced)) throw new ValidationError(`return ${input.id}: due reduction exceeds bill due`)
    const replacements = input.replacementLines ?? []
    let replacementTotal = 0
    const pools = new Map<string, { product: Product; quantity: number }>()
    for (const returned of lines) {
      const entry = catalog.get(returned.productId)
      if (!entry?.product || isService(entry.product) || !(returned.condition ? returned.condition === 'sellable' : input.restock)) continue
      const old = pools.get(returned.productId) ?? { product: { ...entry.product }, quantity: entry.quantity ?? entry.product.stock }
      old.quantity += returned.quantity
      if (old.product.inventoryValue !== undefined) old.product.inventoryValue += returned.cost
      pools.set(returned.productId, old)
    }
    const computedReplacements: NonNullable<ComputedReturn['replacementLines']> = []
    for (const line of replacements) {
      const product = catalog.get(line.productId)
      if (product?.product?.unit === 'BDT') throw new ValidationError('Amount-based replacement items are no longer supported')
      if (!product) throw new ValidationError(`return ${input.id}: unknown replacement product '${line.productId}'`)
      if (product.product && (isDiscreteUnit(product.product.unit) && line.quantity % 1000 !== 0)) throw new ValidationError('Invalid replacement quantity for item unit')
      let price: number
      try { price = saleUnitPrice(line, product.product ?? { price: product.price }) }
      catch { throw new ValidationError('Invalid replacement selling price') }
      if (price < product.cost) throw new ValidationError(`Replacement selling price for '${line.productId}' cannot be below buy cost`)
      const amount = lineTotal(price, line.quantity)
      const pool = pools.get(line.productId) ?? (product.product ? { product: { ...product.product }, quantity: product.quantity ?? product.product.stock } : undefined)
      const cost = pool ? inventoryCostAmount(pool.product, pool.quantity, line.quantity) : lineTotal(product.cost, line.quantity)
      if (amount < cost) throw new ValidationError('Replacement selling price cannot be below buy cost')
      if (pool && !isService(pool.product)) {
        pool.quantity -= line.quantity
        if (pool.product.inventoryValue !== undefined) pool.product.inventoryValue -= cost
        pools.set(line.productId, pool)
      }
      computedReplacements.push({ productId: line.productId, quantity: line.quantity, ...(line.unitPrice !== undefined ? { unitPrice: price } : {}), amount, cost, ...(product.product ? { product: { ...product.product, price } } : {}), costStatus: product.costStatus ?? 'unverified' } as any)
      if (line.amount !== amount || line.cost !== cost) throw new ValidationError(`return ${input.id}: replacement total differs from selling price`)
      if (line.product && (line.product.id !== line.productId || line.product.price !== price)) throw new ValidationError(`return ${input.id}: replacement snapshot differs from selling price`)
      replacementTotal += amount
    }
    if (!Number.isSafeInteger(replacementTotal) || replacementTotal > 100_000_000) throw new ValidationError('Replacement total exceeds the allowed amount')
    if (s.exchangeCredit + s.received + s.newDue !== replacementTotal) throw new ValidationError(`return ${input.id}: replacement settlement does not balance`)
    if (s.exchangeCredit !== Math.min(input.refunded - s.dueReduced, replacementTotal)) throw new ValidationError('Exchange credit must use the remaining return value')
    input = { ...input, replacementLines: computedReplacements }
    if (s.exchangeCredit > replacementTotal) throw new ValidationError(`return ${input.id}: exchange credit exceeds replacement total`)
  }
  const entry: ComputedReturn = {
    currencyVersion: 2,
    id: input.id,
    createdAt: input.createdAt,
    receiptId: receipt.id,
    receiptNumber: receipt.number,
    customerId: receipt.customerId,
    refunded: input.refunded,
    method: input.method,
    restock: input.restock,
    lines,
    ...(input.settlement ? { settlement: input.settlement, replacementLines: input.replacementLines ?? [], reason: input.reason, operator: input.operator } : {}),
  }
  if (input.note) entry.note = input.note
  return entry
}

/** The purchase bill total is summed from the line amounts on the server. */
export function computePurchaseTotal(lines: { total: number }[]): number {
  const total = lines.reduce((sum, line) => sum + line.total, 0)
  if (!Number.isSafeInteger(total) || total > 100_000_000) throw new ValidationError('Purchase total exceeds the allowed amount')
  return total
}
